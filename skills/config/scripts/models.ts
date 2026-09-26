// `config --models` — the ONLY writer of the per-user model registry.
// Contract: skills/protocols/references/models.md.
//
// Usage (Node ≥ 22.18):
//   node models.ts show [--project-root <dir>]
//   node models.ts project-id [--project-root <dir>]
//   node models.ts enrol <id> --lineage <slug> --transport adapter --adapter claude|codex --pin <id>
//   node models.ts enrol <id> --lineage <slug> --transport http-chat|http-typed --endpoint <https url> --key-env <NAME> --pin <id>
//   node models.ts enrol <id> --lineage <slug> --transport native --host claude|codex --alias <alias>
//   node models.ts edit <id> [--pin <id>] [--lineage <slug>] [--endpoint <url>] [--key-env <NAME>]
//   node models.ts remove <id>
//   node models.ts assign <class> <id> [--effort <level>] [--project-root <dir>]      (approve ONE row)
//   node models.ts unassign <class> <id> [--effort <level>] [--project-root <dir>]
//   node models.ts decline <class> <id> [--effort <level>] [--project-root <dir>]
//   node models.ts approve <proposal.json> [--project-root <dir>]                       (approve a TABLE)
//   node models.ts consent <id> [--revoke]    (a sandboxed adapter, e.g. agy: accept repo seats with the network open)
//   node models.ts --accept-proposed <proposal.json> [--project-root <dir>]             (same, explicit bulk escape)
//   node models.ts guide <id> [<file> | -]                                              (show | write ≤ 4 KB)
// Every write is validated, strict JSON, temp-then-rename, inside the registry dir.
// Env: SUPERMODO_REGISTRY_DIR overrides the registry location (tests, CI).

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseJsonc } from "./jsonc.ts";
import { isProjectClassName, isShippedClass, projectClassMap } from "./multimodel.ts";
import {
  type Assignment, type Registry, type Transport, EMPTY_REGISTRY, HOST_MODEL, assignmentsFor, checkRegistry, decisionKey,
  SANDBOXED_REPO_ADAPTERS, poolHash, readGuide, readRegistry, registryDir, writeGuide, writeRegistry,
} from "./registry.ts";

type Args = { readonly positional: readonly string[]; readonly flags: Readonly<Record<string, string | true>> };

const parseArgs = (argv: readonly string[]): Args =>
  argv.reduce<Args>((acc, a, i, all) => {
    if (a.startsWith("--")) {
      const next = all[i + 1];
      const takesValue = next !== undefined && !next.startsWith("--");
      return { ...acc, flags: { ...acc.flags, [a.slice(2)]: takesValue ? next : true } };
    }
    const prev = all[i - 1];
    return prev !== undefined && prev.startsWith("--") && !a.startsWith("--") && !["show", "project-id", "enrol", "edit", "remove", "assign", "unassign", "decline", "approve", "consent", "guide"].includes(a) && i > 0 && acc.positional.length > 0 && acc.flags[prev.slice(2)] === a
      ? acc
      : { ...acc, positional: [...acc.positional, a] };
  }, { positional: [], flags: {} });

const str = (v: string | true | undefined): string | undefined => (typeof v === "string" ? v : undefined);

const today = (): string => new Date().toISOString().slice(0, 10);

/** The project's identity for project-scoped assignments: `project.name`, else a hash of the canonical root path. */
export const projectIdFor = (root: string): { id: string; source: "project.name" | "path-hash" } => {
  const cfgPath = resolve(root, "skills.config.json");
  const name = ((): string | undefined => {
    try {
      const cfg = parseJsonc(readFileSync(cfgPath, "utf8")) as { project?: { name?: unknown } };
      return typeof cfg?.project?.name === "string" && cfg.project.name.length > 0 ? cfg.project.name : undefined;
    } catch { return undefined; }
  })();
  return name !== undefined
    ? { id: name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, ""), source: "project.name" }
    : { id: createHash("sha256").update(resolve(root)).digest("hex").slice(0, 16), source: "path-hash" };
};

const projectClassesFor = (root: string): Readonly<Record<string, string>> => {
  try {
    const cfg = parseJsonc(readFileSync(resolve(root, "skills.config.json"), "utf8")) as { multimodel?: { classes?: unknown } };
    return projectClassMap(cfg?.multimodel?.classes as never);
  } catch { return {}; }
};

const fail = (msg: string): never => { throw new Error(msg); };

const withModel = (r: Registry, id: string, m: Registry["models"][string]): Registry =>
  ({ ...r, models: { ...r.models, [id]: m } });

const withoutModel = (r: Registry, id: string): Registry => ({
  ...r,
  models: Object.fromEntries(Object.entries(r.models).filter(([k]) => k !== id)),
  jobs: Object.fromEntries(Object.entries(r.jobs).map(([c, l]) => [c, l.filter((a) => a.model !== id)])),
  projects: Object.fromEntries(Object.entries(r.projects).map(([p, v]) => [p, { jobs: Object.fromEntries(Object.entries(v.jobs).map(([c, l]) => [c, l.filter((a) => a.model !== id)])) }])),
  decisions: Object.fromEntries(Object.entries(r.decisions).filter(([k]) => k.split("|")[1] !== id)),
});

const sameAssignment = (a: Assignment, b: Assignment): boolean => a.model === b.model && (a.effort ?? "") === (b.effort ?? "");

const withAssignment = (r: Registry, cls: string, a: Assignment, projectId: string): Registry => {
  const current = assignmentsFor(r, cls, projectId);
  const next = current.some((x) => sameAssignment(x, a)) ? current : [...current, a];
  const decisions = Object.fromEntries(Object.entries(r.decisions).filter(([k]) => k !== decisionKey(cls, a.model, a.effort)));
  return isProjectClassName(cls)
    ? { ...r, decisions, projects: { ...r.projects, [projectId]: { jobs: { ...(r.projects[projectId]?.jobs ?? {}), [cls]: next } } } }
    : { ...r, decisions, jobs: { ...r.jobs, [cls]: next } };
};

const withoutAssignment = (r: Registry, cls: string, a: Assignment, projectId: string): Registry => {
  const next = assignmentsFor(r, cls, projectId).filter((x) => !sameAssignment(x, a));
  return isProjectClassName(cls)
    ? { ...r, projects: { ...r.projects, [projectId]: { jobs: { ...(r.projects[projectId]?.jobs ?? {}), [cls]: next } } } }
    : { ...r, jobs: { ...r.jobs, [cls]: next } };
};

const withDecline = (r: Registry, cls: string, a: Assignment): Registry =>
  ({ ...r, decisions: { ...r.decisions, [decisionKey(cls, a.model, a.effort)]: { declined: today(), poolHash: poolHash(r) } } });

const requireClass = (cls: string, projectClasses: Readonly<Record<string, string>>): string =>
  isShippedClass(cls) || (isProjectClassName(cls) && projectClasses[cls] !== undefined) ? cls
    : fail(`"${cls}" is not a shipped class nor a project class declared in skills.config.json → multimodel.classes`);

const show = (r: Registry, dir: string, projectId: string): string => [
  `registry: ${dir} (pool ${poolHash(r)})`,
  "models:",
  ...Object.entries(r.models).map(([id, m]) => `  ${id.padEnd(16)} ${m.lineage.padEnd(10)} ${m.transport.padEnd(10)} ${m.transport === "adapter" ? m.adapter : m.transport === "native" ? `${m.host}:${m.alias}` : m.endpoint} ${m.pin ?? "(unpinned alias)"}`),
  "assignments (global):",
  ...Object.entries(r.jobs).map(([c, l]) => `  ${c.padEnd(16)} ${l.map((a) => a.effort ? `${a.model}@${a.effort}` : a.model).join(", ") || "(none)"}`),
  ...(r.projects[projectId] ? [`assignments (project ${projectId}):`, ...Object.entries(r.projects[projectId].jobs).map(([c, l]) => `  ${c.padEnd(16)} ${l.map((a) => a.effort ? `${a.model}@${a.effort}` : a.model).join(", ") || "(none)"}`)] : []),
  ...(Object.keys(r.decisions).length > 0 ? ["declined:", ...Object.entries(r.decisions).map(([k, d]) => `  ${k}  (${d.declined}, pool ${d.poolHash})`)] : []),
].join("\n");

type Proposal = { readonly rows: readonly { readonly class: string; readonly model: string; readonly effort?: string; readonly consent?: string }[] };

/** Record (or revoke) a sandboxed adapter's network-open consent. */
const withConsent = (r: Registry, id: string, on: boolean): Registry => {
  const m = r.models[id] ?? fail(`consent: no enrolled model "${id}"`);
  if (m.transport !== "adapter" || !SANDBOXED_REPO_ADAPTERS.includes(m.adapter ?? "")) return fail(`consent: "${id}" is not a sandboxed adapter (${SANDBOXED_REPO_ADAPTERS.join(" | ")}) — its read-only mode is native`);
  const { sandbox: _drop, ...rest } = m;
  return withModel(r, id, on ? { ...rest, sandbox: "network-open" } : rest);
};

const readProposal = (file: string): Proposal => {
  const p = parseJsonc(readFileSync(file, "utf8")) as Proposal;
  if (!Array.isArray(p?.rows)) return fail(`${file}: proposal needs a "rows" array of { class, model, effort? }`);
  return p;
};

const run = (argv: readonly string[]): string => {
  const { positional, flags } = parseArgs(argv);
  const dir = registryDir();
  const root = resolve(str(flags["project-root"]) ?? ".");
  const projectClasses = projectClassesFor(root);
  const { id: projectId, source } = projectIdFor(root);
  const loaded = readRegistry(dir, projectClasses);
  if (loaded.errors.length > 0) return fail(`registry invalid — fix it by hand or delete it:\n${loaded.errors.join("\n")}`);
  const r = loaded.registry ?? EMPTY_REGISTRY;
  const [cmd, a1, a2] = positional;
  const effort = str(flags.effort);

  if (flags["accept-proposed"] !== undefined || cmd === "approve") {
    const file = str(flags["accept-proposed"]) ?? a1 ?? fail("approve: proposal file required");
    const proposal = readProposal(resolve(file));
    const next = proposal.rows.reduce((acc, row) => {
      const assigned = withAssignment(acc, requireClass(row.class, projectClasses), { model: row.model, ...(row.effort ? { effort: row.effort } : {}) }, projectId);
      return row.consent === "network-open" ? withConsent(assigned, row.model, true) : assigned;
    }, r);
    const out = writeRegistry(next, dir);
    return `approved ${proposal.rows.length} row(s) → ${out}`;
  }
  switch (cmd) {
    case "show": return show(r, dir, projectId);
    case "project-id": return `${projectId} (${source})`;
    case "enrol": {
      const id = a1 ?? fail("enrol: model id required");
      if (r.models[id] !== undefined) return fail(`enrol: "${id}" already enrolled — use edit`);
      const transport = str(flags.transport) as Transport | undefined ?? fail("enrol: --transport required");
      const m = {
        lineage: str(flags.lineage) ?? fail("enrol: --lineage required"),
        transport,
        ...(str(flags.adapter) ? { adapter: str(flags.adapter) } : {}),
        ...(str(flags.endpoint) ? { endpoint: str(flags.endpoint) } : {}),
        ...(str(flags["key-env"]) ? { keyEnv: str(flags["key-env"]) } : {}),
        ...(str(flags.pin) ? { pin: str(flags.pin) } : {}),
        ...(str(flags.host) ? { host: str(flags.host) } : {}),
        ...(str(flags.alias) ? { alias: str(flags.alias) } : {}),
      };
      const out = writeRegistry(withModel(r, id, m), dir);
      return `enrolled ${id} → ${out}`;
    }
    case "edit": {
      const id = a1 ?? fail("edit: model id required");
      const m = r.models[id] ?? fail(`edit: no enrolled model "${id}"`);
      const patch = Object.fromEntries((["pin", "lineage", "endpoint", "key-env"] as const)
        .filter((k) => str(flags[k]) !== undefined)
        .map((k) => [k === "key-env" ? "keyEnv" : k, str(flags[k])]));
      if (Object.keys(patch).length === 0) return fail("edit: nothing to change (--pin, --lineage, --endpoint, --key-env)");
      const out = writeRegistry(withModel(r, id, { ...m, ...patch }), dir);
      return `edited ${id} (${Object.keys(patch).join(", ")}) → ${out}`;
    }
    case "remove": {
      const id = a1 ?? fail("remove: model id required");
      if (r.models[id] === undefined) return fail(`remove: no enrolled model "${id}"`);
      const out = writeRegistry(withoutModel(r, id), dir);
      return `removed ${id} and its assignments → ${out}`;
    }
    case "assign": case "unassign": case "decline": {
      const cls = requireClass(a1 ?? fail(`${cmd}: class required`), projectClasses);
      const id = a2 ?? fail(`${cmd}: model id required`);
      if (id !== HOST_MODEL && r.models[id] === undefined) return fail(`${cmd}: no enrolled model "${id}" (use "${HOST_MODEL}" for the session model)`);
      const assignment: Assignment = { model: id, ...(effort ? { effort } : {}) };
      const next = cmd === "assign" ? withAssignment(r, cls, assignment, projectId)
        : cmd === "unassign" ? withoutAssignment(r, cls, assignment, projectId)
        : withDecline(withoutAssignment(r, cls, assignment, projectId), cls, assignment);
      const out = writeRegistry(next, dir);
      return `${cmd} ${cls} ← ${effort ? `${id}@${effort}` : id}${isProjectClassName(cls) ? ` (project ${projectId})` : ""} → ${out}`;
    }
    case "consent": {
      const id = a1 ?? fail("consent: model id required");
      const out = writeRegistry(withConsent(r, id, flags.revoke === undefined), dir);
      return flags.revoke === undefined
        ? `${id}: repo seats run sandboxed with the network open (accepted) → ${out}`
        : `${id}: consent revoked — text seats only → ${out}`;
    }
    case "guide": {
      const id = a1 ?? fail("guide: model id required");
      if (a2 === undefined) return readGuide(id, dir) ?? `(no guide for ${id})`;
      const text = a2 === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(a2), "utf8");
      return `guide ${id} → ${writeGuide(id, text, dir, r)}`;
    }
    default:
      return fail("usage: models.ts show | project-id | enrol | edit | remove | assign | unassign | decline | approve <file> | --accept-proposed <file> | consent <id> [--revoke] | guide");
  }
};

const main = (): number => {
  try {
    console.log(run(process.argv.slice(2)));
    return 0;
  } catch (e) {
    console.error(`config --models: ${(e as Error).message}`);
    return 1;
  }
};

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith("models.ts")) process.exit(main());

// Exposed for check.ts: validates a registry file without writing.
export const validateRegistryFile = (file: string, projectClasses: Readonly<Record<string, string>> = {}): string[] => {
  if (!existsSync(file)) return [`${file}: missing`];
  try { return checkRegistry(parseJsonc(readFileSync(file, "utf8")) as never, projectClasses); } catch (e) { return [`${file}: ${(e as Error).message}`]; }
};
