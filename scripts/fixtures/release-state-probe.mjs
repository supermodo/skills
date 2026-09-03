// Probe for skills/release/scripts/release-check.ts — proves the preflight
// reads version state from GIT (every branch and tag, not just HEAD's own
// ancestry), reads JSONC version files, and generates its command sequence
// from the project's config rather than from a baked-in template.
// Builds throwaway git repositories in a temp dir; mutates nothing else.
// Prints one `case=result` line per row; scripts/check.ts compares them.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonc } from "../../skills/config/scripts/jsonc.ts";

const CONFIG_CHECK = resolve(dirname(fileURLToPath(import.meta.url)), "../../skills/config/scripts/config-check.ts");
const CHECK = resolve(dirname(fileURLToPath(import.meta.url)), "../../skills/release/scripts/release-check.ts");

// The ambient git config must not reach these repos: a maintainer's
// commit.gpgsign or init.defaultBranch would decide whether the probe passes.
const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "probe", GIT_AUTHOR_EMAIL: "probe@example.invalid",
  GIT_COMMITTER_NAME: "probe", GIT_COMMITTER_EMAIL: "probe@example.invalid",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

const git = (cwd, ...args) =>
  execFileSync("git", ["-C", cwd, ...args], { env: ENV, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

const put = (root, rel, text) => {
  mkdirSync(join(root, dirname(rel)), { recursive: true });
  writeFileSync(join(root, rel), text, "utf8");
};

const commit = (root, subject) => { git(root, "add", "-A"); git(root, "commit", "-q", "-m", subject); };

const newRepo = () => {
  const root = mkdtempSync(join(tmpdir(), "supermodo-release-"));
  git(root, "init", "-q", "-b", "main");
  return root;
};

const changelog = (v) => `# Changelog\n\n## [${v}] - 2026-01-01\n\n- thing\n`;

// release-check exits 1 when it finds blockers; the JSON line is still on
// stdout, and the blockers are exactly what several of these cases assert.
const runRaw = (root, flags) => {
  const out = (() => {
    try {
      return execFileSync("node", [CHECK, root, ...flags],
        { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) { return e.stdout?.toString() ?? ""; }
  })();
  const last = out.trim().split("\n").at(-1) ?? "";
  try { return JSON.parse(last); } catch { return { blockers: ["PROBE: no JSON line"], steps: [], defaultOrder: [], refs: [], warnings: [], repair: [] }; }
};

const run = (root, ...flags) => runRaw(root, flags);

// The commands in the order the result says to run them: the shipped default
// order when there is no rules file, and nothing at all when there is one.
const flat = (j) => j.defaultOrder.flatMap((id) => (j.steps.find((s) => s.id === id)?.commands) ?? []);

const clean2 = () => {
  const r = repo();
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  commit(r, "chore: init");
  git(r, "tag", "v1.0.0");
  git(r, "switch", "-q", "-c", "dev");
  put(r, "src.txt", "x");
  commit(r, "feat: add a thing");
  return r;
};

const rows = [];
const row = (k, v) => rows.push([k, v]);
const temps = [];
const repo = () => { const r = newRepo(); temps.push(r); return r; };

// --- 1. a JSONC version file ---------------------------------------------
// deno.jsonc is JSONC by definition. Strict JSON.parse reports "cannot read
// version" here, and the whole release stops on a file that is perfectly
// valid for its own toolchain.
{
  const r = repo();
  put(r, "deno.jsonc", `{
  // the app version lives here
  "name": "app",
  "homepage": "https://example.invalid/a//b",
  "version": "1.0.0", /* keep in sync with the tag */
}
`);
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  put(r, "skills.config.json", JSON.stringify({ release: { versionFile: "deno.jsonc" } }));
  commit(r, "chore: init");
  git(r, "tag", "v1.0.0");
  git(r, "switch", "-q", "-c", "dev");
  put(r, "src.txt", "x");
  commit(r, "feat: add a thing");
  const j = run(r);
  row("jsonc-version", j.currentVersion ?? "UNREADABLE");
  row("jsonc-suggested", j.suggestedVersion ?? "none");
}

// Direct assertions on the parser, including the negative control: the exact
// input strict JSON rejects, and the string contents it must NOT touch.
{
  const src = `{ // c\n  "a": "x, } //not a comment", /* b */\n  "list": [1,],\n}`;
  row("jsonc-strict-fails", (() => { try { JSON.parse(src); return "no"; } catch { return "yes"; } })());
  const v = parseJsonc(src);
  row("jsonc-string-intact", v.a === "x, } //not a comment" ? "yes" : "no");
  row("jsonc-trailing-comma", Array.isArray(v.list) && v.list.length === 1 ? "yes" : "no");
}

// --- 2. the highest tag is not in HEAD's ancestry -------------------------
// A hotfix tagged on main is invisible to `git describe` from dev. Cutting
// the next release from dev then numbers it BELOW a published version.
{
  const r = repo();
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  commit(r, "chore: init");
  git(r, "tag", "v1.0.0");
  git(r, "switch", "-q", "-c", "dev");
  put(r, "src.txt", "x");
  commit(r, "feat: dev work");
  git(r, "switch", "-q", "main");
  put(r, "package.json", JSON.stringify({ version: "1.0.1" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.1"));
  commit(r, "fix: hotfix");
  git(r, "tag", "v1.0.1");
  git(r, "switch", "-q", "dev");
  const j = run(r);
  row("cross-branch-tag", j.lastTag ?? "none");
  row("cross-branch-highest", j.highestVersion ?? "none");
  row("stale-checkout", j.blockers.some((b) => b.includes("BACKWARDS")) ? "blocked" : "MISSED");
  row("behind-main", j.blockers.some((b) => b.includes("behind")) ? "blocked" : "MISSED");
  row("stale-repair", j.repair.includes("git merge main") ? "offered" : "MISSED");
  row("no-steps-when-blocked", j.steps.length === 0 ? "yes" : "no");
}

// --- 3. the squash back-merge bounds the unreleased range -----------------
// After a squash release dev's own commits are never ancestors of the tag, so
// `<tag>..HEAD` keeps every commit dev ever made and an old released `feat:`
// inflates today's patch into a minor.
{
  const r = repo();
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  commit(r, "chore: init");
  git(r, "tag", "v1.0.0");
  git(r, "switch", "-q", "-c", "dev");
  put(r, "a.txt", "a"); commit(r, "feat: released feature one");
  put(r, "b.txt", "b"); commit(r, "feat: released feature two");
  put(r, "package.json", JSON.stringify({ version: "1.1.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.1.0"));
  commit(r, "chore(release): v1.1.0");
  git(r, "switch", "-q", "main");
  git(r, "merge", "--squash", "-q", "dev");
  git(r, "commit", "-q", "-m", "release: v1.1.0");
  git(r, "tag", "v1.1.0");
  git(r, "switch", "-q", "dev");
  git(r, "merge", "-q", "--no-ff", "main", "-m", "Merge branch 'main' into dev");
  put(r, "c.txt", "c"); commit(r, "fix: one new fix");
  const j = run(r);
  row("backmerge-range", String(j.commitCount));
  row("backmerge-bump", j.suggestedBump);
  row("backmerge-version", j.suggestedVersion ?? "none");
}

// --- 4. the sequence is generated from config, not from a template --------
{
  const clean = (extra) => {
    const r = repo();
    put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
    put(r, "CHANGELOG.md", changelog("1.0.0"));
    if (extra !== undefined) put(r, "skills.config.json", JSON.stringify(extra));
    commit(r, "chore: init");
    // Tag with the prefix this fixture CONFIGURES — a project whose tags do
    // not match its own tagPrefix is a (correctly) blocked project, not a
    // baseline for testing renaming.
    git(r, "tag", `${extra?.release?.tagPrefix ?? "v"}1.0.0`);
    const dev = extra?.release?.branches?.dev ?? "dev";
    git(r, "switch", "-q", "-c", dev);
    put(r, "src.txt", "x");
    commit(r, "feat: add a thing");
    return r;
  };

  const d = run(clean(undefined));
  const cmds = flat(d);
  const plan = cmds.join("\n");
  row("plan-clean", d.blockers.length === 0 ? "ready" : `BLOCKED:${d.blockers[0]}`);
  row("plan-add", cmds[0] ?? "none");
  row("plan-tag", cmds.includes("git tag v1.1.0") ? "yes" : "no");
  row("plan-one-tag", cmds.includes("git push origin main v1.1.0") && !plan.includes("--tags") ? "yes" : "no");
  row("plan-backmerge", cmds.includes("git merge main") ? "yes" : "no");
  row("plan-gh", plan.includes("gh ") ? "LEAKED" : "clean");
  // Every -m message single-quoted: an interactive shell expands `!` inside
  // double quotes and refuses the line, so a plan the user cannot paste is
  // not a plan.
  row("plan-quoted", cmds.filter((c) => c.includes(" -m ")).every((c) => c.includes(" -m '")) ? "yes" : "no");
  // The default order is the shipped process, and it must still be the
  // shipped process: bump before integrate, tag before push, back-merge last.
  row("plan-order", d.defaultOrder.join(">"));

  // Renamed everything: nothing above may survive unchanged.
  const rn = run(clean({
    release: {
      branches: { main: "trunk", dev: "integration" },
      mergeStrategy: "merge", tagPrefix: "release-", forge: "none",
    },
  }));
  const rp = flat(rn).join("\n");
  row("renamed-clean", rn.blockers.length === 0 ? "ready" : `BLOCKED:${rn.blockers[0]}`);
  row("renamed-merge", rp.includes("git merge --no-ff integration -m 'release: release-1.1.0'") ? "yes" : "no");
  row("renamed-no-squash", rp.includes("--squash") ? "LEAKED" : "clean");
  row("renamed-tag", flat(rn).includes("git tag release-1.1.0") ? "yes" : "no");
  row("renamed-no-gh", rp.includes("gh release") ? "LEAKED" : "clean");
  row("renamed-no-default-branch", /\b(main|dev)\b/.test(rp) ? "LEAKED" : "clean");
}

// --- 5. a hotfix rejoins the open stabilization branch --------------------
// A fix that reaches main and dev but not the branch about to become the next
// release is a fix that ships and then un-ships itself.
{
  const mk = (branches) => {
    const r = repo();
    put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
    put(r, "CHANGELOG.md", changelog("1.0.0"));
    put(r, ".supermodo/rules/release.md", `---
rule: release
applies-to: [release]
description: stabilize then ship
template: full
template-version: 0.6.0
---

## Process

1. Cut, stabilize, ship.
`);
    commit(r, "chore: init");
    git(r, "tag", "v1.0.0");
    branches.forEach((b) => git(r, "branch", b));
    return r;
  };
  const one = run(mk(["release/1.1.0"]), "--hotfix");
  const stepCmds = (j, id) => (j.steps.find((st) => st.id === id)?.commands) ?? [];
  row("hotfix-rejoin", stepCmds(one, "rejoin-stabilization").includes("git switch release/1.1.0") ? "yes" : "no");
  row("hotfix-patch", one.suggestedVersion ?? "none");
  const many = run(mk(["release/1.1.0", "release/1.2.0"]), "--hotfix");
  row("hotfix-many-asks", many.warnings.some((w) => w.includes("ASK the user which")) ? "asks" : "MISSED");
  row("hotfix-many-no-pick",
    stepCmds(many, "rejoin-stabilization").some((c) => c.startsWith("git switch release/")) ? "PICKED" : "clean");
}

// --- 6. the fetch path, against a local remote ---------------------------
// Verifying against remote-tracking refs that went stale days ago is
// verifying nothing, so the preflight refreshes them first. A file:// remote
// exercises the real code path without a network.
{
  const origin = repo();
  put(origin, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(origin, "CHANGELOG.md", changelog("1.0.0"));
  commit(origin, "chore: init");
  git(origin, "tag", "v1.0.0");
  git(origin, "switch", "-q", "-c", "dev");
  put(origin, "a.txt", "a"); commit(origin, "feat: shared work");

  const clone = mkdtempSync(join(tmpdir(), "supermodo-clone-"));
  temps.push(clone);
  execFileSync("git", ["clone", "-q", origin, clone], { env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  git(clone, "switch", "-q", "dev");

  // The remote moves AFTER the clone: without a fetch the checkout still
  // believes it is current, which is the exact bug.
  put(origin, "b.txt", "b"); commit(origin, "feat: work the clone has not seen");

  const fresh = run(clone);
  row("fetch-ran", fresh.fetch);
  row("fetch-catches-stale", fresh.blockers.some((b) => b.includes("STALE")) ? "caught" : "MISSED");
  row("fetch-repair", fresh.repair.some((c) => c.startsWith("git merge --ff-only origin/dev")) ? "offered" : "MISSED");

  // Offline is handled by DEGRADING, not by a flag: the fetch fails, that
  // becomes a warning, and the result says so rather than implying it checked.
  git(clone, "remote", "set-url", "origin", join(tmpdir(), "supermodo-no-such-remote.git"));
  const offline = run(clone);
  row("offline-degrades", offline.fetch);
  row("offline-warns", offline.warnings.some((w) => w.includes("LOCAL refs only")) ? "yes" : "no");
  row("offline-not-blocked", offline.blockers.some((b) => b.includes("fetch")) ? "BLOCKED" : "clean");
  row("offline-repair", offline.repair.some((c) => c.startsWith("git fetch")) ? "offered" : "MISSED");
}

// --- 7. a project that states its own process ----------------------------
// Present -> the rules file IS the sequence. The script then renders the
// commands and withholds any default order, because an order it emits is an
// order the model can follow instead of the project's.
{
  const r = repo();
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  put(r, ".supermodo/rules/release.md", `---
rule: release
applies-to: [release]
description: ship it our way
template: light
template-version: 0.6.0
---

## Process

1. Tag first, then commit the bump.
`);
  commit(r, "chore: init");
  git(r, "tag", "v1.0.0");
  git(r, "switch", "-q", "-c", "dev");
  put(r, "src.txt", "x");
  commit(r, "feat: add a thing");
  const j = run(r);
  row("rule-detected", j.rule.present ? "yes" : "no");
  row("rule-template", j.rule.template ?? "none");
  row("rule-no-default-order", j.defaultOrder.length === 0 ? "withheld" : "OFFERED");
  row("rule-steps-rendered", j.steps.some((st) => st.id === "tag" && st.commands.includes("git tag v1.1.0")) ? "yes" : "no");
  // Inference is the expensive part and it is what the rules file replaces.
  row("rule-skips-inference", j.inferred === null ? "skipped" : "RAN");
  // Light mode has no stabilization or ephemeral branch, so those capabilities
  // are not offered at all.
  row("rule-steps-scoped", j.steps.map((st) => st.id).sort().join(","));

  // ...and without a rules file, the proposal is offered instead.
  const none = run(clean2());
  row("norule-infers", none.inferred === null ? "MISSED" : "proposed");
  row("norule-strategy", none.inferred?.mergeStrategy ?? "none");
  row("norule-evidenced", (none.inferred?.evidence ?? []).length >= 8 ? "yes" : "no");
}

// --- 8. the skill renders git, and REFUSES to invent the rest -------------
// The set of forges is not enumerable — Gitea, Forgejo, Codeberg, Azure
// DevOps, Gerrit, or none at all. A guessed `gh` or a flag remembered from
// training data would be a command that looks verified and is not. So every
// rendered command is pure git, and the steps the skill cannot render say so.
{
  const j = run(clean2());
  const rendered = j.steps.filter((st) => st.supplied === "skill").flatMap((st) => st.commands);
  const yours = j.steps.filter((st) => st.supplied === "project").map((st) => st.id).sort();

  // Every command the skill claims is verified must be git (or the POSIX
  // notes extraction). Nothing forge-shaped, ever.
  row("only-git-rendered",
    rendered.every((c) => /^(git |NOTES=|awk )/.test(c)) ? "yes" : `LEAKED:${rendered.find((c) => !/^(git |NOTES=|awk )/.test(c))}`);
  row("no-forge-cli",
    /\b(gh|glab|tea|hub|bb|az)\s/.test(JSON.stringify(j)) ? "LEAKED" : "clean");
  row("publish-is-yours", yours.includes("publish-release") ? "yes" : "no");
  row("publish-no-commands",
    (j.steps.find((st) => st.id === "publish-release")?.commands ?? []).length === 0 ? "none" : "INVENTED");
  row("request-steps-are-yours", yours.join(","));
  // The notes extraction IS universal, so it stays rendered — whatever
  // publishes them.
  // A two-branch process has no ephemeral branch, so the step that would
  // render `git branch -d <dev>` must not be in the vocabulary at all.
  row("no-suicidal-delete",
    j.steps.some((st) => st.id === "delete-branch") ? "OFFERED" : "absent");
  row("notes-rendered",
    (j.steps.find((st) => st.id === "extract-notes")?.commands ?? []).some((c) => c.startsWith("awk ")) ? "yes" : "no");
}

// --- 9. removed config keys are migrated, never ignored -------------------
{
  const r = repo();
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  put(r, "skills.config.json", JSON.stringify({ release: { mode: "full", githubRelease: false } }));
  commit(r, "chore: init");
  git(r, "tag", "v1.0.0");
  git(r, "switch", "-q", "-c", "dev");
  put(r, "src.txt", "x"); commit(r, "feat: a thing");
  const j = run(r);
  row("migration-count", String(j.migrations.length));
  row("migration-names-rules", j.migrations.some((m) => m.includes(".supermodo/rules/release.md")) ? "yes" : "no");
  // The removed key must not still steer behaviour: shape comes from the rules
  // file now, and there is none, so "full" in config buys nothing.
  row("migration-mode-inert", j.shape);
}

// --- 10. CI is part of the process ---------------------------------------
// A repo where CI owns versioning is a repo where "cut a release by hand" is
// the wrong answer, and the user must see that before confirming a process.
{
  const r = repo();
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  git(r, "remote", "add", "origin", "https://gitea.example.com/team/app.git");
  put(r, ".github/workflows/release.yml",
    "on:\n  push:\n    branches: [main]\njobs:\n  r:\n    steps:\n      - uses: googleapis/release-please-action@v4\n");
  commit(r, "chore: init");
  git(r, "tag", "v1.0.0");
  git(r, "switch", "-q", "-c", "dev");
  put(r, "src.txt", "x"); commit(r, "feat: a thing");
  const j = run(r);
  row("ci-detected", (j.inferred?.ci ?? []).some((c) => c.includes("release.yml")) ? "yes" : "no");
  row("ci-owns-versioning", (j.inferred?.ci ?? []).some((c) => c.includes("CI OWNS VERSIONING")) ? "flagged" : "MISSED");
  row("ci-observed-not-classified", j.inferred?.integration === undefined ? "observation" : "CLASSIFIED");
  // A Gitea URL: the enum this replaced would have classified it "none" and
  // silently dropped the publish step. Reported verbatim, the model can read it.
  row("ci-remote-verbatim",
    (j.inferred?.evidence ?? []).some((e) => e.includes("gitea.example.com")) ? "verbatim" : "MISSED");
}

// --- 11. the shape comes from the rules file, not from config -------------
{
  const r = repo();
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  put(r, ".supermodo/rules/release.md", `---
rule: release
applies-to: [release]
description: stabilize then ship
template: full
template-version: 0.6.0
---

## Process

1. Cut the stabilization branch.
`);
  commit(r, "chore: init");
  git(r, "tag", "v1.0.0");
  git(r, "switch", "-q", "-c", "dev");
  put(r, "src.txt", "x"); commit(r, "feat: a thing");
  const j = run(r);
  row("shape-from-rule", j.shape);
  row("shape-offers-cut", j.steps.some((st) => st.id === "cut-stabilization") ? "yes" : "no");
}

// --- 12. the presumptions that survived the forge cleanup -----------------
// `v` + `x.y.z` + `dev -> main` were hardcoded as facts about the world rather
// than as this project's names. Each row below was a real failure, four of
// them SILENT (a confident wrong number rather than a refusal).
{
  const bare = (files, tags, opts = {}) => {
    const r = repo();
    Object.entries(files).forEach(([f, t]) => put(r, f, t));
    commit(r, "chore: init");
    tags.forEach((t) => git(r, "tag", t));
    if (opts.dev !== false) {
      git(r, "switch", "-q", "-c", "dev");
      put(r, "s.txt", "x");
      commit(r, "feat: a thing");
    } else {
      put(r, "s.txt", "x");
      commit(r, "feat: a thing");
    }
    return r;
  };

  // (a) a version file that is not JSON — Rust, Python, Gradle, bare VERSION
  const rust = run(bare({
    "Cargo.toml": '[package]\nname = "app"\nversion = "1.0.0"\n',
    "CHANGELOG.md": changelog("1.0.0"),
    "skills.config.json": JSON.stringify({ release: { versionFile: "Cargo.toml", versionPath: "package.version" } }),
  }, ["v1.0.0"]));
  row("toml-version", rust.currentVersion ?? "UNREADABLE");
  row("toml-says-how", (rust.refs?.[0]?.how ?? "").includes("[package] section") ? "by-section" : "MISSED");
  // Following versionPath into a [section] is precise; only a blind shape
  // match is a guess, and only that warns.
  row("toml-no-false-warning", rust.warnings.some((w) => w.includes("read by shape")) ? "WARNED" : "clean");
  const bareV = run(bare({
    "VERSION": "2.5.0\n",
    "CHANGELOG.md": changelog("2.5.0"),
    "skills.config.json": JSON.stringify({ release: { versionFile: "VERSION" } }),
  }, ["v2.5.0"]));
  row("bare-version-file", bareV.currentVersion ?? "UNREADABLE");
  row("bare-warns-shape", bareV.warnings.some((w) => w.includes("read by shape")) ? "yes" : "no");

  // (g) a version scheme with no arithmetic: read it, report it, refuse to
  // invent the next one. 2026.08.1 used to parse as semver and bump to
  // 2026.9.0 under "ready: preflight clean".
  const cal = run(bare({
    "package.json": JSON.stringify({ version: "2026.08.1" }),
    "CHANGELOG.md": changelog("2026.08.1"),
  }, ["v2026.08.1"]));
  row("calver-readable", cal.currentVersion ?? "UNREADABLE");
  row("calver-no-guess", cal.suggestedVersion === null ? "abstains" : `GUESSED:${cal.suggestedVersion}`);
  row("calver-not-blocked", cal.blockers.length === 0 ? "usable" : `BLOCKED:${cal.blockers[0]}`);
  row("calver-says-skipped", cal.warnings.some((w) => w.includes("SKIPPED, not passed")) ? "yes" : "no");

  // (h) a Cargo.toml whose FIRST `version =` belongs to a dependency
  const deps = run(bare({
    "Cargo.toml": '[dependencies.serde]\nversion = "0.5.0"\n\n[package]\nname = "app"\nversion = "3.1.0"\n',
    "CHANGELOG.md": changelog("3.1.0"),
    "skills.config.json": JSON.stringify({ release: { versionFile: "Cargo.toml", versionPath: "package.version" } }),
  }, ["v3.1.0"]));
  row("toml-section-wins", deps.currentVersion ?? "UNREADABLE");

  // (i) one version headed twice: the notes extraction would publish only the first
  const dup = repo();
  put(dup, "package.json", JSON.stringify({ version: "1.0.0" }));
  put(dup, "CHANGELOG.md", "# Changelog\n\n## [1.0.0] - 2026-02-01\n\n- second\n\n## [1.0.0] - 2026-01-01\n\n- first\n");
  commit(dup, "chore: init"); git(dup, "tag", "v1.0.0");
  git(dup, "switch", "-q", "-c", "dev"); put(dup, "s.txt", "x"); commit(dup, "feat: t");
  row("duplicate-entry-warned",
    run(dup).warnings.some((w) => w.includes("entries headed")) ? "yes" : "no");  // (j) the same with build metadata: as a pattern, the `+` was a quantifier
  // and the warning vanished for exactly the versions that need it
  const dupMeta = repo();
  put(dupMeta, "package.json", JSON.stringify({ version: "1.0.1+build.7" }));
  put(dupMeta, "CHANGELOG.md", "# Changelog\n\n## [1.0.1+build.7] - 2026-02-01\n\n- second\n\n## [1.0.1+build.7] - 2026-01-01\n\n- first\n");
  commit(dupMeta, "chore: init"); git(dupMeta, "tag", "v1.0.1+build.7");
  git(dupMeta, "switch", "-q", "-c", "dev"); put(dupMeta, "s.txt", "x"); commit(dupMeta, "feat: t");
  row("duplicate-buildmeta-warned",
    run(dupMeta).warnings.some((w) => w.includes("entries headed [1.0.1+build.7]")) ? "yes" : "no");


  // (b) prerelease: the TAG must still be recognised, and no next version
  // may be invented — rc.1 -> rc.2 or -> release is the project's call.
  const pre = run(bare({
    "package.json": JSON.stringify({ version: "1.2.3-rc.1" }),
    "CHANGELOG.md": changelog("1.2.3-rc.1"),
  }, ["v1.2.3-rc.1"]));
  row("prerelease-tag-seen", pre.lastTag ?? "NONE");
  row("prerelease-no-guess", pre.suggestedVersion === null ? "abstains" : `GUESSED:${pre.suggestedVersion}`);
  row("prerelease-explains", pre.warnings.some((w) => w.includes("is a prerelease")) ? "yes" : "no");

  // (c) trunk-based: one branch. Was refused outright.
  const trunk = run(bare({
    "package.json": JSON.stringify({ version: "1.0.0" }),
    "CHANGELOG.md": changelog("1.0.0"),
  }, ["v1.0.0"], { dev: false }));
  row("trunk-ready", trunk.blockers.length === 0 ? "ready" : `BLOCKED:${trunk.blockers[0]}`);
  row("trunk-order", trunk.defaultOrder.join(">"));
  // Aliasing dev->main naively made `integrate` merge main into itself.
  row("trunk-no-self-merge",
    flat(trunk).some((c) => /^git merge( --squash| --no-ff)? main$/.test(c)) ? "SELF-MERGE" : "clean");

  // (d) tags that exist but do not match the prefix: silently zero tags meant
  // the range became the whole history and the proposal could land BELOW what
  // was already published.
  const mono = run(bare({
    "package.json": JSON.stringify({ version: "1.0.0" }),
    "CHANGELOG.md": changelog("1.0.0"),
  }, ["pkg-a@1.0.0"]));
  row("foreign-tags-blocked",
    mono.blockers.some((b) => b.includes("not recognised by tagPrefix")) ? "blocked" : "MISSED");
  row("foreign-tags-named", mono.blockers.some((b) => b.includes("pkg-a@1.0.0")) ? "yes" : "no");
  // ...and a project that CONFIGURES its prefix works normally.
  const scoped = run(bare({
    "package.json": JSON.stringify({ version: "1.0.0" }),
    "CHANGELOG.md": changelog("1.0.0"),
    "skills.config.json": JSON.stringify({ release: { tagPrefix: "pkg-a@" } }),
  }, ["pkg-a@1.0.0"]));
  row("scoped-prefix-works", scoped.lastTag ?? "NONE");

  // (e) first release: nothing tagged, so the declared version IS the release.
  const first = run(bare({
    "package.json": JSON.stringify({ version: "0.1.0" }),
    "CHANGELOG.md": changelog("0.1.0"),
  }, []));
  row("first-release-version", first.suggestedVersion ?? "none");
  row("first-release-explains", first.warnings.some((w) => w.includes("first release")) ? "yes" : "no");

  // (f) CI owning versioning is a HALT, not a footnote: it used to print
  // "ready: preflight clean" above a manual sequence that would fight CI.
  const ci = run(bare({
    "package.json": JSON.stringify({ version: "1.0.0" }),
    "CHANGELOG.md": changelog("1.0.0"),
    ".github/workflows/r.yml": "jobs:\n  r:\n    steps:\n      - uses: googleapis/release-please-action@v4\n",
  }, ["v1.0.0"]));
  row("ci-owned-blocks", ci.blockers.some((b) => b.includes("CI appears to own versioning")) ? "blocked" : "MISSED");
  row("ci-owned-no-steps", ci.steps.length === 0 ? "none" : "OFFERED");
}

// --- 13. a shallow clone cannot answer any of this ------------------------
{
  const origin = repo();
  put(origin, "package.json", JSON.stringify({ version: "1.0.0" }));
  put(origin, "CHANGELOG.md", changelog("1.0.0"));
  commit(origin, "chore: init");
  git(origin, "tag", "v1.0.0");
  put(origin, "a.txt", "a"); commit(origin, "feat: one");
  put(origin, "b.txt", "b"); commit(origin, "feat: two");

  const shallow = mkdtempSync(join(tmpdir(), "supermodo-shallow-"));
  temps.push(shallow);
  execFileSync("git", ["clone", "-q", "--depth", "1", `file://${origin}`, shallow],
    { env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  const j = run(shallow);
  row("shallow-blocked", j.blockers.some((b) => b.includes("shallow clone")) ? "blocked" : "MISSED");
  row("shallow-repair", j.repair.some((c) => c.includes("--unshallow")) ? "offered" : "MISSED");
}

// --- 14. hostile config values ------------------------------------------
// Config is data the project supplies, and two of these were found by feeding
// the preflight values a careless copy-paste could produce.
{
  // A quantified group containing a quantifier backtracks exponentially:
  // `^((a+)+)$` burned 19 SECONDS of CPU with the run merely appearing to hang.
  // JavaScript has no regex timeout, so validation is the only place to stop it.
  const cfg = mkdtempSync(join(tmpdir(), "supermodo-redos-"));
  temps.push(cfg);
  writeFileSync(join(cfg, "c.json"), JSON.stringify({
    configVersion: 1, project: { name: "x" },
    release: { versionPattern: "^((a+)+)$" },
  }), "utf8");
  const out = (() => {
    try {
      execFileSync("node", [CONFIG_CHECK, join(cfg, "c.json")],
        { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return "";
    } catch (e) { return (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? ""); }
  })();
  row("redos-rejected", out.includes("nested quantifiers") ? "rejected" : "ACCEPTED");
  // Two rewrites of that pattern walked past a screen that knew one shape,
  // and the same class of pattern is run against branch names by `commit`.
  const configSays = (config) => {
    const dir = mkdtempSync(join(tmpdir(), "supermodo-redos-"));
    temps.push(dir);
    writeFileSync(join(dir, "c.json"), JSON.stringify({ configVersion: 1, project: { name: "x" }, ...config }), "utf8");
    try {
      execFileSync("node", [CONFIG_CHECK, join(dir, "c.json")], { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return "";
    } catch (e) { return (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? ""); }
  };
  row("redos-nested-group-rejected", configSays({ release: { versionPattern: "^((a)+)+$" } }).includes("nested quantifiers") ? "rejected" : "ACCEPTED");
  row("redos-alternation-rejected", configSays({ release: { versionPattern: "^(a|a)+$" } }).includes("alternation") ? "rejected" : "ACCEPTED");
  row("redos-issuekey-rejected", configSays({ vcs: { issueKey: { pattern: "^((a)+)+$", template: "[{key}] {subject}" } } }).includes("hang the commit skill") ? "rejected" : "ACCEPTED");
  row("redos-benign-accepted", configSays({ release: { versionPattern: "^version=(\\d+\\.\\d+\\.\\d+)$" } }) === "" ? "valid" : "REJECTED");
  // The preflight compiled the pattern with no screen of its own, so a config
  // that was never checked hung it. It now refuses what the screen flags and
  // stops what the screen misses — the pattern runs under a budget.
  const hostile = (pattern, content) => {
    const r = repo();
    put(r, "package.json", content);
    put(r, "CHANGELOG.md", changelog("1.0.0"));
    put(r, "skills.config.json", JSON.stringify({ release: { versionPattern: pattern } }));
    commit(r, "chore: init");
    const parse = (text) => { try { return JSON.parse(text.trim().split("\n").at(-1)); } catch { return "HUNG"; } };
    try {
      return parse(execFileSync("node", [CHECK, r], { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 }));
    } catch (e) {
      return e.code === "ETIMEDOUT" || e.signal ? "HUNG" : parse(e.stdout?.toString() ?? "");
    }
  };
  const flagged = hostile("^((a)+)+$", "a".repeat(40) + "!");
  row("redos-preflight-refuses", flagged === "HUNG" ? "HUNG" : flagged.blockers.some((b) => b.includes("refusing to run it")) ? "blocked" : "MISSED");
  const unflagged = hostile("^(\\d+)(\\d+)(\\d+)(\\d+)(\\d+)(\\d+)(\\d+)(\\d+)x$", "1".repeat(60));

  row("redos-runtime-bounded", unflagged === "HUNG" ? "HUNG" : unflagged.blockers.some((b) => b.includes("was stopped")) ? "blocked" : "MISSED");


  // `badPath` blocks `..` and absolute paths; a symlinked directory walks past
  // both. Containment has to be decided on the RESOLVED path.
  const target = mkdtempSync(join(tmpdir(), "supermodo-outside-"));
  temps.push(target);
  writeFileSync(join(target, "package.json"), JSON.stringify({ version: "9.9.9" }), "utf8");
  const r = repo();
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  put(r, "skills.config.json", JSON.stringify({ release: { versionFile: "escape/package.json" } }));
  symlinkSync(target, join(r, "escape"));
  commit(r, "chore: init");
  row("symlink-escape-blocked",
    run(r).blockers.some((b) => b.includes("resolves OUTSIDE the project")) ? "blocked" : "MISSED");
}

// --- 15. a mid-cycle sync is not a release boundary ----------------------
// "the newest merge whose second parent main contains" matches ANY main->dev
// sync, and taking one as the boundary EXCLUDES everything before it. A team
// that synced main into dev after a feat: landed got a patch bump and
// "ready: preflight clean" while the feature went unreleased.
{
  const r = repo();
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  commit(r, "chore(release): v1.0.0");
  git(r, "tag", "v1.0.0");
  git(r, "switch", "-q", "-c", "dev");
  put(r, "feature.txt", "f"); commit(r, "feat: add unreleased capability");
  git(r, "switch", "-q", "main");
  put(r, "ops.txt", "o"); commit(r, "chore: update deployment metadata");
  git(r, "switch", "-q", "dev");
  git(r, "merge", "-q", "--no-ff", "main", "-m", "chore: sync main into dev");
  put(r, "fix.txt", "x"); commit(r, "fix: correct edge case");
  const j = run(r);
  row("midcycle-sync-not-boundary", j.suggestedVersion ?? "none");
  row("midcycle-warns-widened",
    j.warnings.some((w) => w.includes("no back-merge of v1.0.0 found")) ? "yes" : "no");

  // ...while a REAL back-merge (second parent IS the released commit) still
  // bounds the range, which is the whole point of the optimisation.
  const r2 = repo();
  put(r2, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r2, "CHANGELOG.md", changelog("1.0.0"));
  commit(r2, "chore: init");
  git(r2, "switch", "-q", "-c", "dev");
  put(r2, "old.txt", "o"); commit(r2, "feat: released long ago");
  git(r2, "switch", "-q", "main");
  git(r2, "merge", "--squash", "-q", "dev");
  git(r2, "commit", "-q", "-m", "release: v1.0.0");
  git(r2, "tag", "v1.0.0");
  git(r2, "switch", "-q", "dev");
  git(r2, "merge", "-q", "--no-ff", "main", "-m", "Merge branch 'main' into dev");
  put(r2, "new.txt", "n"); commit(r2, "fix: only this is unreleased");
  const j2 = run(r2);
  row("real-backmerge-bounds", String(j2.commitCount));
  row("real-backmerge-bump", j2.suggestedBump);
}

// --- 16. a path is not a shell token -------------------------------------
// `badPath` allows spaces, and `docs/My Changelog.md` interpolated bare became
// two arguments: `git add` failed, and had `docs/My` existed it would have
// staged the WRONG file under a plan calling itself verified.
{
  const r = repo();
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "docs/My Changelog.md", changelog("1.0.0"));
  put(r, "skills.config.json", JSON.stringify({ release: { changelog: "docs/My Changelog.md" } }));
  commit(r, "chore: init");
  git(r, "tag", "v1.0.0");
  git(r, "switch", "-q", "-c", "dev");
  put(r, "s.txt", "x"); commit(r, "feat: a thing");
  const cmds = run(r).steps.flatMap((st) => st.commands);
  row("spaced-path-quoted",
    cmds.some((c) => c.includes("'docs/My Changelog.md'")) ? "quoted" : "BARE");
  // A bare occurrence is one not immediately preceded by the opening quote.
  // The previous pattern anchored on `add ` / the awk program and matched
  // nothing either way — the row could not move under its own mutation.
  row("spaced-path-never-bare",
    cmds.some((c) => /(?:^|[^'])docs\/My Changelog\.md/.test(c)) ? "BARE" : "clean");

  // ...and an ordinary path is not needlessly quoted.
  const plain = run(clean2()).steps.flatMap((st) => st.commands);
  row("plain-path-unquoted",
    plain.includes("git add package.json CHANGELOG.md") ? "readable" : "OVERQUOTED");
}

// --- 17. a tag whose name and contents disagree --------------------------
// The last release tag is the authority for the range, the rollback guard and
// the pre-bumped test. Its NAME and its CONTENT were read separately and never
// compared, so a tag cut on the wrong commit was promoted to authoritative
// state while the report printed the contradiction plainly.
{
  const r = repo();
  put(r, "package.json", JSON.stringify({ version: "0.9.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("0.9.0"));
  commit(r, "chore(release): v0.9.0");
  const wrong = git(r, "rev-parse", "HEAD");
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  commit(r, "chore(release): v1.0.0");
  // the tag lands on the PREVIOUS release commit
  git(r, "tag", "v1.0.0", wrong);
  put(r, "s.txt", "x"); commit(r, "feat: later work");
  const j = run(r);
  row("wrong-tag-blocked",
    j.blockers.some((b) => b.includes("points at a commit whose")) ? "blocked" : "MISSED");
  row("wrong-tag-no-steps", j.steps.length === 0 ? "none" : "OFFERED");
}

// --- 18. more than one remote ---------------------------------------------
// Tags live in ONE namespace, so a release published at `upstream` is
// invisible to a checkout that only ever fetches `origin`. Hard-selecting
// origin made a fork propose a version BELOW what upstream had published.
{
  const upstream = repo();
  put(upstream, "package.json", JSON.stringify({ version: "2.0.0" }, null, 2));
  put(upstream, "CHANGELOG.md", changelog("2.0.0"));
  commit(upstream, "chore(release): v2.0.0");
  git(upstream, "tag", "v2.0.0");

  const fork = repo();
  put(fork, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(fork, "CHANGELOG.md", changelog("1.0.0"));
  commit(fork, "chore(release): v1.0.0");
  git(fork, "tag", "v1.0.0");
  put(fork, "s.txt", "x"); commit(fork, "feat: fork work");
  git(fork, "remote", "add", "origin", `file://${fork}`);
  git(fork, "remote", "add", "upstream", `file://${upstream}`);

  const j = run(fork);
  row("upstream-tag-seen", j.highestVersion ?? "none");
  row("upstream-blocks-rollback",
    j.blockers.some((b) => b.includes("BACKWARDS") || b.includes("BEHIND")) ? "blocked" : "MISSED");
  row("multi-remote-warned",
    j.warnings.some((w) => w.includes("no release.remote set")) ? "yes" : "no");
}

// --- 19. an operation already in progress ---------------------------------
// A half-finished merge leaves an EMPTY porcelain but a live MERGE_HEAD, and
// the release's own commit would complete it — turning someone else's merge
// into the release commit.
{
  const r = repo();
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  commit(r, "chore(release): v1.0.0");
  git(r, "tag", "v1.0.0");
  git(r, "switch", "-q", "-c", "topic");
  put(r, "t.txt", "t"); commit(r, "feat: topic work");
  git(r, "switch", "-q", "main");
  put(r, "s.txt", "x"); commit(r, "fix: main work");
  try { git(r, "merge", "--no-commit", "--no-ff", "topic"); } catch { /* conflict or paused: both leave MERGE_HEAD */ }
  const j = run(r);
  row("merge-in-progress-blocked",
    j.blockers.some((b) => b.includes("a merge is in progress")) ? "blocked" : "MISSED");
  row("merge-in-progress-no-steps", j.steps.length === 0 ? "none" : "OFFERED");
}

// --- 20. a stabilization branch that exists only on the remote ------------
// A fresh clone has no local release/*, so enumerating refs/heads alone meant
// the commonest checkout silently skipped the rejoin: the hotfix ships, then
// the next release from the stabilization branch un-ships it.
{
  const origin = repo();
  put(origin, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(origin, "CHANGELOG.md", changelog("1.0.0"));
  put(origin, ".supermodo/rules/release.md", `---
rule: release
applies-to: [release]
description: stabilize then ship
template: full
template-version: 1.0.0
---

## Process

1. Cut, stabilize, ship.
`);
  commit(origin, "chore(release): v1.0.0");
  git(origin, "tag", "v1.0.0");
  git(origin, "branch", "dev");
  git(origin, "branch", "release/2.0.0");

  const clone = mkdtempSync(join(tmpdir(), "supermodo-remoteonly-"));
  temps.push(clone);
  execFileSync("git", ["clone", "-q", `file://${origin}`, clone],
    { env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  const j = run(clone, "--hotfix");
  const rejoin = j.steps.find((st) => st.id === "rejoin-stabilization");
  row("remote-only-stabilization",
    (rejoin?.commands ?? []).includes("git switch release/2.0.0") ? "rejoined" : "MISSED");
}

// --- 21. line endings must not decide the workflow ------------------------
// The frontmatter parser matched LF only, so a rules file checked out with
// CRLF (Windows, core.autocrlf) had its `template:` go unread — the project's
// declared workflow silently became the default one, and its own stabilization
// branch then blocked as "not dev".
{
  const mk = (eol) => {
    const r = repo();
    put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
    put(r, "CHANGELOG.md", changelog("1.0.0"));
    put(r, ".supermodo/rules/release.md",
      ["---", "rule: release", "applies-to: [release]", "description: stabilize",
       "template: full", "template-version: 1.0.0", "---", "", "## Process", "", "1. Cut."].join(eol) + eol);
    commit(r, "chore: init");
    git(r, "tag", "v1.0.0");
    return r;
  };
  row("crlf-rules-template", run(mk("\r\n")).rule?.template ?? "UNREAD");
  row("crlf-rules-shape", run(mk("\r\n")).shape);
  row("lf-rules-unchanged", run(mk("\n")).shape);
}

// --- 22. a prefix can prefix a different convention ----------------------
// tagPrefix "v" with tags v1.0.0 and version2.0.0: the latter STARTS WITH "v"
// so it was not foreign, and "ersion2.0.0" is not semver so it was not a
// release tag either. It fell through both and 2.0.0 stayed invisible, making
// the proposed 1.0.1 a rollback.
{
  const r = repo();
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  commit(r, "chore: init");
  git(r, "tag", "v1.0.0");
  put(r, "s.txt", "x"); commit(r, "fix: later");
  git(r, "tag", "version2.0.0");
  const j = run(r);
  row("prefix-overlap-blocked",
    j.blockers.some((b) => b.includes("version2.0.0")) ? "blocked" : "MISSED");

  // A scheme whose tags never parse as semver must NOT be blocked by its own
  // naming — the rule keys on "hides a version at or above what we see".
  const cal = repo();
  put(cal, "package.json", JSON.stringify({ version: "2026.08.1" }, null, 2));
  put(cal, "CHANGELOG.md", changelog("2026.08.1"));
  commit(cal, "chore: init");
  git(cal, "tag", "v2026.08.1");
  put(cal, "s.txt", "x"); commit(cal, "fix: later");
  row("calver-tags-not-foreign",
    run(cal).blockers.some((b) => b.includes("not recognised")) ? "BLOCKED" : "clean");
}

// --- 23. declining to guess must not leave the project with no plan -------
// A scheme we refuse to bump produced "ready: preflight clean" and ZERO steps:
// nothing to run and no way to proceed. --version supplies what we declined
// to invent.
{
  const r = repo();
  put(r, "VERSION", "1.2.3.4\n");
  put(r, "CHANGELOG.md", changelog("1.2.3.4"));
  put(r, "skills.config.json", JSON.stringify({ release: { versionFile: "VERSION" } }));
  commit(r, "chore: init");
  git(r, "tag", "v1.2.3.4");
  put(r, "s.txt", "x"); commit(r, "fix: later");
  row("fourpart-no-steps-alone", run(r).steps.length === 0 ? "none" : "OFFERED");
  const chosen = run(r, "--version", "1.2.3.5");
  row("fourpart-version-supplied", chosen.suggestedVersion ?? "none");
  row("fourpart-steps-rendered",
    (chosen.steps.find((st) => st.id === "tag")?.commands ?? []).includes("git tag v1.2.3.5") ? "yes" : "no");  // ...and what it supplies is still ordered: four parts compare as numbers
  row("fourpart-rollback-blocked",
    run(r, "--version", "1.2.3.3").blockers.some((b) => b.includes("is not above")) ? "blocked" : "MISSED");

}

// --- 24. a supplied version is still a validated version ------------------
// `--version` supplies what the tool declined to derive; it does not suspend
// the guards. Accepted before any comparison, a rollback and a duplicate both
// reported "ready" — the second rendering a `git tag` that cannot succeed.
{
  const mk = () => {
    const r = repo();
    put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
    put(r, "CHANGELOG.md", changelog("1.0.0"));
    commit(r, "chore: init");
    git(r, "tag", "v1.0.0");
    put(r, "s.txt", "x"); commit(r, "fix: later");
    return r;
  };
  row("chosen-rollback-blocked",
    run(mk(), "--version", "0.5.0").blockers.some((b) => b.includes("is not above")) ? "blocked" : "MISSED");
  row("chosen-duplicate-blocked",
    run(mk(), "--version", "1.0.0").blockers.some((b) => b.includes("already exists")) ? "blocked" : "MISSED");
  row("chosen-forward-ok",
    run(mk(), "--version", "1.1.0").blockers.length === 0 ? "ready" : "BLOCKED");  // A guard that only spoke semver was SKIPPED for `0.9` and `1.0.0.rc1` —
  // and skipped read as passed: both rendered a `git tag` below v1.0.0.
  row("chosen-short-rollback-blocked",
    run(mk(), "--version", "0.9").blockers.some((b) => b.includes("is not above")) ? "blocked" : "MISSED");
  row("chosen-short-no-tag",
    JSON.stringify(run(mk(), "--version", "0.9").steps).includes("git tag v0.9") ? "RENDERED" : "clean");
  row("chosen-unorderable-blocked",
    run(mk(), "--version", "1.0.0.rc1").blockers.some((b) => b.includes("cannot be ordered")) ? "blocked" : "MISSED");

}

// --- 25. the version is data, never a pattern -----------------------------
// A version may contain `+` and `.` — ERE metacharacters. The heading
// `## [1.0.1+build.7]` never matched its own generated regex, and the publish
// step received an EMPTY notes file with nothing saying so.
{
  const r = repo();
  // The tag must point at a commit that declares ITS OWN version — otherwise
  // the tag/content check (rightly) blocks before the notes step is reached.
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  commit(r, "chore(release): v1.0.0");
  git(r, "tag", "v1.0.0");
  put(r, "package.json", JSON.stringify({ version: "1.0.1+build.7" }, null, 2));
  put(r, "CHANGELOG.md", `# Changelog\n\n## [1.0.1+build.7] - 2026-01-01\n\n- the entry\n`);
  commit(r, "fix: later");
  const notes = run(r).steps.find((st) => st.id === "extract-notes")?.commands ?? [];
  row("buildmeta-not-a-regex", notes.some((c) => c.includes("index($0,h)==1")) ? "string-compare" : "REGEX");
  row("buildmeta-heading-literal",
    notes.some((c) => c.includes("-v h='## [1.0.1+build.7]'")) ? "literal" : "MISSED");
}

// --- 26. tag style is the project's ---------------------------------------
// A compliance process requiring signed tags could not express it: `tag` is
// rendered by the skill and rules own order only.
{
  const mk = (tagStyle) => {
    const r = repo();
    put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
    put(r, "CHANGELOG.md", changelog("1.0.0"));
    if (tagStyle !== undefined) put(r, "skills.config.json", JSON.stringify({ release: { tagStyle } }));
    commit(r, "chore: init");
    git(r, "tag", "v1.0.0");
    put(r, "s.txt", "x"); commit(r, "fix: later");
    return r;
  };
  const cmds = (j) => (j.steps.find((st) => st.id === "tag")?.commands) ?? [];
  row("tag-default-lightweight", cmds(run(mk(undefined)))[0] ?? "none");
  row("tag-annotated", cmds(run(mk("annotated")))[0] ?? "none");
  row("tag-signed", cmds(run(mk("signed")))[0] ?? "none");
}

// --- 27. a ref is not a shell token ---------------------------------------
// git-check-ref-format permits ; $ & | < > ( ) ! and quotes in a branch name.
// Every one is shell syntax, and these commands exist to be PASTED.
// `dev;id>/tmp/PWNED` is a branch git creates without complaint, and the plan
// rendered `git merge --squash dev;id>/tmp/PWNED`.
{
  const r = repo();
  put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(r, "CHANGELOG.md", changelog("1.0.0"));
  put(r, "skills.config.json", JSON.stringify({ release: { branches: { main: "main", dev: "dev;id>/tmp/x" } } }));
  commit(r, "chore: init");
  git(r, "tag", "v1.0.0");
  const j = run(r);
  row("injectable-ref-blocked",
    j.blockers.some((b) => b.includes("is not a safe git ref")) ? "blocked" : "MISSED");
  row("injectable-ref-never-rendered",
    JSON.stringify(j.steps).includes(";id>") ? "RENDERED" : "clean");
  // and the repair lines, which print even when blocked
  row("injectable-repair-quoted",
    j.repair.some((c) => /;id>/.test(c) && !/'/.test(c)) ? "BARE" : "clean");
}

// --- 28. facts and commands must describe ONE repository ------------------
{
  const mk = (extra) => {
    const r = repo();
    put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
    put(r, "CHANGELOG.md", changelog("1.0.0"));
    if (extra !== undefined) put(r, "skills.config.json", JSON.stringify({ release: extra }));
    commit(r, "chore: init");
    git(r, "tag", "v1.0.0");
    put(r, "s.txt", "x"); commit(r, "fix: later");
    return r;
  };
  // A configured remote that does not exist renders pushes to nothing.
  row("missing-remote-blocked",
    run(mk({ remote: "upstream" })).blockers.some((b) => b.includes("is not a remote of this repository"))
      ? "blocked" : "MISSED");

  // A branch checked out in another worktree cannot be switched to here.
  const wt = repo();
  put(wt, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(wt, "CHANGELOG.md", changelog("1.0.0"));
  commit(wt, "chore: init");
  git(wt, "tag", "v1.0.0");
  git(wt, "branch", "dev");
  const linked = mkdtempSync(join(tmpdir(), "supermodo-linked-"));
  temps.push(linked);
  rmSync(linked, { recursive: true, force: true });
  git(wt, "worktree", "add", "-q", linked, "dev");
  row("worktree-branch-blocked",
    run(wt).blockers.some((b) => b.includes("checked out in another worktree")) ? "blocked" : "MISSED");

  // The tag's CHANGELOG must agree with the tag's own name, not just its
  // version file.
  const cm = repo();
  put(cm, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(cm, "CHANGELOG.md", changelog("0.9.0"));
  commit(cm, "chore: init");
  git(cm, "tag", "v1.0.0");
  put(cm, "CHANGELOG.md", changelog("1.0.0"));
  commit(cm, "fix: later");
  row("tag-changelog-mismatch",
    run(cm).blockers.some((b) => b.includes("newest CHANGELOG.md entry")) ? "blocked" : "MISSED");

  // A signed-tag policy says so about its own baseline rather than implying
  // compliance it never checked.
  const sg = mk({ tagStyle: "signed" });
  row("signed-policy-baseline",
    run(sg).warnings.some((w) => w.includes("is a lightweight tag")) ? "reported" : "MISSED");
}


// --- 27. controls for what was only ever asserted ---------------------------
// Each row below pins a behaviour that held by discipline alone: the code was
// right, and nothing would have said so when it stopped being right.
{
  const bareRepo = (files, tags) => {
    const r = repo();
    Object.entries(files).forEach(([f, t]) => put(r, f, t));
    commit(r, "chore: init");
    tags.forEach((t) => git(r, "tag", t));
    git(r, "switch", "-q", "-c", "dev");
    put(r, "s.txt", "x");
    commit(r, "feat: a thing");
    return r;
  };

  // (a) every in-progress operation git can leave behind, not just a merge:
  // the marker git itself writes, one repository each.
  const busyRepo = (marker) => {
    const r = repo();
    put(r, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
    put(r, "CHANGELOG.md", changelog("1.0.0"));
    commit(r, "chore(release): v1.0.0");
    git(r, "tag", "v1.0.0");
    put(r, "s.txt", "x"); commit(r, "fix: main work");
    const p = git(r, "rev-parse", "--git-path", marker);
    const abs = p.startsWith("/") ? p : join(r, p);
    if (["rebase-merge", "rebase-apply", "sequencer"].includes(marker)) mkdirSync(abs, { recursive: true });
    else writeFileSync(abs, git(r, "rev-parse", "HEAD") + "\n", "utf8");
    return r;
  };
  [["CHERRY_PICK_HEAD", "a cherry-pick", "cherry-pick"], ["REVERT_HEAD", "a revert", "revert"],
   ["BISECT_LOG", "a bisect", "bisect"], ["rebase-merge", "a rebase", "rebase"],
   ["rebase-apply", "a rebase", "am"], ["sequencer", "a sequencer operation", "sequencer"]]
    .forEach(([marker, label, id]) =>
      row(`${id}-in-progress-blocked`,
        run(busyRepo(marker)).blockers.some((b) => b.includes(`${label} is in progress`)) ? "blocked" : "MISSED"));

  // (b) an inherited GIT_DIR redirects every git call: the facts would
  // describe one repository and the commands act on another.
  const envRepo = clean2();
  const envOut = (() => {
    try {
      return execFileSync("node", [CHECK, envRepo],
        { env: { ...ENV, GIT_DIR: join(envRepo, ".git") }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) { return e.stdout?.toString() ?? ""; }
  })();
  const envJson = (() => { try { return JSON.parse(envOut.trim().split("\n").at(-1)); } catch { return { blockers: [] }; } })();
  row("inherited-gitdir-blocked", envJson.blockers.some((b) => b.includes("GIT_DIR set in the environment")) ? "blocked" : "MISSED");

  // (c) a version declared at a remote-tracking branch counts: origin/main
  // says 3.0.0, this checkout says 1.0.0, and a release from here rolls back.
  const originRepo = repo();
  put(originRepo, "package.json", JSON.stringify({ version: "3.0.0" }, null, 2));
  put(originRepo, "CHANGELOG.md", changelog("3.0.0"));
  commit(originRepo, "chore(release): v3.0.0");
  const tracking = mkdtempSync(join(tmpdir(), "supermodo-tracking-"));
  temps.push(tracking);
  execFileSync("git", ["clone", "-q", originRepo, tracking], { env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  put(tracking, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(tracking, "CHANGELOG.md", changelog("1.0.0"));
  commit(tracking, "chore: local rollback");
  const tr = run(tracking);
  row("remote-tracking-version-seen", tr.highestVersion ?? "NONE");
  row("remote-tracking-rollback-blocked", tr.blockers.some((b) => b.includes("BACKWARDS")) ? "blocked" : "MISSED");

  // (d) the fetch cannot be skipped: a `--no-fetch` flag is inert.
  row("nofetch-flag-inert", run(tracking, "--no-fetch").fetch === "ok" ? "ok" : "SKIPPED");

  // (e) a UTF-8 BOM on the rules file is not part of its frontmatter.
  const bom = repo();
  put(bom, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(bom, "CHANGELOG.md", changelog("1.0.0"));
  put(bom, ".supermodo/rules/release.md", "﻿" +
    ["---", "rule: release", "applies-to: [release]", "description: stabilize",
     "template: full", "template-version: 1.0.0", "---", "", "## Process", "", "1. Cut."].join("\n") + "\n");
  commit(bom, "chore: init");
  git(bom, "tag", "v1.0.0");
  row("bom-rules-template", run(bom).rule?.template ?? "UNREAD");

  // (f) semver §11: numeric identifiers compare as numbers (beta.11 > beta.2),
  // and a prerelease sorts below its own release.
  row("prerelease-numeric-order", run(bareRepo({
    "package.json": JSON.stringify({ version: "1.0.0-beta.11" }), "CHANGELOG.md": changelog("1.0.0-beta.11"),
  }, ["v1.0.0-beta.2", "v1.0.0-beta.11"])).highestVersion ?? "NONE");
  row("prerelease-below-release", run(bareRepo({
    "package.json": JSON.stringify({ version: "1.0.0" }), "CHANGELOG.md": changelog("1.0.0"),
  }, ["v1.0.0-rc.1", "v1.0.0"])).highestVersion ?? "NONE");

  // (g) version homes beyond JSON and TOML: gradle.properties, a Python __version__.
  row("gradle-version", run(bareRepo({
    "gradle.properties": "group=org.example\nversion=4.2.0\n", "CHANGELOG.md": changelog("4.2.0"),
    "skills.config.json": JSON.stringify({ release: { versionFile: "gradle.properties" } }),
  }, ["v4.2.0"])).currentVersion ?? "UNREADABLE");
  row("python-dunder-version", run(bareRepo({
    "app/__init__.py": '__version__ = "5.0.1"\n', "CHANGELOG.md": changelog("5.0.1"),
    "skills.config.json": JSON.stringify({ release: { versionFile: "app/__init__.py" } }),
  }, ["v5.0.1"])).currentVersion ?? "UNREADABLE");

  // (h) skills.config.json may carry comments and trailing commas; the
  // preflight reads it through the shared JSONC reader.
  row("jsonc-config-read", run(bareRepo({
    "package.json": JSON.stringify({ version: "1.0.0" }), "CHANGELOG.md": changelog("1.0.0"),
    "skills.config.json": '{\n  // the release section\n  "release": { "tagPrefix": "rel-", /* block */ },\n}\n',
  }, ["rel-1.0.0"])).lastTag ?? "NONE");

  // (i) no rendered command carries prose: a trailing `# comment` reads as
  // documentation and pastes as a command.
  const fullRules = repo();
  put(fullRules, "package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  put(fullRules, "CHANGELOG.md", changelog("1.0.0"));
  put(fullRules, ".supermodo/rules/release.md",
    ["---", "rule: release", "applies-to: [release]", "description: stabilize",
     "template: full", "template-version: 1.0.0", "---", "", "## Process", "", "1. Cut."].join("\n") + "\n");
  commit(fullRules, "chore: init");
  git(fullRules, "tag", "v1.0.0");
  git(fullRules, "switch", "-q", "-c", "dev");
  put(fullRules, "s.txt", "x"); commit(fullRules, "feat: a thing");
  const everyCommand = [run(clean2()), run(fullRules)].flatMap((j) => j.steps.flatMap((st) => st.commands));
  row("no-trailing-comment", everyCommand.some((c) => /\s#(\s|$)/.test(c)) ? "LEAKED" : "clean");
}


temps.forEach((t) => rmSync(t, { recursive: true, force: true }));
rows.forEach(([k, v]) => console.log(`${k}=${v}`));
