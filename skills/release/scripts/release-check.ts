// supermodo release-check — deterministic release preflight.
//
// Version state is read FROM GIT FIRST — every release tag, both long-lived
// branches, and their remote-tracking counterparts — and only then compared
// with the working tree. A preflight that trusts the checkout answers the
// wrong question: the checkout is the one place the version can be STALE, and
// a release cut from a stale checkout rolls the published version backwards.
// Having established the state, it prints the exact command sequence for THIS
// repository, with the real branch names, remote, version and tag substituted.
//
// Usage: node release-check.ts [project-root] [--hotfix] [--version <x.y.z>]
//   --version: the version to release, when this project's scheme is one no
//              tool can derive (CalVer, four-part, a prereleases sequence).
//              Declining to guess is right; leaving the project with no plan
//              at all is not.
//   --hotfix: preflight for cutting a hotfix (expects the main branch or an
//             existing hotfix/* branch instead of dev; bump is always patch).
// Read-only with one exception: remote-tracking refs are refreshed with
// `git fetch --tags --prune`. That writes no working tree, no branch and no
// history — it only stops the preflight from verifying against refs that went
// stale days ago. There is deliberately NO flag to skip it: the fetch is what
// makes every other answer here trustworthy, and a switch whose only effect is
// to reintroduce the staleness this script exists to catch is a footgun, not
// an option. Offline is handled by DEGRADING — the fetch fails, that becomes a
// warning, and the result says plainly that only local refs were checked.
// Output: human-readable lines + a final JSON line (machine-readable).
// Exit 0 = ready to release; exit 1 = blockers found.

import { readFileSync, existsSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { buildGrammar } from "../../config/scripts/grammar-load.ts";
import { parseJsonc } from "../../config/scripts/jsonc.ts";
import { dangerousPattern, matchWithin } from "../../config/scripts/regex-safety.ts";

import { applyAlphaPolicy, bumpOfCommit, maxBump } from "./bump.ts";

// Resolved at the CLI edge. The commit vocabulary lives in ONE place
// (config/scripts/grammar.ts) because `commit` writes with it and `release`
// derives the bump from it — two copies drift into a silent mis-bump.
const G = buildGrammar(
  resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "."),
  false,
);

type ReleaseConfig = {
  // NOT a config key. Which workflow this project runs is a sequence, so it
  // lives in the rules file; this is read from that file's `template:`
  // frontmatter, or the shipped default when there is no file. `release.mode`
  // used to duplicate it in config and is now a migration error.
  readonly shape: "light" | "full";
  readonly main: string;
  readonly dev: string;
  readonly versionFile: string;
  readonly versionPath: string;
  readonly changelog: string;
  readonly fragmentDir: string;
  readonly tagPrefix: string;
  readonly mergeStrategy: "squash" | "merge";
  // Optional escape hatch for a version that lives somewhere no shape finds.
  readonly versionPattern?: string;
  // Lightweight, annotated or signed. A project required to ship signed tags
  // could not express it: `tag` is rendered by the skill, and rules own order
  // only. Three values, all defined by git itself — not a platform enum.
  readonly tagStyle: "lightweight" | "annotated" | "signed";
  // Which remote this project actually releases to. Hard-selecting `origin`
  // made a fork+upstream checkout propose a version BELOW what upstream had
  // already published, and render a push at the fork.
  readonly remote?: string;
};

import type { Bump } from "./bump.ts";

const DEFAULTS = {
  main: "main",
  dev: "dev",
  versionFile: "package.json",
  versionPath: "version",
  changelog: "CHANGELOG.md",
  fragmentDir: "changes",
  tagPrefix: "v",
  mergeStrategy: "squash" as const,
  tagStyle: "lightweight" as const,
};

// Keys removed from the schema. Reported, never ignored: a config that still
// declares `mode` describes a workflow nothing reads any more, so silence
// would leave the project believing it had stated its process.
const MIGRATIONS: readonly (readonly [string, string])[] = [
  ["mode", "release.mode is removed — a workflow is a sequence, so it lives in .supermodo/rules/release.md frontmatter (`template: light|full`). Run `config --rules release` to materialize the matching template, then let `config` drop the key."],
  ["githubRelease", "release.githubRelease is removed — WHETHER and HOW this project publishes a release is part of its process, so it belongs in .supermodo/rules/release.md in the project's own words, not in a boolean that assumed one forge."],
];

// --- pure helpers --------------------------------------------------------

const dig = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>(
    (acc, key) => (typeof acc === "object" && acc !== null ? (acc as Record<string, unknown>)[key] : undefined),
    obj,
  );

// A version is not always `x.y.z`. Prereleases are ordinary in every ecosystem
// that ships release candidates, and rejecting them meant `1.2.3-rc.1` was not
// merely unsupported — its TAG stopped being recognised as a release tag at
// all, so the preflight reported "no tags" and derived the bump from the whole
// history. Parsed here per semver.org, ordering included.
type Semver = {
  readonly core: readonly [number, number, number];
  readonly pre?: string;
  readonly raw: string;
};

const parseSemver = (v: string): Semver | undefined => {
  // Leading zeros are INVALID semver (spec §2), and accepting them was not a
  // leniency — it silently swallowed CalVer. `2026.08.1` parsed as (2026,8,1)
  // and a "minor bump" produced `2026.9.0`: a different month, unpadded, and
  // reported as `ready: preflight clean`.
  const m = v.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  return m === null
    ? undefined
    : { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4], raw: v };
};

// semver.org §11: numeric identifiers compare numerically, alphanumerics
// lexically, numeric sorts below alphanumeric, and a longer set of identifiers
// outranks a shorter prefix of itself.
const cmpIds = (a: readonly string[], b: readonly string[]): number =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) => i).reduce((acc, i) => {
    if (acc !== 0) return acc;
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    return nx && ny ? Number(x) - Number(y) : nx ? -1 : ny ? 1 : x < y ? -1 : x > y ? 1 : 0;
  }, 0);

// A prerelease sorts BELOW its own release: 1.2.3-rc.1 < 1.2.3.
const cmpSemver = (a: Semver, b: Semver): number =>
  a.core[0] - b.core[0] || a.core[1] - b.core[1] || a.core[2] - b.core[2] ||
  (a.pre === b.pre ? 0
    : a.pre === undefined ? 1
    : b.pre === undefined ? -1
    : cmpIds(a.pre.split("."), b.pre.split(".")));

// A supplied version is ordered against everything ever declared or
// published — as semver when both sides parse, otherwise as dotted numbers,
// which is what CalVer and four-part schemes are. A version that can be
// ordered against nothing is not "unchecked": the guard's silence was read as
// a pass, and `--version 0.9` under a published 1.0.0 rendered `git tag v0.9`.
const numericTuple = (v: string): readonly number[] | undefined =>
  /^\d+(?:\.\d+)*$/.test(v) ? v.split(".").map(Number) : undefined;
const cmpTuples = (a: readonly number[], b: readonly number[]): number =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) - (b[i] ?? 0))
    .find((d) => d !== 0) ?? 0;
const orderVersions = (a: string, b: string): number | undefined => {
  const sa = parseSemver(a);
  const sb = parseSemver(b);
  if (sa !== undefined && sb !== undefined) return cmpSemver(sa, sb);
  const ta = numericTuple(a);
  const tb = numericTuple(b);
  return ta !== undefined && tb !== undefined ? cmpTuples(ta, tb) : undefined;
};

const nextVersion = (v: Semver, bump: Bump): string | undefined => {
  const [ma, mi, pa] = v.core;
  // Leaving a prerelease is a decision nobody can make from a commit log:
  // rc.1 → rc.2, or rc.1 → the release? The honest answer is to suggest
  // nothing and say why, rather than invent a sequence the project never chose.
  return v.pre !== undefined ? undefined
    : bump === "major" ? `${ma + 1}.0.0`
    : bump === "minor" ? `${ma}.${mi + 1}.0`
    : bump === "patch" ? `${ma}.${mi}.${pa + 1}`
    : undefined; // "none": no bump signal — never suggest re-releasing the current version
};

// The changelog heading must accept whatever the version file may hold.
const latestEntry = (text: string): string | undefined =>
  text.match(/^## \[(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)\]/m)?.[1];

// Version files are not all JSON. Cargo.toml, pyproject.toml,
// gradle.properties, a Python __init__.py, a bare VERSION file — treating
// "not JSON" as "no version" excluded most of Rust, Python and the JVM from
// the skill entirely. JSON stays the precise path (`versionPath` addresses a
// key); everything else falls back to shapes, and the shape that matched is
// REPORTED, because a version found by guessing must be visible as a guess.
const VERSION_SHAPES: readonly (readonly [RegExp, string])[] = [
  [/^\s*version\s*=\s*["']?(\d[^"'\s]*)["']?\s*$/m, "version = X (TOML / gradle.properties / setup.cfg)"],
  [/^\s*__version__\s*=\s*["'](\d[^"']*)["']/m, "__version__ = \"X\" (Python)"],
  [/^\s*version\s*:\s*["']?(\d[^"'\s]*)["']?\s*$/m, "version: X (YAML / pubspec)"],
  [/^\s*"version"\s*:\s*"(\d[^"]*)"/m, "\"version\": \"X\""],
  [/^v?(\d+\.\d+[^\s]*)\s*$/, "the whole file is the version (VERSION file)"],
];

type FoundVersion = { readonly value?: string; readonly how?: string; readonly error?: string };

// A project's own pattern runs under this budget, in a child process. A real
// version pattern finishes in microseconds; only a backtracking one gets here.
const PATTERN_BUDGET_MS = 500;


// Plenty of projects version themselves in a scheme nobody can bump from a
// commit log: CalVer, epoch-prefixed, four-part build numbers. Refusing them
// was wrong, and so was pretending they were semver. They are READ and
// reported; what is withheld is the arithmetic.
const looksLikeVersion = (v: string): boolean => /^\d+(\.\d+)+/.test(v);

const extractVersion = (raw: string, c: ReleaseConfig): FoundVersion => {
  // An explicit pattern always wins: it is the project telling us where its
  // version lives, which beats any shape we recognise.
  // It is screened here too — config-check may never have been run — and
  // then executed under a budget, because the screen is not a proof.
  const custom = c.versionPattern === undefined ? undefined : ((): FoundVersion | undefined => {
    const danger = dangerousPattern(c.versionPattern as string);
    if (danger !== undefined) return { error: `release.versionPattern: ${danger} — refusing to run it against ${c.versionFile}` };
    const r = matchWithin(c.versionPattern as string, "m", raw, PATTERN_BUDGET_MS);
    return r.kind === "timeout"
      ? { error: `release.versionPattern took longer than ${PATTERN_BUDGET_MS} ms on ${c.versionFile} and was stopped — a pattern that backtracks; rewrite it` }
      : r.kind === "invalid" ? { error: `release.versionPattern: ${r.message}` }
      : r.group1 === undefined ? undefined
      : { value: r.group1, how: `release.versionPattern` };
  })();

  if (custom !== undefined) return custom;

  const json = parseJsoncOrUndefined(raw);
  const dug = json === undefined ? undefined : dig(json, c.versionPath);
  if (typeof dug === "string") return { value: dug, how: `${c.versionPath} in JSON` };

  // A sectioned file (TOML, INI, .cfg) must honour the SECTION in versionPath.
  // Matching the first `version = ...` in a Cargo.toml reads whichever
  // dependency happens to be declared above [package].
  const sectioned = ((): FoundVersion | undefined => {
    const parts = c.versionPath.split(".");
    if (parts.length < 2 || !/^\[[^\]]+\]\s*$/m.test(raw)) return undefined;
    const want = parts.slice(0, -1).join(".");
    const key = parts[parts.length - 1];
    const body = raw
      .split(/^\[([^\]]+)\]\s*$/m)
      .reduce<{ readonly cur?: string; readonly hit?: string }>((acc, chunk, i) =>
        i % 2 === 1 ? { ...acc, cur: chunk.trim() }
        : acc.cur === want && acc.hit === undefined ? { ...acc, hit: chunk }
        : acc, {}).hit;
    const m = body?.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?(\\d[^"'\\s]*)["']?\\s*$`, "m"));
    return m?.[1] === undefined ? undefined : { value: m[1], how: `${c.versionPath} in a [${want}] section` };
  })();
  if (sectioned !== undefined) return sectioned;

  const shape = VERSION_SHAPES.map(([re, label]) => [raw.match(re), label] as const)
    .find(([m]) => m?.[1] !== undefined);
  return shape === undefined
    ? {}
    : { value: (shape[0] as RegExpMatchArray)[1], how: `matched ${shape[1]}` };
};

// Git refs and file paths coming from config are data, never options: a value
// that could be parsed as a git option or escape the project is a blocker.
// Per git-check-ref-format: rules apply PER slash-separated component.
const badRef = (v: string): boolean =>
  v.length === 0 || v.startsWith("-") || /[\s~^:?*[\\\x00-\x1f]/.test(v) ||
  // git permits these; a shell reads them as syntax, and these commands are
  // written to be pasted into one.
  /[;$&|<>()!'"`]/.test(v) ||
  v.includes("..") || v.includes("@{") || v.endsWith(".") ||
  !v.split("/").every((seg) =>
    seg.length > 0 && !seg.startsWith(".") && !seg.endsWith(".lock"));
const badPath = (v: string): boolean =>
  v.length === 0 || v.startsWith("-") || v.startsWith("/") || v.split("/").includes("..") || /[\x00-\x1f]/.test(v);
const badPrefix = (v: string): boolean =>
  v.startsWith("-") || /[\s~^:?*[\\\x00-\x1f]/.test(v);

const escapesRoot = (root: string, rel: string): boolean => {
  try {
    const real = realpathSync(join(root, rel));
    const inside = relative(realpathSync(root), real);
    return inside.startsWith("..") || resolve(inside) === inside;
  } catch { return false; } // absent is "cannot read", reported elsewhere
};

const configBlockers = (c: ReleaseConfig): readonly string[] => [
  ...(badRef(c.main) ? [`release.branches.main ${JSON.stringify(c.main)} is not a safe git ref`] : []),
  ...(badRef(c.dev) ? [`release.branches.dev ${JSON.stringify(c.dev)} is not a safe git ref`] : []),
  ...(badPrefix(c.tagPrefix) ? [`release.tagPrefix ${JSON.stringify(c.tagPrefix)} is not a safe tag prefix`] : []),
  ...(badPath(c.versionFile) ? [`release.versionFile ${JSON.stringify(c.versionFile)} is not a safe root-relative path`] : []),
  ...(badPath(c.changelog) ? [`release.changelog ${JSON.stringify(c.changelog)} is not a safe root-relative path`] : []),
  ...(badPath(c.fragmentDir) ? [`changelog.dir ${JSON.stringify(c.fragmentDir)} is not a safe root-relative path`] : []),
  ...(c.remote !== undefined && badRef(c.remote) ? [`release.remote ${JSON.stringify(c.remote)} is not a safe remote name`] : []),
];

// --- read-only I/O wrappers ----------------------------------------------

const git = (root: string, args: readonly string[]): string | undefined => {
  try {
    return execFileSync("git", ["-C", root, ...args], { stdio: ["ignore", "pipe", "pipe"] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
};

const lines = (s: string | undefined): readonly string[] =>
  (s ?? "").split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

const readJsonc = (path: string): unknown => {
  try {
    return parseJsonc(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
};

const parseJsoncOrUndefined = (raw: string): unknown => {
  try { return parseJsonc(raw); } catch { return undefined; }
};

const rawRelease = (root: string): Record<string, unknown> => {
  const cfg = readJsonc(join(root, "skills.config.json"));
  const r = (typeof cfg === "object" && cfg !== null
    ? (cfg as Record<string, unknown>).release
    : undefined);
  return typeof r === "object" && r !== null ? (r as Record<string, unknown>) : {};
};

const loadReleaseConfig = (root: string, rules: RuleState): ReleaseConfig => {
  const cfg = readJsonc(join(root, "skills.config.json"));
  const obj = (k: string): Record<string, unknown> => {
    const v = (typeof cfg === "object" && cfg !== null ? (cfg as Record<string, unknown>)[k] : undefined);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  };
  const r = obj("release");
  const branches = (r.branches ?? {}) as Partial<Record<string, string>>;
  return {
    shape: rules.template === "full" ? "full" : "light",
    main: branches.main ?? DEFAULTS.main,
    dev: branches.dev ?? DEFAULTS.dev,
    versionFile: (r.versionFile as string) ?? DEFAULTS.versionFile,
    versionPath: (r.versionPath as string) ?? DEFAULTS.versionPath,
    changelog: (r.changelog as string) ?? DEFAULTS.changelog,
    fragmentDir: (obj("changelog").dir as string) ?? DEFAULTS.fragmentDir,
    tagPrefix: (r.tagPrefix as string) ?? DEFAULTS.tagPrefix,
    mergeStrategy: (r.mergeStrategy as ReleaseConfig["mergeStrategy"]) ?? DEFAULTS.mergeStrategy,
    versionPattern: typeof r.versionPattern === "string" ? r.versionPattern : undefined,
    tagStyle: (r.tagStyle as ReleaseConfig["tagStyle"]) ?? DEFAULTS.tagStyle,
    remote: typeof r.remote === "string" ? r.remote : undefined,
  };
};

// --- version state, read from git ----------------------------------------

// `git show <ref>:<path>` wants the path relative to the repository ROOT,
// while every config path is relative to the PROJECT root. In a repo whose
// project sits in a subdirectory those differ, and the difference is silent:
// every ref would simply report "no version file" and the preflight would
// conclude the checkout is fine.
const repoPrefix = (root: string): string => {
  const p = git(root, ["rev-parse", "--show-prefix"]) ?? "";
  return p.length === 0 || p.endsWith("/") ? p : `${p}/`;
};

const refExists = (root: string, ref: string): boolean =>
  git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== undefined;

const showAt = (root: string, ref: string, path: string): string | undefined =>
  git(root, ["show", `${ref}:${path}`]);

type RefState = {
  readonly ref: string;
  readonly kind: "worktree" | "branch" | "remote" | "tag";
  readonly version?: string;
  readonly how?: string;
  readonly error?: string;
  readonly changelog?: string;
};


const stateAtRef = (
  root: string, prefix: string, c: ReleaseConfig, ref: string, kind: RefState["kind"],
): RefState => {
  const raw = showAt(root, ref, prefix + c.versionFile);
  const found = raw === undefined ? {} : extractVersion(raw, c);
  const cl = showAt(root, ref, prefix + c.changelog);
  return { ref, kind, version: found.value, error: found.error, changelog: cl === undefined ? undefined : latestEntry(cl) };

};

const worktreeState = (root: string, c: ReleaseConfig): RefState => {
  const vf = join(root, c.versionFile);
  const found = existsSync(vf)
    ? extractVersion(((): string => { try { return readFileSync(vf, "utf8"); } catch { return ""; } })(), c)
    : {};
  const version = found.value;
  const cp = join(root, c.changelog);
  return {
    ref: "(working tree)",
    kind: "worktree",
    version,
    how: found.how,
    error: found.error,

    changelog: existsSync(cp) ? latestEntry(readFileSync(cp, "utf8")) : undefined,
  };
};

// Every release tag in the repository, highest semver first — NOT
// `git describe`, which only ever sees the nearest tag in HEAD's own
// ancestry. A hotfix tagged on main is invisible from dev to `describe`, and
// the next release from dev would then be numbered below a version that is
// already published.
const releaseTags = (root: string, prefix: string): readonly (readonly [string, Semver])[] =>
  lines(git(root, ["tag", "--list", `${prefix}[0-9]*`]))
    .flatMap((t) => {
      const s = parseSemver(t.slice(prefix.length));
      return s === undefined ? [] : [[t, s] as const];
    })
    .sort((a, b) => cmpSemver(b[1], a[1]));

const remoteNames = (root: string): readonly string[] => lines(git(root, ["remote"]));

// A shallow clone silently truncates history, and every number here is derived
// from history: the unreleased range, the bump, the back-merge search. It
// reported "1 commit" for a range of 2 with no hint anything was missing.
// "clean porcelain" is not "no operation in progress". A half-finished merge
// leaves an empty status but a live MERGE_HEAD, and the release's own
// `git commit` would then COMPLETE that unrelated merge as the release commit
// — a two-parent commit carrying someone else's work under a release message.
const IN_PROGRESS: readonly (readonly [string, string])[] = [
  ["MERGE_HEAD", "a merge"],
  ["CHERRY_PICK_HEAD", "a cherry-pick"],
  ["REVERT_HEAD", "a revert"],
  ["BISECT_LOG", "a bisect"],
  ["rebase-merge", "a rebase"],
  ["rebase-apply", "a rebase"],
  ["sequencer", "a sequencer operation"],
];

const operationsInProgress = (root: string): readonly string[] => [
  ...new Set(IN_PROGRESS.filter(([name]) => {
    const p = git(root, ["rev-parse", "--git-path", name]);
    return p !== undefined && existsSync(isAbsolute(p) ? p : join(root, p));
  }).map(([, label]) => label)),
];

// A branch checked out in ANOTHER worktree cannot be switched to here: git
// refuses. Every rendered plan that moves between branches would stop dead on
// its first command.
const branchesCheckedOutElsewhere = (root: string): readonly string[] => {
  const here = ((): string | undefined => {
    const t = git(root, ["rev-parse", "--show-toplevel"]);
    try { return t === undefined ? undefined : realpathSync(t); } catch { return t; }
  })();
  const out = git(root, ["worktree", "list", "--porcelain"]) ?? "";
  return out.split(/\n\n+/).flatMap((block) => {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    const ref = block.match(/^branch refs\/heads\/(.+)$/m)?.[1];
    const real = ((): string | undefined => {
      try { return path === undefined ? undefined : realpathSync(path); } catch { return path; }
    })();
    return ref !== undefined && real !== undefined && real !== here ? [ref] : [];
  });
};

// An annotated or signed tag is a tag OBJECT; a lightweight one points
// straight at the commit. A project whose policy is "signed" wants to know its
// baseline does not comply, not to discover it at audit.
const tagObjectType = (root: string, tag: string): string | undefined =>
  git(root, ["cat-file", "-t", tag]);

const isShallow = (root: string): boolean =>
  git(root, ["rev-parse", "--is-shallow-repository"]) === "true";

// Tags that exist but do NOT match the configured prefix. Silently finding
// zero tags is the worst outcome here: the range becomes the whole history and
// the suggested version can land BELOW something already published (a monorepo
// tagging `pkg-a@1.0.0` got "no tags" and a proposal of 0.1.0).
const foreignTags = (root: string, prefix: string): readonly string[] =>
  lines(git(root, ["tag", "--list"]))
    // Carries a version...
    .filter((t) => /\d+\.\d+\.\d+/.test(t))
    // ...but is not one this project's prefix recognises. Membership is
    // decided by "prefix + parses as semver", never by startsWith alone.
    .filter((t) => !(t.startsWith(prefix) && parseSemver(t.slice(prefix.length)) !== undefined));

// Does the project state its own process? The rules contract makes this a
// two-state question and nothing more: present -> that file IS the sequence;
// absent -> the shipped default template is. The script never merges them.
type RuleState = {
  readonly present: boolean;
  readonly template?: string;
  readonly templateVersion?: string;
};

const ruleState = (root: string): RuleState => {
  const f = join(root, ".supermodo/rules/release.md");
  if (!existsSync(f)) return { present: false };
  const fm = ((): Record<string, string> => {
    try {
      const text = readFileSync(f, "utf8").replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
      const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
      return Object.fromEntries(
        block.split("\n")
          .map((l) => l.match(/^([a-z][a-z-]*):\s*(.*)$/))
          .filter((m): m is RegExpMatchArray => m !== null)
          .map((m) => [m[1], m[2].trim()]),
      );
    } catch { return {}; }
  })();
  return { present: true, template: fm.template, templateVersion: fm["template-version"] };
};

// Local AND remote-tracking. A fresh clone has no local `release/*` at all,
// so enumerating only refs/heads meant the commonest checkout of a full-flow
// project silently skipped the rejoin — the hotfix ships, then the next
// release from the stabilization branch un-ships it.
const openReleaseBranches = (root: string): readonly string[] => {
  const local = lines(git(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads/release/"]));
  const tracked = lines(git(root, ["for-each-ref", "--format=%(refname:short)", "refs/remotes/"]))
    .map((r) => r.split("/").slice(1).join("/"))
    .filter((b) => b.startsWith("release/"));
  return [...new Set([...local, ...tracked])].sort();
};

const trackingRefs = (root: string, branch: string): readonly string[] =>
  lines(git(root, ["for-each-ref", "--format=%(refname:short)", "refs/remotes"]))
    .filter((r) => r === `${r.split("/")[0]}/${branch}`);

// left = commits in `a` not in `b`; right = commits in `b` not in `a`.
const divergence = (root: string, a: string, b: string): readonly [number, number] | undefined => {
  const out = git(root, ["rev-list", "--left-right", "--count", `${a}...${b}`]);
  const m = out?.match(/^(\d+)\s+(\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
};

// Every remote, not just the chosen one. Tags live in a single namespace, so
// a release published at `upstream` is invisible to a checkout that only ever
// fetches `origin` — and invisible published versions are exactly how a
// release proposes a number that already exists.
const fetchRefs = (root: string, remotes: readonly string[]): "ok" | "failed" | "partial" => {
  const results = remotes.map((r) => {
    try {
      execFileSync("git", ["-C", root, "fetch", "--tags", "--prune", "--quiet", r], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 20_000,
      });
      return true;
    } catch { return false; }
  });
  return results.every((x) => x) ? "ok" : results.some((x) => x) ? "partial" : "failed";
};

// A squash workflow rewrites dev's commits into ONE commit on main, so those
// dev commits are never ancestors of the release commit. `<tag>..HEAD` keeps
// every commit dev has ever made, and a `feat:` released three versions ago
// inflates today's patch into a minor. The bound that fixes that is the
// BACK-MERGE — where dev absorbed the released state.
//
// But "a merge whose second parent is contained in main" is NOT that merge:
// any mid-cycle `main -> dev` sync matches, and taking one as the boundary
// EXCLUDES every commit before it. A team that synced main into dev after a
// `feat:` landed got a patch bump and "ready: preflight clean" while the
// feature went unreleased — silently the wrong version.
//
// So the second parent must BE the released commit itself, not merely
// something main contains. When no such merge exists the range falls back to
// the tag, which can only over-count: the bump may be too high, never too low.
const lastBackMerge = (root: string, tagCommit: string | undefined): string | undefined =>
  tagCommit === undefined
    ? undefined
    : lines(git(root, ["rev-list", "--merges", "--max-count=200", "HEAD"]))
        .find((sha) => git(root, ["rev-parse", `${sha}^2`]) === tagCommit);

const rangeBase = (
  root: string, c: ReleaseConfig, branch: string | undefined, lastTag: string | undefined,
): { readonly base?: string; readonly label: string; readonly widened: boolean } => {
  const squash = c.mergeStrategy === "squash" && branch !== c.main && refExists(root, c.main);
  const tagCommit = lastTag === undefined
    ? undefined
    : git(root, ["rev-parse", `${lastTag}^{commit}`]);
  const bm = squash ? lastBackMerge(root, tagCommit) : undefined;
  return bm !== undefined
    ? { base: bm, label: `last back-merge ${bm.slice(0, 9)} (squash workflow)`, widened: false }
    : { base: lastTag, label: lastTag ?? "repo start", widened: squash && lastTag !== undefined };
};

type Commit = { readonly subject: string; readonly body: string };

const commitsSince = (root: string, base: string | undefined): readonly Commit[] => {
  const range = base === undefined ? [] : [`${base}..HEAD`];
  const raw = git(root, ["log", ...range, "--pretty=%s%n%b%x1e"]) ?? "";
  return raw
    .split("\x1e")
    .map((rec) => rec.trim())
    .filter((rec) => rec.length > 0)
    .map((rec) => {
      const nl = rec.indexOf("\n");
      return nl === -1
        ? { subject: rec, body: "" }
        : { subject: rec.slice(0, nl), body: rec.slice(nl + 1) };
    });
};

// --- inferring the process, ONCE ------------------------------------------

// Run only when the project has no rules file. Discovering how a repository
// releases is the expensive, guessy part of this skill, and it is also the
// part that does not change between releases — so it happens once, the user
// confirms or corrects it, and it is written into
// `.supermodo/rules/release.md`. Every later run reads that file and gathers
// STATE alone. State is never inferred and never cached: what version is
// published, whether this checkout is behind — those differ every single run,
// and a cached answer to them is the staleness bug one level up.
type Inferred = {
  readonly main: string;
  readonly dev?: string;
  readonly tagPrefix: string;
  readonly mergeStrategy: "squash" | "merge";
  readonly template: "light" | "full";
  readonly versionFile?: string;
  readonly versionPath?: string;
  readonly changelog?: string;
  // Observations, NOT classifications. Which forge this is, whether the main
  // branch is protected, how a release gets published — those are read off the
  // evidence by whoever writes the rules file, because the set of possible
  // answers is not one this script can enumerate.
  readonly remotes: readonly string[];
  readonly ci: readonly string[];
  readonly requestFlow: readonly string[];
  readonly releaseDocs: readonly string[];
  // What each guess was read FROM. The user is being asked to confirm a
  // process, and a proposal they cannot check is one they can only rubber-stamp.
  readonly evidence: readonly string[];
};

// Candidates across ecosystems, not just the JSON ones — the same mistake as
// the reader had. Each is confirmed by actually extracting a semver from it.
const VERSION_CANDIDATES: readonly (readonly [string, string])[] = [
  ["package.json", "version"], ["deno.json", "version"], ["deno.jsonc", "version"],
  ["jsr.json", "version"], [".claude-plugin/plugin.json", "version"],
  ["plugin.json", "version"], ["composer.json", "version"],
  ["manifest.json", "version"], ["version.json", "version"],
  ["Cargo.toml", "package.version"], ["pyproject.toml", "project.version"],
  ["setup.cfg", "metadata.version"], ["gradle.properties", "version"],
  ["build.gradle", "version"], ["pubspec.yaml", "version"],
  ["mix.exs", "version"], ["Chart.yaml", "version"], ["galaxy.yml", "version"],
  ["VERSION", "version"], ["version.txt", "version"],
];
const CHANGELOG_CANDIDATES: readonly string[] =
  ["CHANGELOG.md", "CHANGELOG.markdown", "docs/CHANGELOG.md", "HISTORY.md"];
const MAIN_CANDIDATES: readonly string[] = ["main", "master", "trunk"];
const DEV_CANDIDATES: readonly string[] = ["dev", "develop", "development", "integration", "next"];

// What the CI already does is part of the process, and the part most likely to
// contradict a manual release: if a workflow tags on merge, or release-please
// owns the version entirely, then "cut a release by hand" is the wrong answer
// and the user needs to see that BEFORE confirming anything.
const CI_MARKERS: readonly (readonly [RegExp, string])[] = [
  [/semantic-release|release-please|changesets|standard-version/i,
    "CI OWNS VERSIONING (semantic-release / release-please / changesets) — a manual release will fight it"],
  [/softprops\/action-gh-release|ncipollo\/release-action|gh release create|glab release create/i,
    "CI publishes the forge release"],
  [/\bgit +tag\b|actions\/create-release/i, "CI creates tags"],
  [/npm publish|deno publish|jsr publish|cargo publish|twine upload|mvn deploy/i,
    "CI publishes the package"],
  [/on:[\s\S]{0,200}?tags:/i, "a workflow is triggered by tags"],
];

const CI_PATHS: readonly string[] = [
  ".gitlab-ci.yml", "bitbucket-pipelines.yml", "Jenkinsfile",
  ".circleci/config.yml", "azure-pipelines.yml", ".woodpecker.yml",
];

const ciSignals = (root: string): readonly string[] => {
  const wf = join(root, ".github/workflows");
  const files = [
    ...CI_PATHS.map((f) => join(root, f)).filter((f) => existsSync(f)),
    ...(existsSync(wf)
      ? readdirSync(wf).filter((f) => /\.ya?ml$/.test(f)).map((f) => join(wf, f))
      : []),
  ];
  const text = files.map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");
  return files.length === 0
    ? []
    : [`CI config found: ${files.map((f) => f.slice(root.length + 1)).join(", ")}`,
       ...CI_MARKERS.filter(([re]) => re.test(text)).map(([, label]) => label)];
};

// A project that already documents its release has already answered most of
// this. Reading it beats inferring from history every time.
const DOC_CANDIDATES: readonly string[] = [
  "RELEASING.md", "RELEASE.md", "CONTRIBUTING.md", "docs/RELEASING.md",
  "docs/releasing.md", "docs/CONTRIBUTING.md", "PUBLISHING.md",
];

const releaseDocsOf = (root: string): readonly string[] =>
  DOC_CANDIDATES.filter((f) => existsSync(join(root, f)))
    .map((f) => {
      const t = ((): string => { try { return readFileSync(join(root, f), "utf8"); } catch { return ""; } })();
      const hits = ["release", "tag", "publish", "changelog", "version"]
        .filter((w) => new RegExp(`\\b${w}`, "i").test(t));
      return `${f}${hits.length > 0 ? ` — mentions ${hits.join(", ")}; READ IT before proposing anything` : ""}`;
    });

// Merge commits main already carries tell you how changes actually land there,
// without needing to know what the forge calls it.
const requestFlowOf = (root: string, main: string): readonly string[] => {
  const subjects = lines(git(root, ["log", "--merges", "--max-count=40", "--pretty=%s", main]));
  const req = subjects.filter((x) => /merge (pull request|branch .*pull)|see merge request|merged in |pull request #/i.test(x));
  return req.length === 0
    ? []
    : [`${req.length} of the last ${subjects.length} merges on ${main} look like forge requests, e.g. ${JSON.stringify(req[0].slice(0, 72))} — changes may land there through a request rather than a direct push`];
};

const inferProcess = (root: string, remote: string, c: ReleaseConfig): Inferred => {
  const head = git(root, ["symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`]);
  const fromHead = head?.startsWith(`${remote}/`) === true ? head.slice(remote.length + 1) : undefined;
  const main = fromHead !== undefined && refExists(root, fromHead)
    ? fromHead
    : MAIN_CANDIDATES.find((b) => refExists(root, b)) ?? "main";
  const dev = DEV_CANDIDATES.find((b) => b !== main && refExists(root, b));

  const tagged = lines(git(root, ["tag", "--list"]))
    .flatMap((t) => { const m = t.match(/^(\D*)\d+\.\d+\.\d+$/); return m ? [m[1]] : []; });
  const tagPrefix = tagged.length === 0
    ? "v"
    : [...new Set(tagged)].sort((a, b) =>
        tagged.filter((t) => t === b).length - tagged.filter((t) => t === a).length)[0];

  // A `--no-ff` workflow leaves merge commits on main whose second parent is
  // part of the dev line. A squash workflow leaves none — that absence IS the
  // signal, so squash is the fallback rather than a guess.
  const mergeOnMain = dev === undefined ? undefined : lines(git(root, ["rev-list", "--merges", "--max-count=40", main]))
    .find((sha) => git(root, ["merge-base", "--is-ancestor", `${sha}^2`, dev]) !== undefined);
  const mergeStrategy: "squash" | "merge" = mergeOnMain !== undefined ? "merge" : "squash";

  const openRelease = openReleaseBranches(root);
  const template: "light" | "full" = openRelease.length > 0 ? "full" : "light";

  const version = VERSION_CANDIDATES
    .map(([file, path]) => {
      const f = join(root, file);
      if (!existsSync(f)) return undefined;
      const raw = ((): string => { try { return readFileSync(f, "utf8"); } catch { return ""; } })();
      const found = extractVersion(raw, { ...c, versionFile: file, versionPath: path });
      return found.value !== undefined && parseSemver(found.value) !== undefined
        ? ([file, path, found.how] as const) : undefined;
    })
    .find((x) => x !== undefined);
  const changelog = CHANGELOG_CANDIDATES.find((f) => existsSync(join(root, f)));
  const remotes = remoteNames(root).map((n) => `${n} → ${git(root, ["remote", "get-url", n]) ?? "?"}`);
  const ci = ciSignals(root);
  const requestFlow = requestFlowOf(root, main);
  const releaseDocs = releaseDocsOf(root);

  return {
    main, dev, tagPrefix, mergeStrategy, template,
    versionFile: version?.[0], versionPath: version?.[1], changelog,
    remotes, ci, requestFlow, releaseDocs,
    evidence: [
      `main branch "${main}" — ${fromHead !== undefined ? `${remote}/HEAD points at it` : "the first conventional name that exists here"}`,
      dev === undefined
        ? `no integration branch found (looked for ${DEV_CANDIDATES.join(", ")}) — this looks like a single-branch process`
        : `integration branch "${dev}" — it exists in this repository`,
      tagged.length === 0
        ? `tag prefix "v" — no version tags yet, so this is the default, not a reading`
        : `tag prefix "${tagPrefix}" — used by ${tagged.filter((t) => t === tagPrefix).length} of ${tagged.length} version tags`,
      mergeOnMain !== undefined
        ? `merge strategy "merge" — ${main} carries merge commits from ${dev} (e.g. ${mergeOnMain.slice(0, 9)})`
        : `merge strategy "squash" — no merge commits from the integration line on ${main}`,
      openRelease.length > 0
        ? `rules template "full" — open stabilization branches: ${openRelease.join(", ")}`
        : `rules template "light" — no release/* branches`,
      version === undefined
        ? `NO version file found — looked in ${VERSION_CANDIDATES.map(([f]) => f).join(", ")}; you must name it`
        : `version file "${version[0]}" — ${version[2] ?? `holds a semver at "${version[1]}"`}`,
      changelog === undefined ? `NO changelog found — you must name it` : `changelog "${changelog}"`,
      ...(remotes.length === 0 ? ["no remotes"] : remotes.map((r) => `remote: ${r}`)),
      ...(ci.length === 0 ? ["no CI config found"] : ci.map((c) => `CI: ${c}`)),
      ...requestFlow.map((r) => `history: ${r}`),
      ...(releaseDocs.length === 0
        ? ["no release documentation found in this repository"]
        : releaseDocs.map((d) => `docs: ${d}`)),
    ],
  };
};

// --- the command steps ----------------------------------------------------

// The skill renders a step into a correct command; the PROJECT owns which
// steps run in what order (protocols/references/rules.md). So this emits
// NAMED steps, never a fixed script: `.supermodo/rules/release.md` names the
// steps, and each name resolves to the commands below with this repository's
// real branch names, remote, version, tag and paths already substituted.
// `defaultOrder` is the shipped default process's order and applies only when
// the project has no rules file — exactly the fallback the rules contract
// defines. Baking the order in here would make the script a second home for a
// sequence that already has one.

// Single-quoted, always: an interactive shell reads `!` inside double quotes
// as a history expansion and refuses the line, and a printed sequence the user
// cannot paste is not a plan.
const q = (s: string): string => `'${s.replaceAll("'", `'\\''`)}'`;

// Paths come from config and are only constrained to be root-relative — a
// space is perfectly legal in one. Interpolated bare, `docs/My Changelog.md`
// became two arguments: `git add` failed, and had `docs/My` existed it would
// have staged the WRONG file while the plan claimed to be verified. Quoted
// only when it needs it, so the common case stays readable.
const qp = (v: string): string => (/^[A-Za-z0-9._\/@+-]+$/.test(v) ? v : q(v));

// Refs are interpolated into pasteable commands exactly like paths are, and a
// ref may legally contain shell metacharacters. Same rule: quote unless
// plainly safe, so the common case stays readable.
const qr = qp;

// `supplied` is the honest half of this contract: "skill" means the commands
// below are rendered from verified facts; "project" means the skill knows the
// step exists and refuses to invent it.
type Step = {
  readonly id: string;
  readonly title: string;
  readonly commands: readonly string[];
  readonly supplied: "skill" | "project";
};

type PlanInput = {
  readonly c: ReleaseConfig;
  readonly version: string;
  readonly tag: string;
  readonly remote: string;
  readonly hotfix: boolean;
  readonly branch?: string;
  readonly hasFragments: boolean;
  // Open stabilization branches, so a hotfix rejoins them too. A fix that
  // reaches main and dev but not the branch about to become the next release
  // is a fix that ships and then un-ships itself.
  readonly openRelease: readonly string[];
  readonly singleBranch: boolean;
};

// No inline comments on generated command lines. The reader cannot tell a
// commented flag from a real one, and a comment mentioning a default branch
// name reintroduces exactly the hardcoding these commands exist to remove.
// The invariants they obey live in SKILL.md.
// Steps the skill can render are PURE GIT — universal, and exactly the ones
// where a remembered branch name does silent damage. Steps it cannot render
// carry a title, no commands, and `supplied: "project"`. Publishing a release,
// opening a request, waiting for an approval: those are a forge's business and
// there is no closed set of forges. Guessing `gh` at a Gitea project, or a
// flag from memory, would produce a command that looks verified and is not.
// The rules file states them in the project's own words; the OBSERVATIONS
// block below is what the model writes them from.
// The heading is compared as a STRING, never compiled as a pattern. A version
// is allowed to contain `+` and `.`, which are ERE metacharacters: the heading
// `## [1.0.1+build.7]` never matched its own regex and the publish step
// received an EMPTY notes file — with nothing anywhere saying so.
const notesBlock = (p: PlanInput): readonly string[] => [
  "NOTES=$(mktemp)",
  `awk -v h=${q(`## [${p.version}]`)} 'index($0,h)==1{f=1;next}/^## \\[/{f=0}f' ${qp(p.c.changelog)} > "$NOTES"`,
];

// No inline comments on generated command lines. The reader cannot tell a
// commented flag from a real one, and a comment mentioning a default branch
// name reintroduces exactly the hardcoding these commands exist to remove.
// The invariants they obey live in SKILL.md.
const allSteps = (p: PlanInput): readonly Step[] => {
  const onHotfix = p.branch?.startsWith("hotfix/") === true;
  const hotfixBranch = onHotfix ? (p.branch as string) : `hotfix/${p.version}`;
  const from = p.hotfix || onHotfix
    ? hotfixBranch
    : p.branch?.startsWith("release/") === true
      ? p.branch
      : p.c.shape === "full" ? `release/${p.version}` : p.c.dev;
  const git_ = (id: string, title: string, commands: readonly string[]): Step =>
    ({ id, title, commands, supplied: "skill" });
  const yours = (id: string, title: string): Step =>
    ({ id, title, commands: [], supplied: "project" });
  return [
    git_("cut-stabilization", `cut the stabilization branch off ${p.c.dev}`,
      [`git switch -c release/${p.version} ${qr(p.c.dev)}`]),
    git_("cut-hotfix", `cut the hotfix branch off ${p.c.main}`,
      [`git switch -c ${qr(hotfixBranch)} ${qr(p.c.main)}`]),
    git_("bump-commit", "commit the bump, the changelog entry and the consumed fragments", [
      `git add ${qp(p.c.versionFile)} ${qp(p.c.changelog)}${p.hasFragments ? ` ${qp(p.c.fragmentDir)}` : ""}`,
      `git commit -m ${q(`chore(release): ${p.tag}`)}`,
    ]),
    ...(p.singleBranch ? [] : [git_("push-branch", `push ${from}`, [`git push ${qr(p.remote)} ${qr(from)}`])]),
    ...(p.singleBranch ? [] : [git_("integrate", `create the release commit on ${p.c.main} from ${from}`, [
      `git switch ${qr(p.c.main)}`,
      ...(p.c.mergeStrategy === "merge"
        ? [`git merge --no-ff ${qr(from)} -m ${q(`release: ${p.tag}`)}`]
        : [`git merge --squash ${qr(from)}`, `git commit -m ${q(`release: ${p.tag}`)}`]),
    ])]),
    yours("open-request", `open the change request ${from} → ${p.c.main} — this project's own command; the skill does not guess one`),
    yours("await-approval", "wait for approval and green checks — never bypassed by this skill"),
    git_("sync-main", `bring ${p.c.main} locally up to the merged state`,
      [`git switch ${qr(p.c.main)}`, `git pull --ff-only ${qr(p.remote)} ${qr(p.c.main)}`]),
    git_("tag", `tag the release commit (${p.c.tagStyle})`, [
      p.c.tagStyle === "signed" ? `git tag -s ${qr(p.tag)} -m ${q(`release: ${p.tag}`)}`
      : p.c.tagStyle === "annotated" ? `git tag -a ${qr(p.tag)} -m ${q(`release: ${p.tag}`)}`
      : `git tag ${qr(p.tag)}`,
    ]),
    git_("push", `push ${p.c.main} and this release's tag alone`,
      [`git push ${qr(p.remote)} ${qr(p.c.main)} ${qr(p.tag)}`]),
    git_("push-tag", "push this release's tag alone", [`git push ${qr(p.remote)} ${qr(p.tag)}`]),
    git_("extract-notes", `extract the ${p.version} changelog entry into $NOTES for whatever publishes it`,
      notesBlock(p)),
    yours("publish-release", "publish the release — this project's own command, written in its rules file from the observations below"),
    ...(p.singleBranch ? [] : [git_("back-merge", `re-sync ${p.c.dev} with ${p.c.main}`,
      [`git switch ${qr(p.c.dev)}`, `git merge ${qr(p.c.main)}`, `git push ${qr(p.remote)} ${qr(p.c.dev)}`])]),
    ...(p.openRelease.length === 1
      ? [git_("rejoin-stabilization", "merge the fix into the open stabilization branch",
          [`git switch ${qr(p.openRelease[0])}`, `git merge ${qr(p.c.main)}`, `git push ${qr(p.remote)} ${qr(p.openRelease[0])}`])]
      : p.openRelease.length > 1
        ? [yours("rejoin-stabilization", `ASK which of ${p.openRelease.join(", ")} receives this fix — never pick silently`)]
        : []),
    // Only ever offered when there IS an ephemeral branch. In a two-branch
    // process `from` is the integration branch itself, and a `delete-branch`
    // step would render `git branch -d <dev>` — a vocabulary entry that
    // deletes the branch the project works on.
    ...((p.hotfix || onHotfix || from.startsWith("release/"))
      ? [git_("delete-branch", "delete the ephemeral branch",
          [`git branch -d ${qr(p.hotfix || onHotfix ? hotfixBranch : from)}`])]
      : []),
  ];
};

// Which steps this shape and phase can use at all, in the SHIPPED default
// process's order. The ORDER is only emitted when the project has no rules
// file; the SET is always used, to filter the catalog — offering
// `cut-stabilization` to a project whose process has no stabilization branch
// is offering a capability it has no use for.
const defaultOrder = (p: PlanInput): readonly string[] => {
  const onRelease = p.branch?.startsWith("release/") === true;
  const onHotfix = p.hotfix || p.branch?.startsWith("hotfix/") === true;
  // On one branch the work is already where it ships from: nothing to
  // integrate, nothing to back-merge.
  const ship = p.singleBranch
    ? ["tag", "push", "extract-notes", "publish-release"]
    : ["integrate", "tag", "push", "extract-notes", "publish-release", "back-merge"];
  return onHotfix
    ? [...(onHotfix && p.branch?.startsWith("hotfix/") === true ? [] : ["cut-hotfix"]),
       "bump-commit", ...ship, "rejoin-stabilization", "delete-branch"]
    : p.c.shape === "full" && !onRelease
      ? ["cut-stabilization", "bump-commit"]
      : p.c.shape === "full"
        ? ["bump-commit", ...ship, "delete-branch"]
        : ["bump-commit", ...ship];
};

// --- checks ---------------------------------------------------------------

type Report = {
  readonly config: ReleaseConfig;
  readonly hotfix: boolean;
  readonly branch?: string;
  readonly clean: boolean;
  readonly remote: string;
  readonly fetch: "ok" | "failed" | "partial" | "no-remote";
  readonly refs: readonly RefState[];
  readonly lastTag?: string;
  readonly rangeLabel: string;
  readonly highestVersion?: string;
  readonly highestSource?: string;
  readonly commits: readonly Commit[];
  readonly nonConventional: readonly string[];
  readonly suggestedBump: Bump;
  readonly currentVersion?: string;
  readonly suggestedVersion?: string;
  readonly preBumped: boolean;
  readonly changelogLatest?: string;
  readonly rule: RuleState;
  readonly inferred?: Inferred;
  readonly migrations: readonly string[];
  readonly singleBranch: boolean;
  readonly repair: readonly string[];
  readonly steps: readonly Step[];
  readonly defaultOrder: readonly string[];
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
};

const buildReport = (root: string, hotfix: boolean, chosen?: string): Report => {
  const rules = ruleState(root);
  const configured = loadReleaseConfig(root, rules);
  // Two long-lived branches is a WORKFLOW, not a fact about git. A project
  // that releases straight off one branch was refused outright ("releases are
  // prepared from dev") for a branch it never had. When dev is neither
  // configured nor present, this is a single-branch project and the steps that
  // move work between two branches simply do not apply.
  const declaresDev = ((): boolean => {
    const r = rawRelease(root);
    const b = (r.branches ?? {}) as Record<string, unknown>;
    return typeof b.dev === "string";
  })();
  const singleBranch = !declaresDev && !refExists(root, configured.dev);
  const config = singleBranch ? { ...configured, dev: configured.main } : configured;
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const remotes = remoteNames(root);
  const remote = configured.remote ?? (remotes.includes("origin") ? "origin" : (remotes[0] ?? "origin"));
  const fetch: Report["fetch"] =
    remotes.length === 0 ? "no-remote" : fetchRefs(root, remotes);

  const status = git(root, ["status", "--porcelain"]);
  const clean = status === "";
  const shallow = isShallow(root);
  const busy = operationsInProgress(root);
  const elsewhere = branchesCheckedOutElsewhere(root);
  // Inherited GIT_DIR / GIT_WORK_TREE silently redirect every git call, so the
  // "facts" would describe one repository and the commands act on another.
  const inheritedGitEnv = (["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"] as const)
    .filter((k) => process.env[k] !== undefined && process.env[k] !== "");
  const ciOwnsVersioning = ciSignals(root).some((c) => c.includes("CI OWNS VERSIONING"));
  const prefix = repoPrefix(root);

  // Git first, working tree last: the checkout is the one place the version
  // can be stale, so it is compared AGAINST the refs, never trusted as the
  // baseline.
  const tags = releaseTags(root, config.tagPrefix);
  // Semver ordering is unavailable for a custom scheme, so the best honest
  // answer is git's own nearest-ancestor tag. It is a fallback and is labelled
  // as one, because it cannot see a tag outside HEAD's ancestry.
  const describeTag = tags.length === 0
    ? git(root, ["describe", "--tags", "--abbrev=0", "--match", `${config.tagPrefix}[0-9]*`])
    : undefined;
  const lastTag = tags[0]?.[0] ?? describeTag;
  const branchRefs = [config.main, config.dev]
    .flatMap<readonly [string, RefState["kind"]]>((b) => [
      ...(refExists(root, b) ? [[b, "branch"] as const] : []),
      ...trackingRefs(root, b).map((r) => [r, "remote"] as const),
    ]);
  const refs: readonly RefState[] = [
    worktreeState(root, config),
    ...branchRefs.map(([ref, kind]) => stateAtRef(root, prefix, config, ref, kind)),
    ...(lastTag !== undefined ? [stateAtRef(root, prefix, config, lastTag, "tag")] : []),
  ];

  // The highest version anyone has ever declared or published, wherever it
  // lives. A release below it is a rollback, whatever the checkout says.
  const declared: readonly (readonly [string, Semver])[] = [
    ...tags.map(([t, s]) => [t, s] as const),
    ...refs.flatMap((r) => {
      const s = r.version === undefined ? undefined : parseSemver(r.version);
      return s === undefined ? [] : [[r.ref, s] as const];
    }),
  ];
  const highest = declared.reduce<readonly [string, Semver] | undefined>(
    (best, cur) => (best === undefined || cmpSemver(cur[1], best[1]) > 0 ? cur : best),
    undefined,
  );

  // The last release tag is the authority for the range, the rollback guard
  // and the pre-bumped test — everything downstream trusts it. Its NAME and
  // its CONTENT were read separately and never compared, so a tag created on
  // the wrong commit (an interrupted or hand-made release) was promoted to
  // authoritative state while the report printed the contradiction plainly.
  const tagRef = refs.find((r) => r.kind === "tag");
  const tagNameVersion = lastTag === undefined
    ? undefined
    : lastTag.slice(config.tagPrefix.length);
  // Both files at the tagged commit must agree with the tag's own name. The
  // changelog was read at that ref and then never compared.
  const tagMismatch = tagNameVersion === undefined ? undefined
    : tagRef?.version !== undefined && tagRef.version !== tagNameVersion
      ? `${lastTag} points at a commit whose ${config.versionFile} declares ${tagRef.version}`
      : tagRef?.changelog !== undefined && tagRef.changelog !== tagNameVersion
        ? `${lastTag} points at a commit whose newest ${config.changelog} entry is ${tagRef.changelog}`
        : undefined;

  const wt = refs[0];
  const currentVersion = wt.version;
  const semver = currentVersion !== undefined ? parseSemver(currentVersion) : undefined;
  // CalVer, epoch-prefixed and four-part schemes are READ fine; what cannot be
  // done is arithmetic on them. Refusing the project outright was as wrong as
  // silently bumping 2026.08.1 to 2026.9.0 — so the state is reported, the
  // suggestion is withheld, and the checks that need ordering are named as
  // skipped rather than quietly passing.
  const scheme: "semver" | "other" | "unreadable" =
    currentVersion === undefined ? "unreadable"
    : semver !== undefined ? "semver"
    : looksLikeVersion(currentVersion) ? "other"
    : "unreadable";
  const changelogLatest = wt.changelog;
  // The notes extraction stops at the next heading, so a version listed twice
  // publishes only the first block — and nobody notices which.
  const dupEntries = ((): number => {
    const cp = join(root, config.changelog);
    if (!existsSync(cp) || changelogLatest === undefined) return 0;
    // The heading is compared as TEXT. A version is data, never a pattern:
    // as a regex, the `+` in `1.0.1+build.7` was a quantifier and this very
    // warning silently disappeared for exactly the versions that need it.
    const heading = `## [${changelogLatest}]`;
    try {
      return readFileSync(cp, "utf8").split("\n").filter((l) => l.startsWith(heading)).length;
    } catch { return 0; }

  })();

  const range = rangeBase(root, config, branch, lastTag);
  // A stray tag matters when it hides a version at or above what we DO see —
  // that is exactly when the range and the suggestion go wrong. It is asked
  // ONLY of a project whose own version is semver: under a calendar or
  // four-part scheme "no recognised tags" is the normal state, not a symptom,
  // and blocking there would refuse the very schemes just made to work.
  const strayHigher = scheme !== "semver" ? [] : foreignTags(root, config.tagPrefix).filter((t) => {
    const m = t.match(/\d+\.\d+\.\d+/);
    const v = m === null ? undefined : parseSemver(m[0]);
    return v !== undefined && (tags.length === 0 || cmpSemver(v, tags[0][1]) >= 0);
  });

  // `--version` supplies what the tool declined to derive; it does not
  // suspend the guards. Accepting it before any comparison let a rollback
  // (0.5.0 under a published 1.0.0) and a duplicate (1.0.0 again) both report
  // "ready", the second rendering a `git tag` that cannot succeed. And a
  // guard that only spoke semver let `0.9` and `1.0.0.rc1` through under
  // that same 1.0.0 — so the supplied version is ordered against EVERY
  // version this repository has declared or published, in whatever scheme
  // both sides share, and one that shares none is refused.
  const chosenTagExists = chosen !== undefined &&
    git(root, ["rev-parse", "--verify", "--quiet", `refs/tags/${config.tagPrefix}${chosen}`]) !== undefined;
  const published: readonly (readonly [string, string])[] = [
    ...(highest !== undefined ? [[highest[0], highest[1].raw] as const] : []),
    ...(lastTag !== undefined && tagNameVersion !== undefined ? [[lastTag, tagNameVersion] as const] : []),
    ...refs.flatMap((r) => (r.version === undefined ? [] : [[r.ref, r.version] as const])),
  ].filter(([, v], i, a) => a.findIndex(([, w]) => w === v) === i);
  const chosenAgainst = chosen === undefined
    ? []
    : published.map(([src, v]) => [src, v, orderVersions(chosen, v)] as const);
  const chosenNotAbove = chosenAgainst.filter(([, , o]) => o !== undefined && o <= 0);
  const chosenUnordered = chosenAgainst.filter(([, , o]) => o === undefined);


  const commits = commitsSince(root, range.base);
  const nonConventional = commits
    .filter(({ subject, body }) => bumpOfCommit(G, subject, body) === "none")
    .map(({ subject }) => subject);

  // Pre-bumped state: version file + changelog already advanced past the last
  // release tag → the declared version IS the release; don't re-bump on top.
  // (Not honored in hotfix mode: a hotfix is always patch-on-tag.)
  const tagSemver = tags[0]?.[1];
  const rolledBack =
    semver !== undefined && tagSemver !== undefined && cmpSemver(semver, tagSemver) < 0;
  // Nothing has ever been tagged: the declared version IS the first release,
  // not a version to bump past. Without this, a repo declaring 0.1.0 in both
  // the version file and the changelog was told to release 0.2.0 — a version
  // whose changelog entry does not exist.
  const firstRelease = !hotfix && tags.length === 0 &&
    semver !== undefined && currentVersion === changelogLatest;
  const preBumped = firstRelease || (!hotfix &&
    semver !== undefined && tagSemver !== undefined &&
    cmpSemver(semver, tagSemver) > 0 && currentVersion === changelogLatest);

  const rawBump = scheme === "other"
    ? "none"
    : maxBump(commits.map(({ subject, body }) => bumpOfCommit(G, subject, body)));
  const commitBump = semver !== undefined ? applyAlphaPolicy(G, rawBump, semver.core[0]) : rawBump;
  const suggestedBump = hotfix ? "patch" : commitBump;
  const suggestedVersion = chosen ?? (preBumped
    ? currentVersion
    : semver !== undefined
      ? nextVersion(semver, suggestedBump)
      : undefined);

  const expectedBranch = hotfix || singleBranch ? config.main : config.dev;
  const onExpectedBranch =
    branch === expectedBranch ||
    (hotfix && branch !== undefined && branch.startsWith("hotfix/")) ||
    (!hotfix && config.shape === "full" && branch !== undefined && branch.startsWith("release/"));

  // Is the branch we are standing on behind its own remote?
  const tracking = branch === undefined ? [] : trackingRefs(root, branch);
  const behindRemote = tracking.flatMap((r) => {
    const d = divergence(root, branch as string, r);
    return d !== undefined && d[1] > 0 ? [[r, d[1]] as const] : [];
  });

  // Light mode releases squash dev into main; skipping the back-merge leaves
  // dev without the release commit and the NEXT release re-squashes it.
  const devBehindMain =
    !hotfix && !singleBranch && refExists(root, config.dev) && refExists(root, config.main)
      ? divergence(root, config.dev, config.main)?.[1] ?? 0
      : 0;

  const staleVersion =
    highest !== undefined && semver !== undefined && cmpSemver(semver, highest[1]) < 0
      ? highest
      : undefined;

  const warnings = [    ...(chosen !== undefined && scheme === "semver" && parseSemver(chosen) === undefined
      ? [`--version ${chosen} is not semver while this project's versions are (${currentVersion}) — the tag and ${config.versionFile} would carry a value the next release cannot bump`] : []),

    ...(fetch === "failed"
      ? [`could not fetch any remote — state verified against LOCAL refs only; they may be stale`] : []),
    ...(fetch === "partial"
      ? [`only some remotes could be fetched (of ${remotes.join(", ")}) — a version published at an unreachable one would be invisible here`] : []),
    ...(remotes.length > 1 && configured.remote === undefined
      ? [`${remotes.length} remotes (${remotes.join(", ")}) and no release.remote set — "${remote}" was assumed for the push commands; set release.remote if this project releases to another`] : []),
    ...(fetch === "no-remote" ? ["no git remote — nothing to verify against beyond this clone"] : []),
    ...(firstRelease
      ? [`first release: nothing is tagged yet, so the declared ${currentVersion} IS the release — do not bump past it`] : []),
    ...(preBumped && !firstRelease
      ? [`pre-bumped: ${config.versionFile} already declares ${currentVersion} (> ${lastTag}) — release the declared version, do not bump again`] : []),
    ...(scheme === "other"
      ? [`version "${currentVersion}" is not semver (calendar or custom scheme) — no bump is derived and the ordering checks (rollback, stale checkout) are SKIPPED, not passed; choose the next version with the user and re-run with --version <chosen> to get the steps${describeTag !== undefined ? `. Range taken from the nearest ancestor tag ${describeTag}` : ""}`] : []),
    ...(semver?.pre !== undefined
      ? [`${currentVersion} is a prerelease — what follows it (another prerelease, or the release) is this project's decision, so no next version is suggested; choose it with the user`] : []),
    ...(singleBranch
      ? [`single-branch project: no "${configured.dev}" branch, so the release happens on "${config.main}" and there is nothing to merge or back-merge`] : []),
    ...(wt.how !== undefined && wt.how.startsWith("matched ")
      ? [`version read by shape (${wt.how}) rather than a JSON key — confirm it is the right one, or set release.versionPattern`] : []),
    ...(!hotfix && !preBumped && scheme === "semver" && suggestedBump === "none" && commits.length > 0
      ? ["no conventional bump signal in the range — choose the bump manually (releasing the current version would duplicate an existing tag)"] : []),
    ...(config.tagStyle !== "lightweight" && lastTag !== undefined &&
        tagObjectType(root, lastTag) === "commit"
      ? [`release.tagStyle is "${config.tagStyle}" but ${lastTag} is a lightweight tag — the policy is applied to the tag this release creates, not retroactively to the baseline`] : []),
    ...(nonConventional.length > 0
      ? [`non-conventional subjects (no bump signal): ${nonConventional.length}`] : []),
    ...(range.widened
      ? [`no back-merge of ${lastTag} found on this branch, so the range starts at the tag — under a squash workflow that can include work already released, making the bump too HIGH; confirm it before accepting`] : []),
    ...(dupEntries > 1
      ? [`${config.changelog} has ${dupEntries} entries headed [${changelogLatest}] — the notes extraction stops at the next heading, so only the first would be published`] : []),
    ...(ciOwnsVersioning && rules.present
      ? ["CI also owns versioning (release-please / semantic-release / changesets) — your rules file decides who releases; make sure only one of you tags"] : []),
    ...(hotfix && config.shape === "full" && openReleaseBranches(root).length > 1
      ? [`${openReleaseBranches(root).length} open stabilization branches — ASK the user which one this hotfix must also merge into; never pick silently`] : []),
  ];

  const blockers = [
    ...configBlockers(config),
    ...refs.flatMap((r) => (r.error === undefined ? [] : [r.error])).filter((e, i, a) => a.indexOf(e) === i),

    ...(branch === undefined ? ["not a git repository"] : []),
    ...(branch !== undefined && !onExpectedBranch
      ? [hotfix
          ? `on branch "${branch}" — hotfixes are cut from "${config.main}" (or continue an existing hotfix/* branch)`
          : `on branch "${branch}" — releases are prepared from "${config.dev}"`] : []),
    ...(clean ? [] : ["working tree not clean — commit or stash first"]),
    ...(inheritedGitEnv.length > 0
      ? [`${inheritedGitEnv.join(", ")} set in the environment — every fact here would come from whatever repository that points at, while the commands act on this one; unset ${inheritedGitEnv.join(" and ")} and re-run`] : []),
    ...(configured.remote !== undefined && !remotes.includes(configured.remote)
      ? [`release.remote ${JSON.stringify(configured.remote)} is not a remote of this repository (${remotes.length === 0 ? "it has none" : `has ${remotes.join(", ")}`}) — every push and pull below would name a remote that does not exist`] : []),
    ...[config.main, config.dev].filter((b, i, a) => a.indexOf(b) === i && elsewhere.includes(b))
      .map((b) => `"${b}" is checked out in another worktree — git refuses to switch to it here, so the plan would stop at its first command`),
    ...(busy.length > 0
      ? [`${busy.join(" and ")} is in progress — the release's own commit would COMPLETE it, turning an unrelated operation into the release commit; finish or abort it first`] : []),
    ...(["versionFile", "changelog"] as const)
      .filter((k) => escapesRoot(root, config[k]))
      .map((k) => `release.${k} ${JSON.stringify(config[k])} resolves OUTSIDE the project (via a symlink) — the release would read, and the bump would write, a file this project does not own`),
    ...(tagMismatch !== undefined
      ? [`${tagMismatch} — the tag and its contents disagree, and every number below (the unreleased range, the rollback guard, the pre-bumped test) trusts this tag; re-point or re-cut it before releasing`] : []),
    ...(chosenTagExists
      ? [`--version ${chosen}: the tag ${config.tagPrefix}${chosen} already exists — releasing it again would move or duplicate a published version`] : []),
    ...chosenUnordered.map(([src, v]) =>
      `--version ${chosen} cannot be ordered against ${v} (${src}) — the two are neither both semver nor both dotted numbers, so the rollback guard would be skipped, not passed; supply the version in this project's own scheme`),

    ...(shallow
      ? ["shallow clone — the unreleased range and therefore the bump are computed from truncated history and would be wrong"] : []),
    ...(strayHigher.length > 0
      ? [`tag(s) carrying a version are not recognised by tagPrefix ${JSON.stringify(config.tagPrefix)}: ${strayHigher.join(", ")} — invisible here, so the range and the suggested version can land BELOW what is already published; fix release.tagPrefix or the tag`] : []),
    ...(ciOwnsVersioning && !rules.present
      ? ["CI appears to own versioning (release-please / semantic-release / changesets) and this project has no .supermodo/rules/release.md — a manual release would fight it. Decide which one releases, write it into the rules file, then re-run"] : []),
    ...behindRemote.map(([r, n]) =>
      `"${branch}" is ${n} commit(s) behind ${r} — this checkout is STALE; releasing from it would drop published work`),
    ...(devBehindMain > 0
      ? [`"${config.dev}" is ${devBehindMain} commit(s) behind "${config.main}" — the back-merge from the last release never happened; releasing now re-squashes released work`] : []),
    ...chosenNotAbove.map(([src, v, o]) => o === 0
      ? `--version ${chosen} is the version already declared or published here (${v}, ${src}) — nothing would be released`
      : `--version ${chosen} is not above ${v} (${src}) — a release must move the version forward`),

    ...(staleVersion !== undefined
      ? [`${config.versionFile} in this checkout declares ${currentVersion}, but ${staleVersion[0]} declares ${staleVersion[1].raw} — a release from here would roll the version BACKWARDS`] : []),
    ...(currentVersion === undefined
      ? [`cannot read ${config.versionPath} from ${config.versionFile}`] : []),
    ...(scheme === "unreadable" && currentVersion !== undefined
      ? [`version "${currentVersion}" is neither semver nor a recognisable version`] : []),
    ...(changelogLatest === undefined ? [`no "## [x.y.z]" entry found in ${config.changelog}`] : []),
    ...(currentVersion !== undefined && changelogLatest !== undefined && currentVersion !== changelogLatest && !preBumped
      ? [`${config.versionFile} has ${currentVersion} but latest ${config.changelog} entry is ${changelogLatest}`] : []),
    ...(rolledBack
      ? [`version ${currentVersion} is BEHIND the last release tag ${lastTag} — a release would roll the version back`] : []),
    ...(hotfix && semver !== undefined && tagSemver !== undefined && cmpSemver(semver, tagSemver) > 0
      ? [`version ${currentVersion} is already ahead of ${lastTag} — a hotfix is patch-on-tag; resolve the pending bump first (release it from ${config.dev}, or revert it)`] : []),
    // A hotfix starts FROM the tagged state — zero commits since the tag is
    // normal there; the fix commits come after the branch is cut.
    ...(commits.length === 0 && !preBumped && !hotfix
      ? [`no commits since ${range.label} — nothing to release`] : []),
  ];

  const repair = [
    ...(fetch === "failed" || fetch === "partial" ? [`git fetch --tags --prune --all`] : []),
    ...(shallow ? ["git fetch --unshallow --tags"] : []),
    ...behindRemote.map(([r]) => `git merge --ff-only ${qr(r)}`),
    ...(devBehindMain > 0 ? [`git switch ${qr(config.dev)}`, `git merge ${qr(config.main)}`] : []),
    ...(branch !== undefined && !onExpectedBranch ? [`git switch ${qr(expectedBranch)}`] : []),
  ];

  // Steps are rendered only for a state the preflight could actually verify.
  // Commands built on an unknown version or an unresolved blocker are wrong
  // somewhere the user cannot see.
  const planInput = suggestedVersion === undefined ? undefined : {
        c: config,
        version: suggestedVersion,
        tag: `${config.tagPrefix}${suggestedVersion}`,
        remote,
        hotfix,
        branch,
        hasFragments: existsSync(join(root, config.fragmentDir)),
        openRelease: config.shape === "full" ? openReleaseBranches(root) : [],
        singleBranch,
      };
  const renderable = blockers.length === 0 && planInput !== undefined;
  const steps = renderable ? allSteps(planInput) : [];
  const order = renderable && !rules.present ? defaultOrder(planInput) : [];

  return {
    config, hotfix, branch, clean, remote, fetch, refs, lastTag, rangeLabel: range.label,
    rule: rules,
    singleBranch,
    inferred: rules.present ? undefined : inferProcess(root, remote, config),
    migrations: MIGRATIONS.filter(([k]) => rawRelease(root)[k] !== undefined).map(([, m]) => m),
    highestVersion: highest?.[1].raw, highestSource: highest?.[0],
    commits, nonConventional, suggestedBump, currentVersion, suggestedVersion,
    preBumped, changelogLatest, repair, steps, defaultOrder: order, warnings, blockers,
  };
};

// --- output ---------------------------------------------------------------

const render = (r: Report): readonly string[] => [
  `shape: ${r.config.shape}${r.hotfix ? " (HOTFIX)" : ""} (${r.singleBranch ? `single branch ${r.config.main}` : `${r.config.dev} → ${r.config.main}`}, ${r.config.mergeStrategy}, remote ${r.remote})`,
  `branch: ${r.branch ?? "?"}  clean: ${r.clean ? "yes" : "NO"}  fetch: ${r.fetch}`,
  `version state (git first, working tree last):`,
  ...r.refs.map((s) =>
    `  ${s.ref.padEnd(24)} ${s.version ?? "—"}${s.changelog !== undefined && s.changelog !== s.version ? `  (changelog ${s.changelog})` : ""}`),
  `highest version anywhere: ${r.highestVersion ?? "(none)"}${r.highestSource !== undefined ? ` — ${r.highestSource}` : ""}`,
  `last release tag: ${r.lastTag ?? "(none)"}`,
  `unreleased commits since ${r.rangeLabel}: ${r.commits.length}`,
  ...r.commits.map(({ subject }) => `  · ${subject}`),
  `suggested bump: ${r.suggestedBump}${r.suggestedVersion !== undefined ? ` → ${r.suggestedVersion}` : " → (no suggestion)"} (alpha policy: 0.x breaking = minor)`,
  ...r.warnings.map((w) => `  ! ${w}`),
  ...(r.migrations.length === 0 ? [] : [
    "", "CONFIG MIGRATIONS (run these through `config` before releasing):",
    ...r.migrations.map((m) => `  → ${m}`),
  ]),
  ...(r.inferred === undefined ? [] : [
    "",
    "PROCESS EVIDENCE (no rules file yet — read this, propose the process, get it confirmed, write it once):",
    ...r.inferred.evidence.map((e) => `  · ${e}`),
  ]),
  `process: ${r.rule.present
    ? `.supermodo/rules/release.md (from template ${r.rule.template ?? "?"} ${r.rule.templateVersion ?? "?"}) — IT owns the order below`
    : "no rules file — the shipped default order applies"}`,
  ...(r.blockers.length > 0
    ? ["", "BLOCKERS:", ...r.blockers.map((b) => `  ✗ ${b}`),
       ...(r.repair.length > 0 ? ["", "REPAIR FIRST:", ...r.repair.map((c) => `  ${c}`)] : [])]
    : ["", "ready: preflight clean", "",
       r.rule.present
         ? "STEPS (values verified; run them in the order YOUR rules file names — no default order is offered):"
         : "STEPS (values verified; shipped default order — no rules file):",
       ...(r.rule.present ? r.steps : r.defaultOrder.flatMap((id) => r.steps.filter((x) => x.id === id)))
         .flatMap((st) => [
           `  [${st.id}]${st.supplied === "project" ? " (YOURS — the skill does not invent this)" : ""} ${st.title}`,
           ...st.commands.map((c) => `    ${c}`),
         ]),
       ...(r.rule.present || r.defaultOrder.length === 0 ? [] : (() => {
         const rest = r.steps.filter((st) => !r.defaultOrder.includes(st.id)).map((st) => st.id);
         return rest.length === 0 ? [] : ["", `  also available to a rules file: ${rest.join(", ")}`];
       })())]),
];

const main = (): number => {
  const args = process.argv.slice(2);
  const hotfix = args.includes("--hotfix");
  const vi = args.indexOf("--version");
  const chosenRaw = vi === -1 ? undefined : args[vi + 1];
  // Supplied by a human, so it is validated like any other external value.
  const chosen = chosenRaw !== undefined && /^[0-9][0-9A-Za-z.+-]*$/.test(chosenRaw)
    ? chosenRaw : undefined;
  if (chosenRaw !== undefined && chosen === undefined) {
    console.error(`release-check: --version ${JSON.stringify(chosenRaw)} is not a version`);
    return 1;
  }
  const root = resolve(args.filter((a) => a !== chosenRaw).find((a) => !a.startsWith("--")) ?? ".");
  const report = buildReport(root, hotfix, chosen);
  render(report).forEach((l) => console.log(l));
  console.log(JSON.stringify({
    shape: report.config.shape,
    migrations: report.migrations,
    hotfix: report.hotfix,
    branch: report.branch,
    clean: report.clean,
    remote: report.remote,
    fetch: report.fetch,
    refs: report.refs,
    lastTag: report.lastTag ?? null,
    rangeLabel: report.rangeLabel,
    highestVersion: report.highestVersion ?? null,
    highestSource: report.highestSource ?? null,
    commitCount: report.commits.length,
    suggestedBump: report.suggestedBump,
    currentVersion: report.currentVersion ?? null,
    suggestedVersion: report.suggestedVersion ?? null,
    preBumped: report.preBumped,
    changelogLatest: report.changelogLatest ?? null,
    rule: report.rule,
    inferred: report.inferred ?? null,
    repair: report.repair,
    steps: report.steps,
    defaultOrder: report.defaultOrder,
    warnings: report.warnings,
    blockers: report.blockers,
  }));
  return report.blockers.length === 0 ? 0 : 1;
};

process.exit(main());
