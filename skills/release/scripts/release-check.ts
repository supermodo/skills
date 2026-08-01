// supermodo release-check — deterministic, READ-ONLY release preflight.
// Inspects git state and Conventional Commits since the last release tag,
// computes the suggested semver bump, and verifies version/changelog
// consistency. Mutates nothing; only read-only git commands are executed.
// Usage: node release-check.ts [project-root] [--hotfix]   (Node ≥ 22.18)
//   --hotfix: preflight for cutting a hotfix (expects the main branch or an
//   existing hotfix/* branch instead of dev; bump is always patch).
// Output: human-readable lines + a final JSON line (machine-readable).
// Exit 0 = ready to release; exit 1 = blockers found.

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

type ReleaseConfig = {
  readonly mode: "light" | "full";
  readonly main: string;
  readonly dev: string;
  readonly versionFile: string;
  readonly versionPath: string;
  readonly changelog: string;
  readonly tagPrefix: string;
  readonly mergeStrategy: "squash" | "merge";
  readonly githubRelease: boolean;
};

type Bump = "major" | "minor" | "patch" | "none";

const DEFAULTS: ReleaseConfig = {
  mode: "light",
  main: "main",
  dev: "dev",
  versionFile: "package.json",
  versionPath: "version",
  changelog: "CHANGELOG.md",
  tagPrefix: "v",
  mergeStrategy: "squash",
  githubRelease: true,
};

// --- pure helpers --------------------------------------------------------

const dig = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>(
    (acc, key) => (typeof acc === "object" && acc !== null ? (acc as Record<string, unknown>)[key] : undefined),
    obj,
  );

const parseSemver = (v: string): readonly [number, number, number] | undefined => {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
};

const cmpSemver = (a: readonly [number, number, number], b: readonly [number, number, number]): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const CC_RE = /^(feat|fix|refactor|perf|docs|test|chore|build|ci|style|revert)(\([^)]*\))?(!)?:\s/;
const BREAKING_RE = /^BREAKING[ -]CHANGE:/m;

// A commit = subject + body (Conventional Commits: breaking via "!" in the
// subject OR a "BREAKING CHANGE:"/"BREAKING-CHANGE:" footer in the body).
const bumpOfCommit = (subject: string, body: string): Bump => {
  const m = subject.match(CC_RE);
  if (m === null) return "none";
  if (m[3] === "!" || BREAKING_RE.test(body)) return "major";
  return m[1] === "feat" ? "minor" : "patch";
};

const maxBump = (bumps: readonly Bump[]): Bump =>
  (["major", "minor", "patch"] as const).find((b) => bumps.includes(b)) ?? "none";

// Alpha (0.x) policy: breaking changes are MINOR, everything else PATCH.
const applyAlphaPolicy = (bump: Bump, major: number): Bump =>
  major === 0 && bump === "major" ? "minor" : bump;

const nextVersion = ([ma, mi, pa]: readonly [number, number, number], bump: Bump): string | undefined =>
  bump === "major" ? `${ma + 1}.0.0`
  : bump === "minor" ? `${ma}.${mi + 1}.0`
  : bump === "patch" ? `${ma}.${mi}.${pa + 1}`
  : undefined; // "none": no bump signal — never suggest re-releasing the current version

// Git refs and file paths coming from config are data, never options: a value
// that could be parsed as a git option or escape the project is a blocker.
// Per git-check-ref-format: rules apply PER slash-separated component.
const badRef = (v: string): boolean =>
  v.length === 0 || v.startsWith("-") || /[\s~^:?*[\\\x00-\x1f]/.test(v) ||
  v.includes("..") || v.includes("@{") || v.endsWith(".") ||
  !v.split("/").every((seg) =>
    seg.length > 0 && !seg.startsWith(".") && !seg.endsWith(".lock"));
const badPath = (v: string): boolean =>
  v.length === 0 || v.startsWith("-") || v.startsWith("/") || v.split("/").includes("..") || /[\x00-\x1f]/.test(v);
const badPrefix = (v: string): boolean =>
  v.startsWith("-") || /[\s~^:?*[\\\x00-\x1f]/.test(v);

const configBlockers = (c: ReleaseConfig): readonly string[] => [
  ...(badRef(c.main) ? [`release.branches.main ${JSON.stringify(c.main)} is not a safe git ref`] : []),
  ...(badRef(c.dev) ? [`release.branches.dev ${JSON.stringify(c.dev)} is not a safe git ref`] : []),
  ...(badPrefix(c.tagPrefix) ? [`release.tagPrefix ${JSON.stringify(c.tagPrefix)} is not a safe tag prefix`] : []),
  ...(badPath(c.versionFile) ? [`release.versionFile ${JSON.stringify(c.versionFile)} is not a safe root-relative path`] : []),
  ...(badPath(c.changelog) ? [`release.changelog ${JSON.stringify(c.changelog)} is not a safe root-relative path`] : []),
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

const readJson = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
};

const loadReleaseConfig = (root: string): ReleaseConfig => {
  const cfg = readJson(join(root, "skills.config.json"));
  const r = (typeof cfg === "object" && cfg !== null
    ? (cfg as Record<string, unknown>).release
    : undefined) as Partial<Record<string, unknown>> | undefined;
  const branches = (r?.branches ?? {}) as Partial<Record<string, string>>;
  return {
    mode: (r?.mode as ReleaseConfig["mode"]) ?? DEFAULTS.mode,
    main: branches.main ?? DEFAULTS.main,
    dev: branches.dev ?? DEFAULTS.dev,
    versionFile: (r?.versionFile as string) ?? DEFAULTS.versionFile,
    versionPath: (r?.versionPath as string) ?? DEFAULTS.versionPath,
    changelog: (r?.changelog as string) ?? DEFAULTS.changelog,
    tagPrefix: (r?.tagPrefix as string) ?? DEFAULTS.tagPrefix,
    mergeStrategy: (r?.mergeStrategy as ReleaseConfig["mergeStrategy"]) ?? DEFAULTS.mergeStrategy,
    githubRelease: (r?.githubRelease as boolean) ?? DEFAULTS.githubRelease,
  };
};

// Last RELEASE tag: nearest ancestor tag matching <tagPrefix><digit>… — never
// an unrelated tag like deploy-staging or backup-2026.
const lastReleaseTag = (root: string, tagPrefix: string): string | undefined =>
  git(root, ["describe", "--tags", "--abbrev=0", "--match", `${tagPrefix}[0-9]*`]);

type Commit = { readonly subject: string; readonly body: string };

const commitsSince = (root: string, lastTag: string | undefined): readonly Commit[] => {
  const range = lastTag === undefined ? [] : [`${lastTag}..HEAD`];
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

// --- checks ---------------------------------------------------------------

type Report = {
  readonly config: ReleaseConfig;
  readonly hotfix: boolean;
  readonly branch?: string;
  readonly clean: boolean;
  readonly lastTag?: string;
  readonly commits: readonly Commit[];
  readonly nonConventional: readonly string[];
  readonly suggestedBump: Bump;
  readonly currentVersion?: string;
  readonly suggestedVersion?: string;
  readonly preBumped: boolean;
  readonly changelogLatest?: string;
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
};

const buildReport = (root: string, hotfix: boolean): Report => {
  const config = loadReleaseConfig(root);
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = git(root, ["status", "--porcelain"]);
  const clean = status === "";
  const lastTag = lastReleaseTag(root, config.tagPrefix);
  const commits = commitsSince(root, lastTag);
  const nonConventional = commits
    .filter(({ subject, body }) => bumpOfCommit(subject, body) === "none")
    .map(({ subject }) => subject);

  const versionRaw = dig(readJson(join(root, config.versionFile)), config.versionPath);
  const currentVersion = typeof versionRaw === "string" ? versionRaw : undefined;
  const semver = currentVersion !== undefined ? parseSemver(currentVersion) : undefined;

  const changelogPath = join(root, config.changelog);
  const changelogLatest = existsSync(changelogPath)
    ? readFileSync(changelogPath, "utf8").match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1]
    : undefined;

  // Pre-bumped state: version file + changelog already advanced past the last
  // release tag → the declared version IS the release; don't re-bump on top.
  // (Not honored in hotfix mode: a hotfix is always patch-on-tag.)
  const tagSemver = lastTag !== undefined ? parseSemver(lastTag.slice(config.tagPrefix.length)) : undefined;
  const rolledBack =
    semver !== undefined && tagSemver !== undefined && cmpSemver(semver, tagSemver) < 0;
  const preBumped = !hotfix &&
    semver !== undefined && tagSemver !== undefined &&
    cmpSemver(semver, tagSemver) > 0 && currentVersion === changelogLatest;

  const rawBump = maxBump(commits.map(({ subject, body }) => bumpOfCommit(subject, body)));
  const commitBump = semver !== undefined ? applyAlphaPolicy(rawBump, semver[0]) : rawBump;
  const suggestedBump = hotfix ? "patch" : commitBump;
  const suggestedVersion = preBumped
    ? currentVersion
    : semver !== undefined
      ? nextVersion(semver, suggestedBump)
      : undefined;

  const expectedBranch = hotfix ? config.main : config.dev;
  const onExpectedBranch =
    branch === expectedBranch || (hotfix && branch !== undefined && branch.startsWith("hotfix/"));

  const warnings = [
    ...(preBumped
      ? [`pre-bumped: ${config.versionFile} already declares ${currentVersion} (> ${lastTag}) — release the declared version, do not bump again`] : []),
    ...(!hotfix && !preBumped && suggestedBump === "none" && commits.length > 0
      ? ["no conventional bump signal in the range — choose the bump manually (releasing the current version would duplicate an existing tag)"] : []),
    ...(nonConventional.length > 0
      ? [`non-conventional subjects (no bump signal): ${nonConventional.length}`] : []),
  ];

  const blockers = [
    ...configBlockers(config),
    ...(branch === undefined ? ["not a git repository"] : []),
    ...(branch !== undefined && !onExpectedBranch
      ? [hotfix
          ? `on branch "${branch}" — hotfixes are cut from "${config.main}" (or continue an existing hotfix/* branch)`
          : `on branch "${branch}" — releases are prepared from "${config.dev}"`] : []),
    ...(clean ? [] : ["working tree not clean — commit or stash first"]),
    ...(currentVersion === undefined
      ? [`cannot read ${config.versionPath} from ${config.versionFile}`] : []),
    ...(semver === undefined && currentVersion !== undefined
      ? [`version "${currentVersion}" is not x.y.z semver`] : []),
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
      ? [`no commits since ${lastTag ?? "repo start"} — nothing to release`] : []),
  ];

  return {
    config, hotfix, branch, clean, lastTag, commits, nonConventional,
    suggestedBump, currentVersion, suggestedVersion, preBumped, changelogLatest,
    warnings, blockers,
  };
};

// --- output ---------------------------------------------------------------

const render = (r: Report): readonly string[] => [
  `mode: ${r.config.mode}${r.hotfix ? " (HOTFIX)" : ""} (${r.config.dev} → ${r.config.main}, ${r.config.mergeStrategy})`,
  `branch: ${r.branch ?? "?"}  clean: ${r.clean ? "yes" : "NO"}`,
  `last release tag: ${r.lastTag ?? "(none)"}  commits since: ${r.commits.length}`,
  ...r.commits.map(({ subject }) => `  · ${subject}`),
  `current version: ${r.currentVersion ?? "?"}  changelog latest: ${r.changelogLatest ?? "?"}`,
  `suggested bump: ${r.suggestedBump}${r.suggestedVersion !== undefined ? ` → ${r.suggestedVersion}` : " → (no suggestion)"} (alpha policy: 0.x breaking = minor)`,
  ...r.warnings.map((w) => `  ! ${w}`),
  ...(r.blockers.length > 0
    ? ["", "BLOCKERS:", ...r.blockers.map((b) => `  ✗ ${b}`)]
    : ["", "ready: preflight clean"]),
];

const main = (): number => {
  const args = process.argv.slice(2);
  const hotfix = args.includes("--hotfix");
  const root = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
  const report = buildReport(root, hotfix);
  render(report).forEach((l) => console.log(l));
  console.log(JSON.stringify({
    mode: report.config.mode,
    hotfix: report.hotfix,
    branch: report.branch,
    clean: report.clean,
    lastTag: report.lastTag ?? null,
    commitCount: report.commits.length,
    suggestedBump: report.suggestedBump,
    currentVersion: report.currentVersion ?? null,
    suggestedVersion: report.suggestedVersion ?? null,
    preBumped: report.preBumped,
    changelogLatest: report.changelogLatest ?? null,
    warnings: report.warnings,
    blockers: report.blockers,
  }));
  return report.blockers.length === 0 ? 0 : 1;
};

process.exit(main());
