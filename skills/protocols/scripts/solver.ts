// The whole-variant solver: seats every node of a variant from the user's
// approved assignments BEFORE anything launches, or reports exactly which node
// is unstaffed and why. Contract: references/models.md → "The broker" step 3
// and "Approval and staffing". Pure: no I/O.

import type { Model, Registry, Assignment } from "../../config/scripts/registry.ts";
import { ADAPTER_ACCESS, EFFORTS, HOST_MODEL, assignmentsFor, isJudgmentOnly, needsSandboxConsent } from "../../config/scripts/registry.ts";
import { SHIPPED_CLASSES, classKind, isProjectClassName } from "../../config/scripts/multimodel.ts";
import type { Node } from "./descriptor.ts";
import { isJudging } from "./descriptor.ts";

/** One seat to fill: a descriptor node, or a roster role expanded from a fan-out node. */
export type SeatRequest = {
  readonly id: string;                         // node id, or "<node id>/<roster stem>"
  readonly role: string;
  readonly class: string;                      // shipped or s-* (roster roles)
  readonly access: "repo" | "text";
  readonly host?: true;
  readonly raw?: true;
  readonly differentLineageFrom: readonly string[];
  readonly differentSessionFrom: readonly string[];
};

export type Host = { readonly lineage: string; readonly pin?: string; readonly hostSlug: "claude" | "codex" };

export type Policy = {
  readonly forbid: Readonly<Record<string, readonly string[]>>;
  readonly require: Readonly<Record<string, readonly string[]>>;
  readonly classes: Readonly<Record<string, string>>;   // s-* → shipped
};

export type Seat = {
  readonly id: string;
  readonly role: string;
  readonly class: string;
  readonly model: string;                      // registry id, or "host"
  readonly effort?: string;
  readonly lineage: string;
  readonly transport: Model["transport"] | "host";
  readonly access?: "repo" | "text";           // from the node; a sandboxed adapter reads a disposable copy for "repo"
  readonly session: "resume" | "fresh";
  readonly independent: boolean;               // this judging seat reached cross-lineage
  readonly uncalibrated?: true;                // generative model holding a judgment seat
};

export type Unstaffed = { readonly id: string; readonly class: string; readonly reason: string };

export type Plan = {
  readonly seats: readonly Seat[];
  readonly unstaffed: readonly Unstaffed[];
  readonly independence: "cross-lineage" | "same-lineage" | "none";
};

const matchesPolicy = (entry: string, m: Model | undefined, lineage: string): boolean =>
  entry.startsWith("lineage:") ? entry.slice(8) === lineage : m?.pin !== undefined && m.pin === entry;

const policyFor = (map: Readonly<Record<string, readonly string[]>>, req: SeatRequest): readonly string[] =>
  [...(map[req.role] ?? []), ...(map[req.class] ?? []), ...(map[req.id] ?? [])];

/** Why a candidate cannot take a seat — the first applicable reason, or undefined when eligible. */
const hostAsModel = (host: Host): Model => ({ lineage: host.lineage, transport: "native", host: host.hostSlug, alias: "host", ...(host.pin ? { pin: host.pin } : {}) });

const rejectReason = (req: SeatRequest, a: Assignment, m: Model | undefined, chosen: ReadonlyMap<string, Seat>, policy: Policy): string | undefined => {
  if (m === undefined) return `"${a.model}" is not an enrolled model`;
  const kind = classKind(req.class, policy.classes);
  if (kind === "generative" && isJudgmentOnly(m)) return `"${a.model}" is typed-judgment only`;
  if (req.access === "repo" && (m.transport === "http-chat" || m.transport === "http-typed")) return `"${a.model}" is an http seat and cannot read the repository`;
  if (req.access === "repo" && m.transport === "adapter" && !(ADAPTER_ACCESS[m.adapter ?? ""] ?? []).includes("repo")) return `"${a.model}" (${m.adapter}) is a text-only adapter and cannot read the repository`;
  if (req.access === "repo" && needsSandboxConsent(m)) return `"${a.model}" (${m.adapter}) reads the repository only in a sandboxed copy with the network open — not accepted yet (approve its row, or config --models consent ${a.model})`;
  if (policyFor(policy.forbid, req).some((e) => matchesPolicy(e, m, m.lineage))) return `"${a.model}" is forbidden by project policy`;
  const required = policyFor(policy.require, req);
  if (required.length > 0 && !required.some((e) => matchesPolicy(e, m, m.lineage))) return `"${a.model}" does not satisfy require (${required.join(", ")})`;
  const lineageClash = req.differentLineageFrom.map((id) => chosen.get(id)).filter((s): s is Seat => s !== undefined)
    .find((s) => m.lineage === "unknown" || s.lineage === "unknown" || s.lineage === m.lineage);
  if (lineageClash !== undefined) return `"${a.model}" shares lineage ${m.lineage} with ${lineageClash.id}${m.lineage === "unknown" || lineageClash.lineage === "unknown" ? " (unknown lineage never counts as independent)" : ""}`;
  return undefined;
};

const sessionFor = (req: SeatRequest, a: Assignment, chosen: ReadonlyMap<string, Seat>): "resume" | "fresh" =>
  req.differentSessionFrom.some((id) => chosen.get(id)?.model === a.model) ? "fresh" : "resume";

const seatOf = (req: SeatRequest, a: Assignment, m: Model, chosen: ReadonlyMap<string, Seat>, policy: Policy): Seat => ({
  id: req.id, role: req.role, class: req.class, model: a.model,
  ...(a.effort ? { effort: a.effort } : {}),
  lineage: m.lineage, transport: a.model === HOST_MODEL ? "host" : m.transport, access: req.access,
  session: sessionFor(req, a, chosen),
  independent: req.differentLineageFrom.length > 0 && req.differentLineageFrom.every((id) => {
    const s = chosen.get(id);
    return s !== undefined && s.lineage !== "unknown" && m.lineage !== "unknown" && s.lineage !== m.lineage;
  }),
  ...(classKind(req.class, policy.classes) === "judgment" && !isJudgmentOnly(m) ? { uncalibrated: true as const } : {}),
});

const hostSeat = (req: SeatRequest, host: Host): Seat => ({
  id: req.id, role: req.role, class: req.class, model: "host", lineage: host.lineage, transport: "host", session: "resume", independent: false,
});

/** Backtracking over the requests in order; the user's assignment order is the preference. */
const search = (
  requests: readonly SeatRequest[], i: number, chosen: ReadonlyMap<string, Seat>,
  registry: Registry, policy: Policy, host: Host, projectId: string | undefined,
): ReadonlyMap<string, Seat> | undefined => {
  if (i === requests.length) return chosen;
  const req = requests[i];
  if (req.host === true) return search(requests, i + 1, new Map([...chosen, [req.id, hostSeat(req, host)]]), registry, policy, host, projectId);
  const modelOf = (a: Assignment): Model | undefined => (a.model === HOST_MODEL ? hostAsModel(host) : registry.models[a.model]);
  const candidates = assignmentsFor(registry, req.class, projectId)
    .filter((a) => rejectReason(req, a, modelOf(a), chosen, policy) === undefined);
  return candidates.reduce<ReadonlyMap<string, Seat> | undefined>((found, a) =>
    found ?? search(requests, i + 1, new Map([...chosen, [req.id, seatOf(req, a, modelOf(a) as Model, chosen, policy)]]), registry, policy, host, projectId),
    undefined);
};

/** Diagnose the first node that cannot be staffed (greedy walk, reasons per candidate). */
const diagnose = (requests: readonly SeatRequest[], registry: Registry, policy: Policy, host: Host, projectId: string | undefined): readonly Unstaffed[] =>
  requests.reduce<{ chosen: Map<string, Seat>; out: Unstaffed[] }>((acc, req) => {
    if (acc.out.length > 0) return acc;
    if (req.host === true) return { chosen: new Map([...acc.chosen, [req.id, hostSeat(req, host)]]), out: acc.out };
    const all = assignmentsFor(registry, req.class, projectId);
    if (all.length === 0) {
      return { ...acc, out: [{ id: req.id, class: req.class, reason: `no approved model for class ${req.class}${isProjectClassName(req.class) && projectId === undefined ? " (project class, no project id)" : ""}` }] };
    }
    const modelOf = (a: Assignment): Model | undefined => (a.model === HOST_MODEL ? hostAsModel(host) : registry.models[a.model]);
    const reasons = all.map((a) => rejectReason(req, a, modelOf(a), acc.chosen, policy));
    const first = all.find((_, k) => reasons[k] === undefined);
    return first === undefined
      ? { ...acc, out: [{ id: req.id, class: req.class, reason: `${all.length} approved model(s) for ${req.class}, none eligible: ${reasons.filter((r): r is string => r !== undefined).join("; ")}` }] }
      : { chosen: new Map([...acc.chosen, [req.id, seatOf(req, first, modelOf(first) as Model, acc.chosen, policy)]]), out: acc.out };
  }, { chosen: new Map(), out: [] }).out;

export const independenceOf = (seats: readonly Seat[], requests: readonly SeatRequest[]): Plan["independence"] => {
  const judging = requests.filter((r) => r.differentLineageFrom.length > 0 || r.differentSessionFrom.length > 0);
  if (judging.length === 0) return "none";
  const byId = new Map(seats.map((s) => [s.id, s]));
  const allCross = judging.every((r) => r.differentLineageFrom.length > 0 && byId.get(r.id)?.independent === true);
  return allCross ? "cross-lineage" : "same-lineage";
};

export const solve = (requests: readonly SeatRequest[], registry: Registry, policy: Policy, host: Host, projectId?: string): Plan => {
  const found = search(requests, 0, new Map(), registry, policy, host, projectId);
  if (found === undefined) {
    return { seats: [], unstaffed: diagnose(requests, registry, policy, host, projectId), independence: "none" };
  }
  const seats = requests.map((r) => found.get(r.id) as Seat);
  return { seats, unstaffed: [], independence: independenceOf(seats, requests) };
};

export type RosterRole = { readonly stem: string; readonly category: string; readonly job: string };

/** A roster role fits a fan-out node when its job IS the node's class or an s-* class extending it. */
const fitsNode = (r: RosterRole, n: Node, projectClasses: Readonly<Record<string, string>>): boolean =>
  r.job === n.class || (isProjectClassName(r.job) && projectClasses[r.job] === n.class);

/**
 * Descriptor nodes → seat requests. A `roster:<category>` node fans out into
 * one request per matching roster role (id `<node>/<stem>`); a fan-out node
 * with no matching role yields no request — the skill reports "no roster
 * role for <node>" rather than seating nobody silently.
 */
export const requestsOf = (nodes: readonly Node[], roster: readonly RosterRole[] = [], projectClasses: Readonly<Record<string, string>> = {}): readonly SeatRequest[] =>
  nodes.flatMap((n) => {
    const base = { access: n.access, ...(n.raw ? { raw: true as const } : {}), differentLineageFrom: n.differentLineageFrom ?? [], differentSessionFrom: n.differentSessionFrom ?? [] };
    return n.role.startsWith("roster:")
      ? roster.filter((r) => `roster:${r.category}` === n.role && fitsNode(r, n, projectClasses))
          .map((r) => ({ id: `${n.id}/${r.stem}`, role: r.stem, class: r.job, ...base }))
      : [{ id: n.id, role: n.role, class: n.class, ...(n.host ? { host: true as const } : {}), ...base }];
  });

// ---------- proposal (unapproved classes) ----------

export type ProposalRow = {
  readonly class: string;
  readonly model: string;                      // registry id, "host", or "" when nothing is eligible
  readonly effort?: string;
  readonly seats: readonly string[];           // the seats this row fills once approved
  readonly flags: readonly string[];
  readonly candidates: readonly string[];      // every eligible id, preference order
  readonly consent?: "network-open";           // approving this row also records the model's sandbox consent
};

const SANDBOX_FLAG = "sandboxed copy, network open: the seat reads only your committable files (no .git, no ignored files such as .env) in a disposable copy the OS confines, but it can reach the internet — approving this row accepts that for this model";

const defaultEffort = (m: Model): string | undefined => {
  const allowed = m.transport === "adapter" ? EFFORTS[m.adapter ?? ""] : EFFORTS[m.transport];
  return allowed === undefined || allowed.length === 0 ? undefined : allowed.includes("high") ? "high" : allowed[allowed.length - 1];
};

/** The effort the user already approved for this model anywhere (their choice beats the default). */
const approvedEffort = (registry: Registry, id: string): string | undefined =>
  [...Object.values(registry.jobs).flat(), ...Object.values(registry.projects).flatMap((p) => Object.values(p.jobs).flat())]
    .find((a) => a.model === id && a.effort !== undefined)?.effort;

const eligibleFor = (cls: string, requests: readonly SeatRequest[], registry: Registry, policy: Policy, host: Host): readonly (readonly [string, Model])[] => {
  const kind = classKind(cls, policy.classes);
  const needsRepo = requests.some((r) => r.class === cls && r.access === "repo");
  return Object.entries(registry.models)
    .filter(([, m]) => !(kind === "generative" && isJudgmentOnly(m))
      && !(needsRepo && (m.transport === "http-chat" || m.transport === "http-typed"))
      && !(needsRepo && m.transport === "adapter" && !(ADAPTER_ACCESS[m.adapter ?? ""] ?? []).includes("repo")))
    // Preference: a typed-judgment model for a judgment class, then lineage ≠ host, then registry order.
    .sort(([, a], [, b]) =>
      (kind === "judgment" ? Number(isJudgmentOnly(b)) - Number(isJudgmentOnly(a)) : 0)
      || Number(a.lineage === host.lineage) - Number(b.lineage === host.lineage));
};

const withJobs = (registry: Registry, cls: string, list: readonly Assignment[], projectId: string | undefined): Registry =>
  isProjectClassName(cls)
    ? (projectId === undefined ? registry : { ...registry, projects: { ...registry.projects, [projectId]: { jobs: { ...(registry.projects[projectId]?.jobs ?? {}), [cls]: list } } } })
    : { ...registry, jobs: { ...registry.jobs, [cls]: list } };

const rowFlags = (id: string, m: Model | undefined, host: Host): readonly string[] => [
  ...(m?.transport === "native" ? ["native, version unverified"] : []),
  ...(m !== undefined && m.lineage === host.lineage ? ["same lineage as host"] : []),
  ...(m !== undefined && (m.transport === "http-chat" || m.transport === "http-typed") ? ["http: sends task text, paths, snippets, diffs and seat outputs off-machine"] : []),
  ...(id === HOST_MODEL ? ["run in this session's model"] : []),
  ...(id === "" ? ["no enrolled model is eligible — enrol one with config --models"] : []),
];

/**
 * For every class the variant needs and nobody has approved: the row SET that
 * staffs the whole variant (solved against every eligible candidate at once,
 * keeping only the rows the solver used), so one approval never leads to a
 * second gate. When no combination staffs it, the first candidate is proposed
 * and the row says so. Pure: no I/O.
 */
export const propose = (requests: readonly SeatRequest[], registry: Registry, policy: Policy, host: Host, projectId?: string): readonly ProposalRow[] => {
  const needed = [...new Set(requests.filter((r) => r.host !== true).map((r) => r.class))]
    .filter((cls) => assignmentsFor(registry, cls, projectId).length === 0);
  if (needed.length === 0) return [];
  const candidatesOf = (cls: string): readonly Assignment[] => {
    const kind = classKind(cls, policy.classes);
    const models = eligibleFor(cls, requests, registry, policy, host);
    return [
      ...models.map(([id, m]) => { const effort = approvedEffort(registry, id) ?? defaultEffort(m); return { model: id, ...(effort ? { effort } : {}) }; }),
      ...(kind === "generative" ? [{ model: HOST_MODEL }] : []),
    ];
  };
  // Solve as if every sandboxed model were accepted; the rows that use one on a repo seat ask for that consent.
  const consented: Registry = { ...registry, models: Object.fromEntries(Object.entries(registry.models)
    .map(([id, m]) => [id, needsSandboxConsent(m) ? { ...m, sandbox: "network-open" as const } : m])) };
  const hypothetical = needed.reduce((r, cls) => withJobs(r, cls, candidatesOf(cls), projectId), consented);
  const solved = solve(requests, hypothetical, policy, host, projectId);
  const staffs = solved.unstaffed.length === 0;
  // A host-only node (`host: true`) is seated by the descriptor, never by an approval — it is not a row.
  const approvable = (id: string): boolean => requests.some((r) => (r.id === id || id.startsWith(`${r.id}/`)) && r.host !== true);
  return needed.flatMap((cls) => {
    const cands = candidatesOf(cls);
    const used = cands.filter((c) => solved.seats.some((s) => approvable(s.id) && s.class === cls && s.model === c.model && (s.effort ?? undefined) === c.effort));
    // When nothing staffs the variant, still propose only a candidate that fills at least one seat; the host is never proposed for nothing.
    const fillsSomething = (c: Assignment): boolean => solved.seats.some((s) => approvable(s.id) && s.class === cls && s.model === c.model);
    const rows = staffs && used.length > 0 ? used : cands.filter(fillsSomething).slice(0, 1);
    const candidates = cands.map((c) => c.model);
    if (rows.length === 0) return [{ class: cls, model: "", seats: [], flags: [
      ...rowFlags("", undefined, host),
      ...(staffs ? [] : [`no combination of enrolled models staffs this variant: ${solved.unstaffed.map((u) => `${u.id} — ${u.reason}`).join("; ")}`]),
    ], candidates }];
    return rows.map((c) => {
      const seats = solved.seats.filter((s) => approvable(s.id) && s.class === cls && s.model === c.model).map((s) => s.id);
      const m = registry.models[c.model];
      const asksConsent = m !== undefined && needsSandboxConsent(m)
        && requests.some((r) => r.access === "repo" && seats.some((s) => s === r.id || s.startsWith(`${r.id}/`)));
      return {
      class: cls, model: c.model, ...(c.effort ? { effort: c.effort } : {}),
      seats,
      ...(asksConsent ? { consent: "network-open" as const } : {}),
      flags: [
        ...(asksConsent ? [SANDBOX_FLAG] : []),
        ...rowFlags(c.model, c.model === HOST_MODEL ? hostAsModel(host) : registry.models[c.model], host),
        ...(staffs ? [] : [`no combination of enrolled models staffs this variant: ${solved.unstaffed.map((u) => `${u.id} — ${u.reason}`).join("; ")}`]),
      ],
      candidates,
    }; });
  });
};

export { isJudging, SHIPPED_CLASSES };
