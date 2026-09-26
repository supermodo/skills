// supermodo config-check — zero-dependency validator for skills.config.json (v1).
// Usage: node config-check.ts [path/to/skills.config.json]   (Node ≥ 22.18)
// Exit 0 = valid; exit 1 = invalid (errors on stderr, one per line).

import { readFileSync } from "node:fs";
import { DEFAULTS, at, floorViolations, resolve } from "./grammar.ts";
import { parseJsonc } from "./jsonc.ts";
import { checkMultimodel } from "./multimodel.ts";
import { dangerousPattern } from "./regex-safety.ts";


type Json = unknown;
type Obj = Record<string, Json>;

const isObj = (v: Json): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: Json): v is string => typeof v === "string" && v.length > 0;
const isArgv = (v: Json): boolean =>
  Array.isArray(v) && v.length > 0 && v.every(isStr);
const isPath = (v: Json): boolean =>
  isStr(v) && !v.startsWith("/") && !v.startsWith("-") &&
  !v.split("/").includes("..") && !v.includes("\\");
// Git refs/prefixes end up in git commands: never option-shaped ("-…"),
// never whitespace/control/ref-forbidden characters, and branch names must
// also satisfy git's ref-format rules (no "..", "//", "@{", .lock suffix,
// leading/trailing "/" or ".").
// git permits ; $ & | < > ( ) ! ' " ` in a ref name; a shell reads every one
// of them as syntax, and these values are composed into commands written to be
// pasted. `dev;id>/tmp/PWNED` is a branch git creates without complaint.
const GIT_UNSAFE = /[\s~^:?*[\\\x00-\x1f;$&|<>()!'"`]/;
// Per git-check-ref-format: rules apply PER slash-separated component.
const isGitRef = (v: Json): boolean =>
  isStr(v) && !v.startsWith("-") && !GIT_UNSAFE.test(v) &&
  !v.includes("..") && !v.includes("@{") && !v.endsWith(".") &&
  v.split("/").every((seg) =>
    seg.length > 0 && !seg.startsWith(".") && !seg.endsWith(".lock"));
const isTagPrefix = (v: Json): boolean =>
  typeof v === "string" && !v.startsWith("-") && !GIT_UNSAFE.test(v);

const unknownKeys = (obj: Obj, allowed: readonly string[], ctx: string): string[] =>
  Object.keys(obj)
    .filter((k) => !allowed.includes(k))
    .map((k) => `${ctx}: unknown field "${k}"`);

const checkVersion = (v: Json): string[] => {
  if (v === undefined) return ["configVersion: required"];
  if (v === 1) return [];
  const direction = typeof v === "number" && v < 1
    ? "run `config --upgrade`"
    : "update the installed supermodo skills";
  return [`configVersion: expected 1, got ${JSON.stringify(v)} — ${direction}`];
};

const checkProject = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["project: object expected"] : [
    ...unknownKeys(v, ["name"], "project"),
    ...(v.name !== undefined && !isStr(v.name) ? ["project.name: non-empty string"] : []),
  ];

const checkDocs = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["docs: object expected"] : [
    ...unknownKeys(v, ["entry", "conventions", "layout", "grammar"], "docs"),
    ...(["entry", "conventions"] as const)
      .filter((k) => v[k] !== undefined && !(isPath(v[k]) && (v[k] as string).endsWith(".md")))
      .map((k) => `docs.${k}: project-root-relative POSIX path to a .md file, no ".."`),
  ];

const COMMAND_KEYS = [
  "test", "testUnit", "testAll", "lint", "coverage", "mutation",
  "docsCheck", "docsGenerate",
] as const;

const checkCommands = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["commands: object expected"] : [
    ...unknownKeys(v, [...COMMAND_KEYS], "commands"),
    ...COMMAND_KEYS
      .filter((k) => v[k] !== undefined && !isArgv(v[k]))
      .map((k) => `commands.${k}: must be a non-empty array of strings (argv array, never a shell string)`),
  ];

const checkWorkspace = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["workspace: object expected"] : [
    ...unknownKeys(v, ["worktree"], "workspace"),
    ...(v.worktree !== undefined && typeof v.worktree !== "boolean"
      ? ["workspace.worktree: boolean"] : []),
  ];

const checkCoverage = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["coverage: object expected"] : [
    ...unknownKeys(v, ["target"], "coverage"),
    ...(v.target !== undefined &&
        (!Number.isInteger(v.target) || (v.target as number) < 1 || (v.target as number) > 100)
      ? ["coverage.target: integer 1-100"] : []),
  ];

// `agents.hosts` USED to list the hosts whose native agent dirs sync-configs
// mirrored the roster into. Roster roles are never mirrored any more: a role
// runs only through the broker, so nothing can launch it on the harness
// default model behind the user's approvals (models.md → Migration).
const REMOVED_AGENTS: readonly (readonly [string, string])[] = [
  ["hosts",
    "agents.hosts is removed. Roster roles are no longer mirrored into a host's native agents directory — a role declares the engine class it needs (`job:`) and runs only through the broker, so nothing can run it on a harness default model behind your approvals. Delete this key; sync-configs still syncs instructions, skills, MCP servers, hooks and non-role agents. Run `config --upgrade` to migrate role files."],
];

const checkAgents = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["agents: object expected"] : [
    ...REMOVED_AGENTS.filter(([k]) => v[k] !== undefined).map(([, msg]) => msg),
    ...unknownKeys(v, ["dir", "hosts"], "agents"),
    ...(v.dir !== undefined && !isPath(v.dir) ? ["agents.dir: project-root-relative path"] : []),
  ];

const TRANSPORTS = ["chat", "tool"] as const;

const checkPerSkill = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["questions.perSkill: object of skill → transport"] : Object.entries(v)
    .filter(([, t]) => !TRANSPORTS.includes(t as typeof TRANSPORTS[number]))
    .map(([k]) => `questions.perSkill.${k}: "chat" | "tool"`);

const checkQuestions = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["questions: object expected"] : [
    ...unknownKeys(v, ["transport", "perSkill"], "questions"),
    ...(v.transport !== undefined && !TRANSPORTS.includes(v.transport as typeof TRANSPORTS[number])
      ? ['questions.transport: "chat" | "tool"'] : []),
    ...checkPerSkill(v.perSkill),
  ];

const checkOutput = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["output: object expected"] : [
    ...unknownKeys(v, ["verbosity"], "output"),
    ...(v.verbosity !== undefined && !["concise", "standard"].includes(v.verbosity as string)
      ? ['output.verbosity: "concise" | "standard"'] : []),
  ];

const CONFIRM_MODES = ["ask", "auto"] as const;

const checkConfirmations = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["confirmations: object expected"] : [
    ...unknownKeys(v, ["mode", "perSkill"], "confirmations"),
    ...(v.mode !== undefined && !CONFIRM_MODES.includes(v.mode as typeof CONFIRM_MODES[number])
      ? ['confirmations.mode: "ask" | "auto"'] : []),
    ...(v.perSkill === undefined ? []
      : !isObj(v.perSkill) ? ["confirmations.perSkill: object of skill → mode"]
      : Object.entries(v.perSkill)
          .filter(([, m]) => !CONFIRM_MODES.includes(m as typeof CONFIRM_MODES[number]))
          .map(([k]) => `confirmations.perSkill.${k}: "ask" | "auto"`)),
  ];

const OPEN_MODES = ["auto", "flow", "never"] as const;

const checkReports = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["reports: object expected"] : [
    ...unknownKeys(v, ["html", "open"], "reports"),
    ...(v.html !== undefined && typeof v.html !== "boolean"
      ? ["reports.html: boolean"] : []),
    ...(v.open !== undefined && !OPEN_MODES.includes(v.open as typeof OPEN_MODES[number])
      ? ['reports.open: "auto" | "flow" | "never"'] : []),
  ];

const checkChangelog = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["changelog: object expected"] : [
    ...unknownKeys(v, ["fragments", "dir"], "changelog"),
    ...(v.fragments !== undefined && typeof v.fragments !== "boolean"
      ? ["changelog.fragments: boolean"] : []),
    ...(v.dir !== undefined && !isPath(v.dir)
      ? ["changelog.dir: project-root-relative POSIX path, no \"..\""] : []),
  ];

const checkReleaseBranches = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["release.branches: object expected"] : [
    ...unknownKeys(v, ["main", "dev"], "release.branches"),
    ...(["main", "dev"] as const)
      .filter((k) => v[k] !== undefined && !isGitRef(v[k]))
      .map((k) => `release.branches.${k}: safe git branch name (no leading "-", no whitespace/control/ref-forbidden chars)`),
  ];

// Keys that USED to live here. A removed key must never fall through to the
// generic "unknown key" error: the user did not typo it, we took it away, and
// the only useful thing to say is where its meaning went and how to move it.
const REMOVED_RELEASE: readonly (readonly [string, string])[] = [
  ["mode",
    'release.mode is removed. It never named a value — it named a WORKFLOW, and a workflow is a sequence, so it belongs in .supermodo/rules/release.md (frontmatter `template: light|full`), which is the single home for what steps run in what order. Migrate: run `config --rules release` and pick the template matching the mode you had, then delete this key.'],
  ["githubRelease",
    "release.githubRelease is removed. WHETHER and HOW this project publishes a release is part of its process, not a boolean: it belongs in .supermodo/rules/release.md, written in the project's own words (which command, on which forge, or none at all). Migrate it through `config --rules release`."],
];

const checkRelease = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["release: object expected"] : [
    ...REMOVED_RELEASE.filter(([k]) => v[k] !== undefined).map(([, msg]) => msg),
    ...unknownKeys(v, ["mode", "githubRelease", "branches", "versionFile", "versionPath", "changelog", "tagPrefix", "mergeStrategy", "versionPattern", "remote", "tagStyle", "alphaPolicy"], "release"),
    ...checkReleaseBranches(v.branches),
    ...(["versionFile", "changelog"] as const)
      .filter((k) => v[k] !== undefined && !isPath(v[k]))
      .map((k) => `release.${k}: project-root-relative POSIX path, no ".."`),
    ...(v.versionPath !== undefined && !isStr(v.versionPath) ? ["release.versionPath: non-empty string"] : []),
    ...(v.tagPrefix !== undefined && !isTagPrefix(v.tagPrefix)
      ? [`release.tagPrefix: safe tag prefix (no leading "-", no whitespace/control/ref-forbidden chars)`] : []),
    ...(v.tagStyle !== undefined && !["lightweight", "annotated", "signed"].includes(v.tagStyle as string)
      ? ['release.tagStyle: "lightweight" | "annotated" | "signed"'] : []),
    ...(v.remote !== undefined && !isGitRef(v.remote)
      ? ['release.remote: safe git remote name (no leading "-", no whitespace/control chars)'] : []),
    ...(v.mergeStrategy !== undefined && !["squash", "merge"].includes(v.mergeStrategy as string)
      ? ['release.mergeStrategy: "squash" | "merge"'] : []),
    // Only needed when the version lives somewhere no known shape finds it.
    // It is compiled and run against the file, so an invalid regex — or one
    // with nothing to capture — has to fail here, not at release time.
    ...(v.versionPattern !== undefined ? ((): string[] => {
      if (!isStr(v.versionPattern)) return ["release.versionPattern: non-empty string (a regex with one capture group)"];
      // `^((a+)+)$` spent 19 SECONDS of CPU on one file before any screen
      // existed, and two rewrites of it walked past the first screen. The
      // one in regex-safety.ts is the single definition of "unsafe", shared
      // with the preflight that compiles the pattern.
      const danger = dangerousPattern(v.versionPattern as string);
      try {
        const re = new RegExp(v.versionPattern as string, "m");
        return danger !== undefined
          ? [`release.versionPattern: ${danger} and would hang the release preflight — rewrite it without that group`]

          : re.exec("") === null && !/\((?!\?)/.test(v.versionPattern as string)
            ? ["release.versionPattern: must contain a capture group — group 1 is the version"]
            : [];
      } catch (e) {
        return [`release.versionPattern: invalid regex — ${(e as Error).message}`];
      }
    })() : []),
  ];

// `vcs.issueKey.pattern` is compiled and run against a branch name, so an
// invalid regex must be rejected here rather than thrown at commit time.
const TEMPLATE_TOKENS = /\{(key|type|scope|subject)\}/g;

const compiled = (v: Json): RegExp | undefined => {
  if (!isStr(v)) return undefined;
  try { return new RegExp(v); } catch { return undefined; }
};

// Count capture groups by MEASURING, never by pattern-matching the source.
// `^.*$` has none but matches the empty string; `(?<key>…)` has one but reads
// as non-capturing to a `/\((?!\?)/` heuristic; `\(` is a literal paren.
// Appending `|()` adds exactly one always-matching group, so a match on the
// empty string reports groupCount + 1 entries after index 0.
const captureCount = (re: RegExp): number =>
  (new RegExp(`${re.source}|()`).exec("")?.length ?? 2) - 2;

const checkIssueKey = (v: Json): string[] => {
  if (v === undefined) return [];
  if (!isObj(v)) return ["vcs.issueKey: object expected"];
  const re = compiled(v.pattern);
  const danger = isStr(v.pattern) ? dangerousPattern(v.pattern) : undefined;
  return [
    ...unknownKeys(v, ["pattern", "template"], "vcs.issueKey"),
    ...(v.pattern !== undefined && re === undefined
      ? ["vcs.issueKey.pattern: not a valid regular expression"] : []),
    ...(danger !== undefined
      ? [`vcs.issueKey.pattern: ${danger} — it is run against every branch name and would hang the commit skill; rewrite it without that group`] : []),

    ...(re !== undefined && captureCount(re) < 1
      ? ["vcs.issueKey.pattern: needs at least one capturing group — group 1 IS the key"] : []),
    ...(v.template !== undefined && !isStr(v.template)
      ? ["vcs.issueKey.template: non-empty string"] : []),
    ...(isStr(v.template) && (v.template.match(TEMPLATE_TOKENS) ?? []).length === 0
      ? ["vcs.issueKey.template: must contain at least one of {key} {type} {scope} {subject}"] : []),
    // SECURITY. The commit skill prints `git commit -m '<subject>'` as a
    // literal single-quoted line and executes the plan verbatim; a committed
    // template containing `'` closes that quote and everything after it
    // becomes shell. skills.config.json is untrusted committed input by the
    // same rule that makes a committed Makefile untrusted, and the config
    // contract already forbids interpolating config values into a shell
    // string — this is where that rule gets teeth.
    ...(isStr(v.template) && /['"`$\\;&|<>\n\r\x00-\x1f]/.test(v.template)
      ? ["vcs.issueKey.template: must not contain quotes, backslashes, shell metacharacters or control characters — it is composed into a commit subject printed as a single-quoted shell line"] : []),
  ];
};

const checkVcs = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["vcs: object expected"] : [
    ...unknownKeys(v, ["issueKey", "commit"], "vcs"),
    ...checkIssueKey(v.issueKey),
  ];

// ── Grammar layer: docs.layout / docs.grammar / vcs.commit ─────────────────
// The MUSCLE — every name, token and shape the skills parse. A project RENAMES
// these freely and ADDS to `extraRequired`; it can never blank one out, because
// that failure surfaces in a DIFFERENT skill (an empty board, a mis-derived
// semver bump) with nothing pointing back at the config. `floorViolations`
// turns that into an error here, at the point of change, naming the consumers.

const kindOf = (v: Json): string =>
  Array.isArray(v) ? "array" : v === null ? "null" : typeof v;

// Accepted shape is DERIVED from DEFAULTS, never restated: a new default key is
// accepted and type-checked with nothing to keep in sync.
const checkShape = (def: Json, v: Json, ctx: string): string[] =>
  v === undefined ? []
    : isObj(def)
      ? !isObj(v) ? [`${ctx}: object expected`] : [
          ...unknownKeys(v, Object.keys(def), ctx),
          ...Object.keys(def).flatMap((k) => checkShape(def[k], v[k], `${ctx}.${k}`)),
        ]
      : kindOf(def) !== kindOf(v) ? [`${ctx}: ${kindOf(def)} expected`]
        : Array.isArray(v) && !v.every(isStr) ? [`${ctx}: array of non-empty strings`]
          : [];

// A renamed token is embedded in a generated RegExp; a marker also sits inside
// `<!-- … -->`, where `--` or an angle bracket closes the comment early. Reject
// anything that changes the meaning of either here, rather than letting it
// corrupt a parser at read time.
const CTRL_RE = /[\n\r\x00-\x1f]/;
const RE_META = /[\\^$.|?*+()[\]{}]/;
const isSafeText = (v: Json): boolean =>
  isStr(v) && v === v.trim() && !CTRL_RE.test(v) && !RE_META.test(v);
const isLabel = (v: Json): boolean => isSafeText(v) && !v.includes(":");
const isWord = (v: Json): boolean => isSafeText(v) && !/\s/.test(v);
const isMarker = (v: Json): boolean => isWord(v) && !/[<>]/.test(v) && !v.includes("--");
const isHeading = (v: Json): boolean => isSafeText(v) && !v.startsWith("#");
const isSegment = (v: Json): boolean =>
  isStr(v) && v === v.trim() && !CTRL_RE.test(v)
  && !v.includes("/") && !v.includes("\\") && !v.startsWith(".");
// A checklist marker is exactly one character and never `]`, which would close
// the box it lives in.
const isStateChar = (v: Json): boolean =>
  typeof v === "string" && [...v].length === 1 && !CTRL_RE.test(v) && v !== "]";
const isCount = (v: Json, lo: number, hi: number): boolean =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const distinct = (xs: readonly unknown[]): boolean => new Set(xs).size === xs.length;

const bad = (cond: boolean, msg: string): string[] => (cond ? [msg] : []);

const LABEL_KEYS = [
  "docs.grammar.priority.label", "docs.grammar.prioritySource.label",
  "docs.grammar.mixed.label", "docs.grammar.created.label",
  "docs.grammar.dependsOn.label", "docs.grammar.promotion.fromLabel",
  "docs.grammar.promotion.idsLabel",
] as const;

const SEGMENT_KEYS = [
  "docs.layout.root", "docs.layout.work", "docs.layout.decisions",
  "docs.layout.reference", "docs.layout.archive", "docs.layout.triad.spec",
  "docs.layout.triad.plan", "docs.layout.triad.tasks",
  "docs.layout.triad.findings", "docs.layout.program.readme",
] as const;

const MARKER_KEYS = [
  "docs.grammar.task.markerPrefix", "docs.grammar.question.markerPrefix",
  "docs.grammar.generated.fileMarker", "docs.grammar.generated.navStart",
  "docs.grammar.generated.navEnd", "docs.layout.program.frontmatterKey",
  "docs.layout.adr.prefix",
] as const;

// Semantics are checked against the EFFECTIVE grammar (defaults ⊕ config), so
// renaming one key still validates every invariant that key participates in.
const checkGrammarSemantics = (r: unknown): string[] => {
  const get = (k: string): Json => at(r, k) as Json;
  const strs = (k: string): readonly string[] => {
    const v = get(k);
    return Array.isArray(v) ? (v as readonly string[]) : [];
  };
  const levels = strs("docs.grammar.priority.levels");
  const states = get("docs.grammar.task.states");
  const stateChars = isObj(states)
    ? [states.pending, states.inProgress, ...strs("docs.grammar.task.states.done"),
       ...strs("docs.grammar.task.states.paused")]
    : [];
  const labels = LABEL_KEYS.map((k) => get(k));
  const extra = [...strs("docs.grammar.extraRequired.spec"), ...strs("docs.grammar.extraRequired.backlog")];
  const types = strs("vcs.commit.types");
  const soft = get("vcs.commit.subjectSoftCap");
  const hard = get("vcs.commit.subjectHardCap");
  return [
    ...SEGMENT_KEYS.filter((k) => !isSegment(get(k)))
      .map((k) => `${k}: one path segment — no "/", no leading ".", no control characters`),
    ...bad(!isPath(get("docs.layout.backlog")) || !(get("docs.layout.backlog") as string).endsWith(".md"),
      'docs.layout.backlog: project-docs-relative POSIX path to a .md file, no ".."'),
    ...MARKER_KEYS.filter((k) => !isMarker(get(k)))
      .map((k) => `${k}: one word, no whitespace, no regex metacharacters, no "<", ">" or "--" (it is written inside an HTML comment)`),
    ...bad(!distinct(MARKER_KEYS.map((k) => get(k))), "docs.grammar: two markers resolve to the same token — every marker must be distinct"),
    ...bad(!isCount(get("docs.layout.adr.digits"), 1, 8), "docs.layout.adr.digits: integer 1-8"),
    ...bad(!isCount(get("docs.layout.program.initiativeDigits"), 1, 4), "docs.layout.program.initiativeDigits: integer 1-4"),
    ...bad(!isCount(get("docs.layout.splitThresholdKb"), 1, 10000), "docs.layout.splitThresholdKb: integer 1-10000"),
    ...bad(!isSafeText(get("docs.layout.archivePrefix")), "docs.layout.archivePrefix: plain text, no regex metacharacters"),
    // Priority is an ORDERED vocabulary: the names are the project's, the fact
    // that index 0 outranks index 1 is what `next` sorts by and is not tunable.
    ...bad(levels.length < 2, "docs.grammar.priority.levels: at least two levels, most urgent first"),
    ...bad(levels.length >= 2 && !levels.every(isWord),
      "docs.grammar.priority.levels: each level one word, no whitespace or regex metacharacters"),
    ...bad(!distinct(levels), "docs.grammar.priority.levels: levels must be distinct"),
    ...bad(levels.length > 0 && !levels.includes(get("docs.grammar.priority.unsetLevel") as string),
      `docs.grammar.priority.unsetLevel: must be one of the declared levels (${levels.join(", ")})`),
    ...bad(!isSafeText(get("docs.grammar.priority.separator")), "docs.grammar.priority.separator: plain text, no regex metacharacters"),
    ...bad(typeof get("docs.grammar.priority.requireClassification") !== "boolean",
      "docs.grammar.priority.requireClassification: boolean"),
    ...bad(!isWord(get("docs.grammar.prioritySource.derivedValue")), "docs.grammar.prioritySource.derivedValue: one word"),
    // Four roles, always four: "incomplete" = pending ∪ in-progress is what
    // every tool reads. Characters are the project's; the partition is not.
    ...bad(stateChars.length < 4 || !stateChars.every(isStateChar),
      'docs.grammar.task.states: pending, inProgress, done[] and paused[] must all be present, each exactly one character and never "]"'),
    ...bad(!distinct(stateChars), "docs.grammar.task.states: every state character must be distinct — two roles sharing one character make the checklist unreadable"),
    ...bad(!isHeading(get("docs.grammar.question.heading")), 'docs.grammar.question.heading: plain heading text, no leading "#", no regex metacharacters'),
    ...LABEL_KEYS.filter((k) => !isLabel(get(k)))
      .map((k) => `${k}: a field label — trimmed, no ":", no regex metacharacters`),
    ...bad(!distinct(labels), "docs.grammar: two field labels resolve to the same name — every label must be distinct"),
    ...bad(!extra.every(isLabel), 'docs.grammar.extraRequired: each entry a field label — trimmed, no ":", no regex metacharacters'),
    ...bad(extra.some((e) => labels.includes(e)),
      "docs.grammar.extraRequired: may not repeat a built-in field label — it adds fields, it never redefines one"),
    ...bad(strs("docs.grammar.finding.requiredSections").length === 0,
      "docs.grammar.finding.requiredSections: at least one section"),
    ...bad(!distinct(strs("docs.grammar.finding.requiredSections")),
      "docs.grammar.finding.requiredSections: sections must be distinct"),
    ...bad(isObj(get("docs.grammar.adrStatuses"))
      && !distinct(Object.values(get("docs.grammar.adrStatuses") as Obj)),
      "docs.grammar.adrStatuses: every status must be distinct"),
    ...bad(types.length === 0 || !distinct(types) || !types.every(isWord),
      "vcs.commit.types: a distinct, non-empty list of one-word types"),
    ...strs("vcs.commit.minorTypes").filter((t) => !types.includes(t))
      .map((t) => `vcs.commit.minorTypes: "${t}" is not in vcs.commit.types — release derives the minor bump from this list`),
    ...bad(!isWord(get("vcs.commit.breakingMarker")), "vcs.commit.breakingMarker: one word, no whitespace or regex metacharacters"),
    ...bad(!isSafeText(get("vcs.commit.breakingFooter")), "vcs.commit.breakingFooter: plain text, no regex metacharacters"),
    ...bad(!isCount(soft, 1, 200) || !isCount(hard, 1, 200), "vcs.commit.subjectSoftCap / subjectHardCap: integer 1-200"),
    ...bad(isCount(soft, 1, 200) && isCount(hard, 1, 200) && (soft as number) > (hard as number),
      "vcs.commit.subjectSoftCap: must not exceed vcs.commit.subjectHardCap"),
    ...bad(!["demote", "strict"].includes(get("release.alphaPolicy") as string),
      'release.alphaPolicy: "demote" | "strict"'),
  ];
};

// `docs.entry` names the router by full path and `docs.layout.root` names the
// docs directory. Two ways to say the same thing, so they can disagree — and a
// project that renamed one and not the other gets a scaffolder writing beside
// the tree the checker reads.
const checkRootAgreement = (c: Obj): string[] => {
  const d = isObj(c.docs) ? c.docs : undefined;
  const entry = d?.entry;
  const root = isObj(d?.layout) ? d.layout.root : undefined;
  if (!isStr(entry) || !isStr(root)) return [];
  const dir = entry.includes("/") ? entry.slice(0, entry.lastIndexOf("/")) : ".";
  return dir === root
    ? []
    : [`docs.layout.root "${root}" is not the directory of docs.entry "${entry}" — the router and the docs tree must be the same place`];
};

// One pass over the whole config: shape first (unknown keys, wrong types), then
// the floor, then semantics against the effective grammar.
const checkGrammar = (c: Obj): string[] => {
  const shape = [
    ...checkShape(DEFAULTS.docs.layout, isObj(c.docs) ? c.docs.layout : undefined, "docs.layout"),
    ...checkShape(DEFAULTS.docs.grammar, isObj(c.docs) ? c.docs.grammar : undefined, "docs.grammar"),
    ...checkShape(DEFAULTS.vcs.commit, isObj(c.vcs) ? c.vcs.commit : undefined, "vcs.commit"),
  ];
  // A malformed shape makes the resolved grammar meaningless; reporting both
  // would bury the real error under cascade noise.
  if (shape.length > 0) return shape;
  const resolved = resolve(DEFAULTS, c);
  return [...checkRootAgreement(c), ...floorViolations(resolved), ...checkGrammarSemantics(resolved)];
};

const ROOT_KEYS = [
  "configVersion", "project", "docs", "commands", "workspace", "coverage",
  "agents", "questions", "output", "confirmations", "reports", "changelog",
  "release", "vcs", "multimodel",
] as const;

const validate = (c: Obj): string[] => [
  ...unknownKeys(c, [...ROOT_KEYS], "root"),
  ...checkVersion(c.configVersion),
  ...checkProject(c.project),
  ...checkDocs(c.docs),
  ...checkCommands(c.commands),
  ...checkWorkspace(c.workspace),
  ...checkCoverage(c.coverage),
  ...checkAgents(c.agents),
  ...checkQuestions(c.questions),
  ...checkOutput(c.output),
  ...checkConfirmations(c.confirmations),
  ...checkReports(c.reports),
  ...checkChangelog(c.changelog),
  ...checkRelease(c.release),
  ...checkVcs(c.vcs),
  ...checkMultimodel(c.multimodel),
  ...checkGrammar(c),
];

const parse = (file: string): { config?: Obj; fatal?: string } => {
  const read = (): string | undefined => {
    try { return readFileSync(file, "utf8"); } catch { return undefined; }
  };
  const raw = read();
  if (raw === undefined) return { fatal: `cannot read ${file} — run the config skill to create it` };
  try {
    const parsed = parseJsonc(raw) as Json;
    return isObj(parsed) ? { config: parsed } : { fatal: "root must be an object" };
  } catch (e) {
    return { fatal: `invalid JSON: ${(e as Error).message}` };
  }
};

const main = (): number => {
  const file = process.argv[2] ?? "skills.config.json";
  const { config, fatal } = parse(file);
  if (fatal !== undefined) {
    console.error(`config-check: ${fatal}`);
    return 1;
  }
  const errors = validate(config as Obj);
  errors.forEach((e) => console.error(`config-check: ${e}`));
  if (errors.length > 0) return 1;
  console.log(`config-check: ${file} valid (configVersion 1)`);
  return 0;
};

process.exit(main());
