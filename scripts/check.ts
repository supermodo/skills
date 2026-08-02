// supermodo repo self-check — run from the repo root: node scripts/check.ts
// Validates: manifests parse, skill folders/frontmatter, single-source
// protocol references resolve (no local master copies), fixtures behave.
// Zero dependencies. Node ≥ 22.18.

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const EXPECTED = [
  "bug-council", "commit", "config", "flow", "grill", "hunt", "librarian",
  "next", "protocols", "refactor", "release", "reports", "sync-configs", "tdd",
  "tests", "work",
] as const;

const REF_RE = /(?:\.\.\/)+protocols\/references\/[a-z-]+\.md/g;

type Result = { readonly oks: readonly string[]; readonly fails: readonly string[] };

const ok = (msg: string): Result => ({ oks: [msg], fails: [] });
const fail = (msg: string): Result => ({ oks: [], fails: [msg] });
const merge = (...rs: readonly Result[]): Result => ({
  oks: rs.flatMap((r) => r.oks),
  fails: rs.flatMap((r) => r.fails),
});

const tryParse = (path: string): string | undefined => {
  try {
    JSON.parse(readFileSync(path, "utf8"));
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
};

const checkManifests = (root: string): Result =>
  merge(
    ...[".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"].map((f) => {
      const err = tryParse(join(root, f));
      return err === undefined ? ok(f) : fail(`${f}: ${err}`);
    }),
    (() => {
      const path = join(root, ".claude-plugin/plugin.json");
      if (tryParse(path) !== undefined) return merge();
      const name = (JSON.parse(readFileSync(path, "utf8")) as { name?: string }).name;
      return name === "supermodo"
        ? merge()
        : fail(`plugin.json: name must be "supermodo", got ${JSON.stringify(name)}`);
    })(),
  );

const checkRoster = (found: readonly string[]): Result =>
  merge(
    ...EXPECTED.filter((e) => !found.includes(e)).map((e) => fail(`skills/${e}/ missing`)),
    ...found
      .filter((f) => !(EXPECTED as readonly string[]).includes(f))
      .map((f) => fail(`skills/${f}/ unexpected (update EXPECTED in check.ts if intentional)`)),
  );

const checkSkill = (skillsDir: string) => (slug: string): Result => {
  const sk = join(skillsDir, slug, "SKILL.md");
  if (!existsSync(sk)) return fail(`skills/${slug}/SKILL.md missing`);
  const text = readFileSync(sk, "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (fm === undefined) return fail(`skills/${slug}/SKILL.md: no frontmatter`);
  const name = fm.match(/^name:\s*"?([a-z0-9-]+)"?\s*$/m)?.[1];
  const kb = statSync(sk).size / 1024;
  return merge(
    name === undefined
      ? fail(`skills/${slug}/SKILL.md: missing/invalid name (must match ^[a-z0-9-]+$)`)
      : name !== slug
        ? fail(`skills/${slug}/SKILL.md: name "${name}" != folder "${slug}"`)
        : merge(),
    /^description:/m.test(fm) ? merge() : fail(`skills/${slug}/SKILL.md: missing description`),
    kb > 40 ? fail(`skills/${slug}/SKILL.md: ${kb.toFixed(0)} KB (>40 KB)`) : merge(),
    ok(`skills/${slug}`),
  );
};

const mdFilesOf = (skillsDir: string, slug: string): readonly string[] => {
  const refDir = join(skillsDir, slug, "references");
  const refs = existsSync(refDir)
    ? readdirSync(refDir).filter((f) => f.endsWith(".md")).map((f) => join(refDir, f))
    : [];
  return [join(skillsDir, slug, "SKILL.md"), ...refs].filter(existsSync);
};

const checkSingleSource = (root: string, skillsDir: string, found: readonly string[]): Result => {
  const mastersDir = join(skillsDir, "protocols", "references");
  const masters = new Set(readdirSync(mastersDir).filter((n) => n.endsWith(".md")));
  const others = found.filter((slug) => slug !== "protocols");

  const localCopies = others.flatMap((slug) => {
    const refDir = join(skillsDir, slug, "references");
    return existsSync(refDir)
      ? readdirSync(refDir)
          .filter((f) => masters.has(f))
          .map((f) => fail(`skills/${slug}/references/${f}: local copy of a protocol master — delete it, reference ../protocols/references/${f} instead`))
      : [];
  });

  const refs = others
    .flatMap((slug) => mdFilesOf(skillsDir, slug))
    .flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(REF_RE)].map((m) => ({
        file: file.slice(root.length + 1),
        rel: m[0],
        target: resolve(dirname(file), m[0]),
      })),
    );

  const broken = refs
    .filter(({ target }) => dirname(target) !== mastersDir || !existsSync(target))
    .map(({ file, rel }) => fail(`${file}: reference "${rel}" does not resolve to a master in skills/protocols/references/`));

  return merge(...localCopies, ...broken, ok(`${refs.length} master references resolve to skills/protocols/references/`));
};

const checkVersion = (root: string): Result => {
  const manifestPath = join(root, ".claude-plugin/plugin.json");
  if (tryParse(manifestPath) !== undefined) return merge(); // reported by checkManifests
  const version = (JSON.parse(readFileSync(manifestPath, "utf8")) as { version?: string }).version;
  if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
    return fail(`plugin.json: version must be semver, got ${JSON.stringify(version)}`);
  }
  const changelogPath = join(root, "CHANGELOG.md");
  if (!existsSync(changelogPath)) return fail("CHANGELOG.md missing");
  const latest = readFileSync(changelogPath, "utf8").match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1];
  return latest === version
    ? ok(`version ${version} matches latest CHANGELOG entry`)
    : fail(`plugin.json version ${version} != latest CHANGELOG entry ${latest ?? "(none)"} — bump both together`);
};

const runFixture = (script: string, fixture: string): boolean => {
  try {
    execFileSync("node", [script, fixture], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

// Every imperative mention of the AskUserQuestion tool in a skill's prose must
// be gated on the config question transport — otherwise the skill overrides
// `questions.transport: "chat"` and asks via tool regardless. Frontmatter
// allowed-tools lists, negatives ("don't call …"), and Codex-host translation
// notes are exempt. See skills/protocols/references/questions.md.
const GATE_RE = /transport|questions\.md|perSkill/;
const NEG_RE = /don't call|do not call|rather than|instead of|→ ask in chat|"use AskUserQuestion" =/;
const checkQuestionTransport = (root: string, skillsDir: string, found: readonly string[]): Result => {
  const offenders = found
    .flatMap((slug) => mdFilesOf(skillsDir, slug))
    .flatMap((file) => {
      const lines = readFileSync(file, "utf8").split("\n");
      const fmClose = lines.indexOf("---", lines[0] === "---" ? 1 : 0);
      return lines.flatMap((line, i) => {
        if (!line.includes("AskUserQuestion")) return [];
        if (fmClose > 0 && i <= fmClose) return []; // frontmatter allowed-tools list
        if (NEG_RE.test(line)) return []; // negative / translation note
        const window = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
        if (GATE_RE.test(window)) return [];
        return [fail(`${file.slice(root.length + 1)}:${i + 1}: AskUserQuestion not gated on questions.transport — will override "chat" config`)];
      });
    });
  return offenders.length > 0
    ? merge(...offenders)
    : ok("every AskUserQuestion mention is transport-gated");
};

// The renderer is a projection of report .md files: it must be deterministic
// (byte-identical on re-render), self-contained (no external asset beyond the
// optional Mermaid import), and total (a malformed visual block or a report
// with no frontmatter renders rather than throwing). See skills/reports/.
const checkRenderer = (root: string, skillsDir: string): Result => {
  const script = join(skillsDir, "reports/scripts/render.ts");
  const fixture = join(root, "scripts/fixtures/reports-store");
  if (!existsSync(script) || !existsSync(fixture)) return fail("reports renderer or fixture store missing");
  const tmp = mkdtempSync(join(tmpdir(), "supermodo-reports-"));
  const store = join(tmp, "store");
  const render = (): string | undefined => {
    try {
      execFileSync("node", [script, "--store", store, "--no-open"], { stdio: "pipe" });
      return undefined;
    } catch (e) { return (e as Error).message; }
  };
  try {
    cpSync(fixture, store, { recursive: true });
    const err = render();
    if (err !== undefined) return fail(`render.ts exited non-zero (it must never fail its caller): ${err}`);
    const index = join(store, "index.html");
    const run = join(store, "runs/20260801-101500-csv-export/report.html");
    if (!existsSync(index) || !existsSync(run)) return fail("render.ts produced no index.html / run report.html");
    const first = [index, run].map((f) => readFileSync(f, "utf8"));
    render();
    const second = [index, run].map((f) => readFileSync(f, "utf8"));
    const html = first.join("\n");
    const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);

    // Negative control for the caveat assertion: render the same store with the
    // `caveat` line stripped. Without this, an assertion that matched the
    // stylesheet would look green forever — which is exactly what it did.
    const noCaveat = join(tmp, "no-caveat");
    cpSync(fixture, noCaveat, { recursive: true });
    const boardFile = join(noCaveat, "next/20260801-154000.md");
    writeFileSync(boardFile, readFileSync(boardFile, "utf8")
      .split("\n").filter((l) => !l.includes(`"caveat"`)).join("\n"), "utf8");
    execFileSync("node", [script, "--store", noCaveat, "--no-open"], { stdio: "pipe" });
    const bare = readFileSync(join(noCaveat, "index.html"), "utf8");
    const caveatAbsent = bare.includes(`<p class="bcaveat">`)
      ? "a board with NO caveat still rendered the warning element"
      : bare.includes("bcaveat")
        ? undefined  // the stylesheet rule, as expected
        : "the caveat stylesheet vanished — the positive check may be passing on nothing";
    return merge(
      first.every((t, i) => t === second[i])
        ? ok("render.ts is deterministic (re-render byte-identical)")
        : fail("render.ts output changed on re-render — reports must be a deterministic projection"),
      external.length === 0
        ? ok("rendered pages are self-contained (no external assets)")
        : fail(`rendered pages reference external assets: ${external.join(", ")}`),
      first[1].includes("blk-raw")
        ? ok("malformed visual block renders as text instead of throwing")
        : fail("malformed visual block did not render as a warning block"),
      first[0].includes("unreadable")
        ? ok("a report without frontmatter is shown as unreadable")
        : fail("report without frontmatter not marked unreadable in the index"),
      first[0].includes("bitem-row") && first[0].includes("tab-board")
        ? ok("the newest next report renders as the Board tab")
        : fail("Board tab missing — the newest `next` report should render as the board"),
      first[0].includes("t-unknown")
        ? ok("an unrecognised task state is shown, not normalised away")
        : fail("unrecognised task state was silently rendered as something else"),
      // Assert the ELEMENT, never the bare class name: `.bcaveat` also appears
      // in every page's inlined stylesheet, so `includes("bcaveat")` stays true
      // with the feature deleted. Pair it with the negative render below.
      first[0].includes(`<p class="bcaveat">`) && first[0].includes("2 of 6 items have no stored priority")
        ? ok("a board that declares a caveat renders the warning above itself")
        : fail("board `caveat` was dropped — a board known to be unreliable rendered silently"),
      caveatAbsent === undefined
        ? ok("a board with no caveat renders no warning (the check can fail)")
        : fail(caveatAbsent),
      // A status outside the four documented values must not pass through:
      // `needsYou` matches them exactly, so it would drop out of the alerts.
      !first[0].includes("needs_input")
        ? ok("a mistyped `status` is rejected, not passed into the archive")
        : fail("a mistyped `status` rendered as-is — it would vanish from `Needs you`"),
      // Count the rendered status CHIPS, not the word: the fixtures carry
      // exactly three contract violations (no frontmatter, mistyped status,
      // empty summary) and each must produce one. A looser match stays green
      // when a required-field check is removed.
      (first[0].match(/class="chip unreadable"/g) ?? []).length === 3
        ? ok("every report missing a required field renders as unreadable")
        : fail("a report with an empty `summary` or a bad `status` was accepted as healthy"),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

const checkFixtures = (root: string, skillsDir: string): Result => {
  const script = join(skillsDir, "config/scripts/config-check.ts");
  return merge(
    runFixture(script, join(root, "scripts/fixtures/config-valid.json"))
      ? ok("config-check accepts valid fixture")
      : fail("config-check rejected scripts/fixtures/config-valid.json"),
    runFixture(script, join(root, "scripts/fixtures/config-invalid.json"))
      ? fail("config-check ACCEPTED scripts/fixtures/config-invalid.json (should fail)")
      : ok("config-check rejects invalid fixture"),
  );
};

const main = (): number => {
  const root = process.cwd();
  const skillsDir = join(root, "skills");
  const found = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const result = merge(
    checkManifests(root),
    checkRoster(found),
    ...found.map(checkSkill(skillsDir)),
    checkSingleSource(root, skillsDir, found),
    checkQuestionTransport(root, skillsDir, found),
    checkVersion(root),
    checkFixtures(root, skillsDir),
    checkRenderer(root, skillsDir),
  );

  result.oks.forEach((m) => console.log(`  ok  ${m}`));
  if (result.fails.length > 0) {
    console.error(`\n${result.fails.length} problem(s):`);
    result.fails.forEach((m) => console.error(`  FAIL ${m}`));
    return 1;
  }
  console.log("\ncheck: all green");
  return 0;
};

process.exit(main());
