// Solver probe — run by scripts/check.ts. Exits 0 when every expectation holds;
// prints each failure otherwise. Pure (no registry on disk).
import { solve, requestsOf, propose } from "../../skills/protocols/scripts/solver.ts";

const registry = {
  registryVersion: 1,
  models: {
    astra: { lineage: "openai", transport: "adapter", adapter: "codex", pin: "gpt-6-astra" },
    sol: { lineage: "openai", transport: "adapter", adapter: "codex", pin: "gpt-5.6-sol" },
    opus5: { lineage: "anthropic", transport: "adapter", adapter: "claude", pin: "claude-opus-5" },
    jev: { lineage: "typesafe", transport: "http-typed", endpoint: "https://api.typesafe.ai/v1/systemone", keyEnv: "TYPESAFE_API_KEY", pin: "jev-1.13.0" },
    mystery: { lineage: "unknown", transport: "http-chat", endpoint: "https://e.invalid/v1", keyEnv: "SUPERMODO_X", pin: "m" },
  },
  jobs: {
    lead: [{ model: "astra", effort: "xhigh" }, { model: "opus5", effort: "medium" }],
    adversary: [{ model: "astra", effort: "xhigh" }],
    judgment: [{ model: "jev" }],
    "leg-work": [{ model: "mystery" }],
  },
  projects: {},
  decisions: {},
};
const policy = { forbid: {}, require: {}, classes: {} };
const host = { lineage: "anthropic", hostSlug: "claude" };

const nodes = (list) => list.map((n) => ({ inputs: ["brief"], access: "repo", ...n }));

const cases = [
  {
    name: "[A,B] planner / [A] adversary resolves to B→A instead of dead-ending",
    requests: requestsOf(nodes([
      { id: "plan", role: "planner", class: "lead" },
      { id: "attack", role: "adversary", class: "adversary", differentLineageFrom: ["plan"] },
    ])),
    expect: (p) => p.unstaffed.length === 0 && p.seats[0].model === "opus5" && p.seats[1].model === "astra" && p.independence === "cross-lineage",
  },
  {
    name: "host implementer + adversary of another lineage → cross-lineage",
    requests: requestsOf(nodes([
      { id: "impl", role: "implementer", class: "code-generation", host: true },
      { id: "review", role: "reviewer", class: "adversary", differentLineageFrom: ["impl"], raw: true },
    ])),
    expect: (p) => p.unstaffed.length === 0 && p.seats[1].model === "astra" && p.seats[1].independent && p.independence === "cross-lineage",
  },
  {
    name: "unstaffed: adversary only has the planner's lineage → reason names the clash",
    requests: requestsOf(nodes([
      { id: "plan", role: "planner", class: "lead" },
      { id: "attack", role: "adversary", class: "adversary", differentLineageFrom: ["plan"] },
    ])),
    registry: { ...registry, jobs: { ...registry.jobs, lead: [{ model: "astra", effort: "xhigh" }] } },
    expect: (p) => p.unstaffed.length === 1 && p.unstaffed[0].id === "attack" && /shares lineage openai with plan/.test(p.unstaffed[0].reason),
  },
  {
    name: "same-lineage variant: fresh session of the host's lineage, never independent",
    requests: requestsOf(nodes([
      { id: "impl", role: "implementer", class: "code-generation", host: true },
      { id: "review", role: "reviewer", class: "adversary", differentSessionFrom: ["impl"] },
    ])),
    registry: { ...registry, jobs: { ...registry.jobs, adversary: [{ model: "opus5", effort: "medium" }] } },
    expect: (p) => p.unstaffed.length === 0 && p.seats[1].model === "opus5" && !p.seats[1].independent && p.independence === "same-lineage",
  },
  {
    name: "no judging seat → independence none",
    requests: requestsOf(nodes([{ id: "impl", role: "implementer", class: "code-generation", host: true }])),
    expect: (p) => p.independence === "none" && p.seats[0].model === "host",
  },
  {
    name: "unknown lineage never counts as independent",
    requests: requestsOf(nodes([
      { id: "plan", role: "planner", class: "lead" },
      { id: "attack", role: "adversary", class: "adversary", differentLineageFrom: ["plan"], access: "text" },
    ])),
    registry: { ...registry, jobs: { ...registry.jobs, adversary: [{ model: "mystery" }] } },
    expect: (p) => p.unstaffed.length === 1 && /unknown lineage never counts/.test(p.unstaffed[0].reason),
  },
  {
    name: "project forbid by lineage removes the only candidate → unstaffed names the policy",
    requests: requestsOf(nodes([{ id: "plan", role: "planner", class: "lead" }])),
    policy: { forbid: { planner: ["lineage:openai", "claude-opus-5"] }, require: {}, classes: {} },
    expect: (p) => p.unstaffed.length === 1 && /forbidden by project policy/.test(p.unstaffed[0].reason),
  },
  {
    name: "http seat cannot take a repo-reading node",
    requests: requestsOf(nodes([{ id: "scan", role: "finder", class: "leg-work" }])),
    expect: (p) => p.unstaffed.length === 1 && /cannot read the repository/.test(p.unstaffed[0].reason),
  },
  {
    name: "generative model on a judgment node is seated but uncalibrated",
    requests: requestsOf(nodes([{ id: "route", role: "router", class: "judgment", access: "text" }])),
    registry: { ...registry, jobs: { ...registry.jobs, judgment: [{ model: "opus5", effort: "low" }] } },
    expect: (p) => p.unstaffed.length === 0 && p.seats[0].uncalibrated === true,
  },
  {
    name: "roster fan-out: two reviewer roles, both seated, an s-class extending adversary fits",
    requests: requestsOf(
      nodes([{ id: "impl", role: "implementer", class: "code-generation", host: true }, { id: "review", role: "roster:reviewers", class: "adversary", differentLineageFrom: ["impl"], raw: true }]),
      [{ stem: "api", category: "reviewers", job: "adversary" }, { stem: "sec", category: "reviewers", job: "s-security-audit" }, { stem: "builder", category: "implementers", job: "code-generation" }],
      { "s-security-audit": "adversary" }),
    registry: { ...registry, projects: { p1: { jobs: { "s-security-audit": [{ model: "sol", effort: "xhigh" }] } } } },
    policy: { forbid: {}, require: {}, classes: { "s-security-audit": "adversary" } },
    projectId: "p1",
    expect: (p) => p.unstaffed.length === 0 && p.seats.length === 3 && p.seats[1].id === "review/api" && p.seats[2].id === "review/sec" && p.seats[2].model === "sol",
  },
];

// Proposal: the row SET that staffs the whole variant, never one row per class.
const grillStandard = requestsOf(nodes([
  { id: "plan-a", role: "planner", class: "lead" },
  { id: "plan-b", role: "planner", class: "lead", differentLineageFrom: ["plan-a"] },
  { id: "attack-a", role: "adversary", class: "adversary", inputs: ["plan-b"], raw: true, differentLineageFrom: ["plan-b"] },
  { id: "attack-b", role: "adversary", class: "adversary", inputs: ["plan-a"], raw: true, differentLineageFrom: ["plan-a"] },
]));
const proposalCases = [
  {
    name: "lead=[astra, host], no adversary → two adversary rows of different lineages, each naming its seat, with the user's xhigh reused",
    registry: { ...registry, jobs: { lead: [{ model: "astra", effort: "xhigh" }, { model: "host" }] } },
    expect: (rows) => rows.length === 2 && rows.every((r) => r.class === "adversary" && r.seats.length === 1 && r.flags.every((f) => !f.startsWith("no combination")))
      && new Set(rows.map((r) => registry.models[r.model]?.lineage ?? "anthropic")).size === 2
      && rows.some((r) => r.model === "astra" && r.effort === "xhigh"),
  },
  {
    name: "only one lineage enrolled → the row says no combination staffs the variant",
    registry: { ...registry, models: { astra: registry.models.astra, sol: registry.models.sol }, jobs: { lead: [{ model: "astra", effort: "xhigh" }, { model: "sol", effort: "xhigh" }] } },
    expect: (rows) => rows.length === 1 && rows[0].flags.some((f) => f.startsWith("no combination")),
  },
  {
    name: "everything approved → no proposal",
    registry: { ...registry, jobs: { lead: [{ model: "astra", effort: "xhigh" }, { model: "opus5", effort: "medium" }], adversary: [{ model: "sol", effort: "xhigh" }, { model: "opus5", effort: "medium" }] } },
    expect: (rows) => rows.length === 0,
  },
];
const huntStandard = requestsOf(nodes([
  { id: "find", role: "finder", class: "leg-work", host: true },
  { id: "find-x", role: "finder", class: "leg-work", differentLineageFrom: ["find"] },
  { id: "skeptic", role: "skeptic", class: "adversary", inputs: ["find", "find-x"], host: true, raw: true },
  { id: "cross-check", role: "verifier", class: "adversary", inputs: ["find", "find-x"], raw: true, differentLineageFrom: ["find", "skeptic"] },
]));
proposalCases.push({
  name: "a host-only node never becomes a proposal row: hunt with adversary unapproved proposes one cross-check row, no skeptic row",
  requests: huntStandard,
  registry: { ...registry, jobs: { "leg-work": [{ model: "sol", effort: "medium" }, { model: "host" }] } },
  expect: (rows) => rows.length === 1 && rows[0].class === "adversary" && rows[0].seats.length === 1 && rows[0].seats[0] === "cross-check" && rows[0].model !== "host",
});
proposalCases.push({
  name: "no eligible model at all → one empty row that says so, never the host proposed for nothing",
  requests: grillStandard,
  registry: { ...registry, models: {}, jobs: {} },
  expect: (rows) => rows.length === 2 && rows.every((r) => r.model === "" && r.seats.length === 0 && r.flags.some((f) => f.startsWith("no enrolled model is eligible"))),
});
// A sandboxed adapter (agy) holds a repo seat only with the user's network-open consent.
const flash = { lineage: "google", transport: "adapter", adapter: "agy", pin: "gemini-3.8-flash-medium" };
const council = requestsOf(nodes([
  { id: "investigate-a", role: "investigator", class: "lead", host: true },
  { id: "investigate-b", role: "investigator", class: "lead", differentLineageFrom: ["investigate-a"] },
  { id: "investigate-c", role: "investigator", class: "lead", differentLineageFrom: ["investigate-a", "investigate-b"] },
]));
const three = { ...registry, models: { astra: registry.models.astra, flash }, jobs: {} };
cases.push({
  name: "agy approved for lead but no consent → a repo seat stays unstaffed and the reason names the consent",
  requests: council, registry: { ...three, jobs: { lead: [{ model: "host" }, { model: "astra", effort: "high" }, { model: "flash" }] } },
  expect: (p) => p.unstaffed.length === 1 && p.unstaffed[0].reason.includes("network open"),
});
cases.push({
  name: "agy with sandbox consent → the third lineage staffs the council, seat carries access repo",
  requests: council, registry: { ...three, models: { ...three.models, flash: { ...flash, sandbox: "network-open" } }, jobs: { lead: [{ model: "host" }, { model: "astra", effort: "high" }, { model: "flash" }] } },
  expect: (p) => p.unstaffed.length === 0 && p.seats.some((s) => s.model === "flash" && s.access === "repo"),
});
proposalCases.push({
  name: "lead unapproved, agy enrolled without consent → its row fills a repo seat, asks for the consent and says network open",
  requests: council, registry: three,
  expect: (rows) => rows.some((r) => r.model === "flash" && r.consent === "network-open" && r.flags.some((f) => f.includes("network open")))
    && rows.every((r) => !r.flags.some((f) => f.startsWith("no combination"))),
});
const proposalFailures = proposalCases.flatMap((c) => {
  const rows = propose(c.requests ?? grillStandard, c.registry, policy, host);
  return c.expect(rows) ? [] : [`${c.name}\n    got ${JSON.stringify(rows)}`];
});

const failures = cases.flatMap((c) => {
  const plan = solve(c.requests, c.registry ?? registry, c.policy ?? policy, host, c.projectId);
  return c.expect(plan) ? [] : [`${c.name}\n    got ${JSON.stringify(plan)}`];
});
[...failures, ...proposalFailures].forEach((f) => console.error(`solver-probe: FAIL ${f}`));
console.log(`solver-probe: ${cases.length + proposalCases.length - failures.length - proposalFailures.length}/${cases.length + proposalCases.length} cases hold`);
process.exit(failures.length + proposalFailures.length === 0 ? 0 : 1);
