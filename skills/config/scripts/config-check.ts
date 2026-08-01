// supermodo config-check — zero-dependency validator for skills.config.json (v1).
// Usage: node config-check.ts [path/to/skills.config.json]   (Node ≥ 22.18)
// Exit 0 = valid; exit 1 = invalid (errors on stderr, one per line).

import { readFileSync } from "node:fs";

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
const GIT_UNSAFE = /[\s~^:?*[\\\x00-\x1f]/;
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
    ...unknownKeys(v, ["entry", "conventions"], "docs"),
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

const isHostSlug = (v: Json): v is string =>
  isStr(v) && /^[a-z][a-z0-9-]*$/.test(v);

const checkAgents = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["agents: object expected"] : [
    ...unknownKeys(v, ["dir", "hosts"], "agents"),
    ...(v.dir !== undefined && !isPath(v.dir) ? ["agents.dir: project-root-relative path"] : []),
    ...(v.hosts === undefined ? []
      : !Array.isArray(v.hosts) || v.hosts.length === 0 || !v.hosts.every(isHostSlug)
        ? ['agents.hosts: non-empty array of host slugs (lowercase, e.g. ["claude", "codex"])']
      : new Set(v.hosts).size !== v.hosts.length
        ? ["agents.hosts: duplicate host slugs"]
      : v.dir === undefined
        ? ["agents.hosts: requires agents.dir (the canonical roster to mirror from)"]
        : []),
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

const checkRelease = (v: Json): string[] =>
  v === undefined ? [] : !isObj(v) ? ["release: object expected"] : [
    ...unknownKeys(v, ["mode", "branches", "versionFile", "versionPath", "changelog", "tagPrefix", "mergeStrategy", "githubRelease"], "release"),
    ...(v.mode !== undefined && !["light", "full"].includes(v.mode as string)
      ? ['release.mode: "light" | "full"'] : []),
    ...checkReleaseBranches(v.branches),
    ...(["versionFile", "changelog"] as const)
      .filter((k) => v[k] !== undefined && !isPath(v[k]))
      .map((k) => `release.${k}: project-root-relative POSIX path, no ".."`),
    ...(v.versionPath !== undefined && !isStr(v.versionPath) ? ["release.versionPath: non-empty string"] : []),
    ...(v.tagPrefix !== undefined && !isTagPrefix(v.tagPrefix)
      ? [`release.tagPrefix: safe tag prefix (no leading "-", no whitespace/control/ref-forbidden chars)`] : []),
    ...(v.mergeStrategy !== undefined && !["squash", "merge"].includes(v.mergeStrategy as string)
      ? ['release.mergeStrategy: "squash" | "merge"'] : []),
    ...(v.githubRelease !== undefined && typeof v.githubRelease !== "boolean"
      ? ["release.githubRelease: boolean"] : []),
  ];

const ROOT_KEYS = [
  "configVersion", "project", "docs", "commands", "workspace", "coverage",
  "agents", "questions", "output", "confirmations", "reports", "changelog",
  "release",
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
];

const parse = (file: string): { config?: Obj; fatal?: string } => {
  const read = (): string | undefined => {
    try { return readFileSync(file, "utf8"); } catch { return undefined; }
  };
  const raw = read();
  if (raw === undefined) return { fatal: `cannot read ${file} — run the config skill to create it` };
  try {
    const parsed: Json = JSON.parse(raw);
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
