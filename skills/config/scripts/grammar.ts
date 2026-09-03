// The grammar layer — one source of truth for every NAME, TOKEN and SHAPE the
// supermodo skills parse, plus the record of which skill consumes which key.
//
// Three layers (see protocols/references/rules.md):
//   skeleton — that a thing exists and what it means .... SKILL.md, immovable
//   muscle   — what it is CALLED and what SHAPE it has .. this file + config
//   flesh    — which steps, in what order ............... .supermodo/rules/
//
// Config EXTENDS and RENAMES. It never REMOVES: a key listed in CONSUMED_BY
// cannot be blanked, because the failure would surface in a different skill
// (an empty board, a mis-derived semver bump) with nothing pointing back here.
//
// Imported by: librarian/scripts/docs-check.ts, librarian/scripts/docs-generate.ts,
// release/scripts/release-check.ts, config/scripts/config-check.ts.
// Asserted by: scripts/check.ts (prose defaults in docs-convention.md must match).

export type Json = string | number | boolean | null | readonly Json[] | { readonly [k: string]: Json };

// ---------------------------------------------------------------------------
// Defaults — today's hardcoded values, moved here verbatim.
// ---------------------------------------------------------------------------

export const DEFAULTS = {
  docs: {
    layout: {
      root: "docs",
      work: "work",
      decisions: "decisions",
      reference: "reference",
      archive: "archive",
      backlog: "work/BACKLOG.md",
      triad: { spec: "spec.md", plan: "plan.md", tasks: "tasks.md", findings: "findings.md" },
      program: { readme: "README.md", frontmatterKey: "program", initiativeDigits: 2 },
      adr: { prefix: "ADR-", digits: 4 },
      archivePrefix: "YYYY-MM",
      splitThresholdKb: 40,
    },
    grammar: {
      priority: {
        label: "Priority",
        // ORDERED: index 0 outranks index 1. Names are muscle, the order is skeleton.
        levels: ["P0", "P1", "P2", "P3"],
        separator: "—",
        requireClassification: true,
        unsetLevel: "P2",
      },
      prioritySource: { label: "Priority-source", derivedValue: "derived" },
      mixed: { label: "Mixed" },
      created: { label: "Created" },
      dependsOn: { label: "Depends on", backlogLabel: "depends" },
      promotion: { fromLabel: "Promoted-from", idsLabel: "Promoted-ids" },
      task: {
        markerPrefix: "task",
        // Four roles, always four. Characters are muscle; the partition is not.
        states: { pending: " ", inProgress: "/", done: ["x", "X"], paused: ["^", "-"] },
      },
      question: { markerPrefix: "question", heading: "Open questions" },
      generated: {
        fileMarker: "supermodo:generated",
        navStart: "supermodo:nav:start",
        navEnd: "supermodo:nav:end",
      },
      adrStatuses: {
        proposed: "proposed",
        accepted: "accepted",
        rejected: "rejected",
        supersededBy: "superseded-by",
      },
      finding: { requiredSections: ["severity", "evidence", "impact", "fix"] },
      // ADD-ONLY. A project's own required fields; never shadows a built-in label.
      extraRequired: { spec: [], backlog: [] },
    },
  },
  vcs: {
    commit: {
      types: ["feat", "fix", "refactor", "perf", "docs", "test", "chore", "build", "ci", "style", "revert"],
      minorTypes: ["feat"],          // everything else patches, unless breaking
      breakingMarker: "!",
      breakingFooter: "BREAKING CHANGE",
      subjectSoftCap: 50,
      subjectHardCap: 72,
    },
  },
  release: {
    // On 0.x, a breaking change demotes to minor. "strict" majors it instead.
    alphaPolicy: "demote",
  },
} as const;

// ---------------------------------------------------------------------------
// The floor — dotted key -> skills that parse it.
// A key here may be RENAMED freely and never blanked.
// ---------------------------------------------------------------------------

export const CONSUMED_BY: Readonly<Record<string, readonly string[]>> = {
  "docs.layout.work": ["librarian", "work", "flow", "next", "hunt"],
  "docs.layout.decisions": ["librarian"],
  "docs.layout.reference": ["librarian", "work"],
  "docs.layout.archive": ["librarian", "next"],
  "docs.layout.backlog": ["librarian", "next", "flow"],
  "docs.layout.triad.spec": ["librarian", "work", "flow", "next", "grill"],
  "docs.layout.triad.plan": ["librarian", "work", "flow", "grill"],
  "docs.layout.triad.tasks": ["librarian", "work", "flow", "next", "grill"],
  "docs.layout.triad.findings": ["librarian", "hunt"],
  "docs.layout.program.readme": ["librarian", "next"],
  "docs.layout.program.frontmatterKey": ["librarian"],
  "docs.layout.adr.prefix": ["librarian"],
  "docs.grammar.priority.label": ["next", "librarian"],
  "docs.grammar.priority.levels": ["next", "librarian"],
  "docs.grammar.prioritySource.label": ["next", "librarian"],
  "docs.grammar.mixed.label": ["next", "librarian"],
  "docs.grammar.created.label": ["next", "librarian"],
  "docs.grammar.dependsOn.label": ["next", "librarian"],
  "docs.grammar.dependsOn.backlogLabel": ["next", "librarian"],
  "docs.grammar.promotion.fromLabel": ["librarian"],
  "docs.grammar.promotion.idsLabel": ["librarian"],
  "docs.grammar.task.markerPrefix": ["work", "grill", "librarian", "next", "flow"],
  "docs.grammar.task.states": ["work", "next", "flow", "librarian"],
  "docs.grammar.question.markerPrefix": ["hunt", "tdd", "librarian"],
  "docs.grammar.question.heading": ["hunt", "tdd", "librarian"],
  "docs.grammar.generated.fileMarker": ["librarian", "config"],
  "docs.grammar.generated.navStart": ["librarian", "config"],
  "docs.grammar.generated.navEnd": ["librarian", "config"],
  "docs.grammar.adrStatuses": ["librarian"],
  "docs.grammar.finding.requiredSections": ["librarian", "hunt"],
  "vcs.commit.types": ["commit", "release"],
  "vcs.commit.minorTypes": ["release"],
  "vcs.commit.breakingMarker": ["commit", "release"],
  "vcs.commit.breakingFooter": ["commit", "release"],
};

// ---------------------------------------------------------------------------
// Resolution — defaults, overlaid by config. Merge only; a key is never dropped.
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const resolve = (defaults: unknown, override: unknown): unknown =>
  override === undefined
    ? defaults
    : isObj(defaults) && isObj(override)
      ? Object.fromEntries(
          Object.keys(defaults).map((k) => [k, resolve(defaults[k], override[k])]),
        )
      : override;

export const at = (root: unknown, dotted: string): unknown =>
  dotted
    .split(".")
    .reduce<unknown>((acc, k) => (isObj(acc) ? acc[k] : undefined), root);

// A value that is present but empty is a REMOVAL, which the floor forbids.
const isBlank = (v: unknown): boolean =>
  v === null
  || v === ""
  || (Array.isArray(v) && v.length === 0)
  || (isObj(v) && Object.keys(v).length === 0);

// Every dotted path at or under `value` whose content is blank. A consumed
// key names a SUBTREE: `docs.grammar.task.states` is four roles, and blanking
// `states.done` removes exactly what the key exists to provide — a checklist
// with no way to say "done" — while the key itself still looks populated.
const blankPaths = (value: unknown, path: string): readonly string[] =>
  isBlank(value) ? [path]
  : isObj(value) ? Object.entries(value).flatMap(([k, v]) => blankPaths(v, `${path}.${k}`))
  : [];

/** Keys — or children of keys — a config blanked out that some skill still parses. Empty = fine. */
export const floorViolations = (resolved: unknown): readonly string[] =>
  Object.entries(CONSUMED_BY)
    .flatMap(([key, skills]) => blankPaths(at(resolved, key), key).map((path) => [path, skills] as const))
    .map(([path, skills]) =>
      `${path}: must not be empty — it is renameable, not removable. Parsed by: ${skills.join(", ")}.`,
    );

