// supermodo repo self-check — run from the repo root: node scripts/check.ts
// Validates: manifests parse, skill folders/frontmatter, single-source
// protocol references resolve (no local master copies), fixtures behave.
// Zero dependencies. Node ≥ 22.18.

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync, mkdtempSync, cpSync, rmSync, utimesSync } from "node:fs";
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
  // The Agent Skills spec caps `description` at 1024 characters, and it is the
  // one field always resident in the system prompt. Folded YAML hides the
  // length, so measure the unfolded value. Body length is the other budget:
  // Anthropic's authoring guidance puts SKILL.md under 500 lines.
  const desc = fm.match(/^description:\s*>?\s*([\s\S]*?)(?=\n[a-z-]+:\s|\n*$)/m)?.[1]
    ?.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "") ?? "";
  const lines = text.split("\n").length;
  return merge(
    name === undefined
      ? fail(`skills/${slug}/SKILL.md: missing/invalid name (must match ^[a-z0-9-]+$)`)
      : name !== slug
        ? fail(`skills/${slug}/SKILL.md: name "${name}" != folder "${slug}"`)
        : merge(),
    /^description:/m.test(fm) ? merge() : fail(`skills/${slug}/SKILL.md: missing description`),
    desc.length > 1024
      ? fail(`skills/${slug}/SKILL.md: description is ${desc.length} chars (spec max 1024) — cut the workflow summary, keep the triggers`)
      : merge(),
    lines > 500
      ? fail(`skills/${slug}/SKILL.md: ${lines} lines (>500) — move detail into references/ and point at it`)
      : merge(),
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

    // Board staleness. Same store, same board, rendered twice against a docs
    // tree whose ONLY difference is the mtime of docs/work/BACKLOG.md — so the
    // pair fails if the banner is deleted AND if it fires unconditionally.
    // The fixture board is stamped 2026-08-01, so a file written now is newer.
    const staleRoot = join(tmp, "stale-root");
    const backlog = join(staleRoot, "docs/work/BACKLOG.md");
    mkdirSync(dirname(backlog), { recursive: true });
    writeFileSync(backlog, "# Backlog\n", "utf8");
    const staleStore = join(tmp, "stale-store");
    cpSync(fixture, staleStore, { recursive: true });
    const renderAgainst = (): string => {
      execFileSync("node", [script, "--root", staleRoot, "--store", staleStore, "--no-open"], { stdio: "pipe" });
      return readFileSync(join(staleStore, "index.html"), "utf8");
    };
    const staleHtml = renderAgainst();
    const old = new Date("2026-07-01T00:00:00Z");
    utimesSync(backlog, old, old);
    const freshHtml = renderAgainst();
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
      // The `mixed` pill. Exactly ONE fixture item declares `Mixed:`, so the
      // count is its own negative control: a renderer that draws the pill
      // unconditionally scores one per board row, not one per declaring item.
      (html.match(/>mixed P3</g) ?? []).length === 1
        ? ok("a board item declaring `mixed` renders one pill (the check can fail)")
        : fail("the `mixed` pill is missing or drawn on items that never declared one"),
      // Same shape for `derived` — one fixture item sets it, so the count is
      // its own negative control. This pill is the whole visible half of the
      // three-state model: without it the board shows a rank a tool computed
      // exactly as it shows one the user chose.
      (html.match(/>derived</g) ?? []).length === 1
        ? ok("a board item whose priority is derived renders one pill (the check can fail)")
        : fail("the `derived` pill is missing or drawn on items nobody marked — an unconfirmed rank then reads as a chosen one"),
      // Assert the ELEMENT, not the class: `.bstale` is in every stylesheet.
      staleHtml.includes(`<p class="bstale">`)
        ? ok("the Board tab warns when the work docs changed after the board was computed")
        : fail("a board older than its source docs rendered with no staleness warning"),
      !freshHtml.includes(`<p class="bstale">`)
        ? ok("a board newer than its source docs renders no warning (the check can fail)")
        : fail("the staleness warning fired on a board that is up to date"),
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

// docs-check over a real docs tree. The fixture's triad was promoted, so it
// carries provenance + findings.md; deleting the evidence in a COPY is the
// negative control — without it the positive assertion would stay green if
// the promotion check were deleted.
const checkDocsTree = (root: string, skillsDir: string): Result => {
  const script = join(skillsDir, "librarian/scripts/docs-check.ts");
  const fixture = join(root, "scripts/fixtures/docs-tree");
  if (!existsSync(script) || !existsSync(fixture)) return fail("docs-check or its fixture tree is missing");
  const run = (r: string): boolean => {
    try {
      execFileSync("node", [script, r, "docs/README.md"], { stdio: "pipe" });
      return true;
    } catch { return false; }
  };
  // `--item` is the mode `--promote` calls on a staged item BEFORE renaming it
  // into docs/, so it is the last point anything can be caught while the tree
  // is still clean. Untested, the atomic-creation step validates nothing.
  const runItem = (d: string): boolean => {
    try {
      execFileSync("node", [script, "--item", d], { stdio: "pipe" });
      return true;
    } catch { return false; }
  };
  const tmp = mkdtempSync(join(tmpdir(), "supermodo-docs-"));
  // Each mutation is applied to its own copy of the clean tree, so every
  // assertion below fails on exactly one defect.
  const mutate = (name: string, file: string, edit: (s: string) => string): string => {
    const dir = join(tmp, name);
    cpSync(fixture, dir, { recursive: true });
    const p = join(dir, "docs/work/hunt-api-p1", file);
    writeFileSync(p, edit(readFileSync(p, "utf8")), "utf8");
    return dir;
  };
  try {
    const stripped = join(tmp, "no-evidence");
    cpSync(fixture, stripped, { recursive: true });
    rmSync(join(stripped, "docs/work/hunt-api-p1/findings.md"));
    // "…-011" CONTAINS "…-01": a substring check calls this present.
    const prefix = mutate("prefix", "spec.md", (s) =>
      s.replace(/HNT-20260803141500-011(?=[^\d])/, "HNT-20260803141500-01"));
    // The id appears in tasks.md as prose, but no checklist line carries it.
    const prose = mutate("prose", "tasks.md", (s) =>
      s.replace(/- \[ \].*<!-- task:hnt-20260803141500-011 -->/, "Also see HNT-20260803141500-011."));
    // The MARKER survives, but on a prose line — no checklist task exists, so
    // nobody can do the work. Scanning the file instead of its checklist lines
    // calls this present.
    const orphanMarker = mutate("orphan-marker", "tasks.md", (s) =>
      s.replace(/- \[ \].*(<!-- task:hnt-20260803141500-011 -->)/, "Context only $1"));
    // Evidence written, provenance not — exactly what an interrupted extension
    // leaves behind, and it looks clean without the reverse comparison.
    const orphanEvidence = mutate("orphan-evidence", "findings.md", (s) =>
      `${s}\n## HNT-20260803141500-099 — added by an extension that never finished\n\n- severity: low · kind: improvement · \`src/api/sign.ts:200\`\n`);
    const dupId = mutate("dup-id", "spec.md", (s) =>
      s.replace(/^Promoted-ids: .*$/m, "Promoted-ids: HNT-20260803141500-004, HNT-20260803141500-004, HNT-20260803141500-011"));
    // Headings only. Every set comparison still agrees, and the item carries
    // nothing anyone can act on — the shard it came from is gitignored.
    const hollow = mutate("hollow", "findings.md", () =>
      "# Findings\n\n## HNT-20260803141500-004 — nonce is never checked\n\n## HNT-20260803141500-011 — expiry compared with `<`\n");
    const noTitle = mutate("no-title", "findings.md", (s) =>
      s.replace(/^## HNT-20260803141500-011 — .*$/m, "## HNT-20260803141500-011"));
    // BOTH keys near-missed, so no exact line matches at all. Bailing out on
    // that skips every check below while findings.md sits there unvalidated.
    const nearMiss = mutate("near-miss", "spec.md", (s) =>
      s.replace(/^Promoted-from:/m, "promoted-from :").replace(/^Promoted-ids:/m, "promoted-ids :"));
    // Evidence with no provenance at all — the anchored scan a retry uses
    // cannot see this item, so its findings get promoted a second time.
    const noProvenance = mutate("no-provenance", "spec.md", (s) =>
      s.replace(/^Promoted-(from|ids):.*$/gm, "").trim());
    const dupProvenance = mutate("dup-provenance", "spec.md", (s) =>
      s.replace(/^(Promoted-from:.*)$/m, "$1\n$1"));
    // Names the same run, compares equal to nothing — the duplicate scan below
    // matches identities literally.
    const aliasFrom = mutate("alias-from", "spec.md", (s) =>
      s.replace(/^Promoted-from: (.*)$/m, "Promoted-from: $1.md"));
    // A second item claiming the same finding: two racing promotions, or one
    // retried after the grouping changed. Each item is self-consistent, so
    // only a cross-item scan sees it.
    const twice = join(tmp, "twice");
    cpSync(fixture, twice, { recursive: true });
    cpSync(join(fixture, "docs/work/hunt-api-p1"), join(twice, "docs/work/hunt-api-p1-again"), { recursive: true });
    // An empty path segment names the same report and normalises away.
    const emptySeg = mutate("empty-seg", "spec.md", (s) =>
      s.replace(/^Promoted-from: \.skills\/supermodo\/hunt\//m, "Promoted-from: .skills/supermodo/hunt//"));
    // Lower-cased ids name the same findings. Lower-case the EVIDENCE
    // headings too, so every set still agrees internally and only the id
    // format check can catch it — otherwise this passes for the wrong reason.
    const lowerIds = mutate("lower-ids", "spec.md", (s) =>
      s.replace(/^Promoted-ids: .*$/m, (m) => m.toLowerCase().replace("promoted-ids:", "Promoted-ids:")));
    writeFileSync(
      join(lowerIds, "docs/work/hunt-api-p1/findings.md"),
      readFileSync(join(lowerIds, "docs/work/hunt-api-p1/findings.md"), "utf8")
        .replace(/^## HNT-(\S+)/gm, (_m, rest) => `## hnt-${rest}`),
      "utf8",
    );
    // A derived priority is a stored, valid value that no human confirmed. It
    // must be WRITABLE — refusing it would leave unattended runs choosing
    // between an unranked P0 and a fake judgement (worklist.md).
    const derivedOk = mutate("derived-ok", "spec.md", (s) =>
      s.replace(/^(Priority: .*)$/m, "$1\nPriority-source: derived — exposure assumed from local main 2026-08-03"));
    // The marker signs a value that is not there.
    const derivedNoPriority = mutate("derived-no-priority", "spec.md", (s) =>
      s.replace(/^Priority: .*$/m, "Priority-source: derived — exposure assumed from local main 2026-08-03"));
    // …or one no reader can parse, which renders as `P2 — unset` while the
    // marker claims a tool ranked it. Two different stories about one item.
    const derivedBadPriority = mutate("derived-bad-priority", "spec.md", (s) =>
      s.replace(/^Priority: .*$/m, "Priority: P1 released-workflow-breaking signed requests can be replayed\nPriority-source: derived — exposure assumed 2026-08-03"));
    // The whole point of the marker is naming what was assumed, so the user
    // confirming it knows what they are confirming.
    const derivedNoReason = mutate("derived-no-reason", "spec.md", (s) =>
      s.replace(/^(Priority: .*)$/m, "$1\nPriority-source: derived"));
    // Absence means confirmed, so an unparseable value must not be treated as
    // absence — that would let a typo launder a derived rank into a chosen one.
    const derivedUnknownValue = mutate("derived-unknown-value", "spec.md", (s) =>
      s.replace(/^(Priority: .*)$/m, "$1\nPriority-source: confirmed — asked at intake 2026-08-03"));
    const twoPriorities = mutate("two-priorities", "spec.md", (s) =>
      s.replace(/^(Priority: .*)$/m, "$1\nPriority: P3 — improvement: also worth tidying the client"));
    const twoSources = mutate("two-sources", "spec.md", (s) =>
      s.replace(/^(Priority: .*)$/m, "$1\nPriority-source: derived — exposure assumed 2026-08-03\nPriority-source: derived — severity read from the shard 2026-08-03"));
    // Same report, different case. On a case-insensitive filesystem these are
    // one directory, so keying the duplicate scan on the raw string misses it.
    const caseTwice = join(tmp, "case-twice");
    cpSync(fixture, caseTwice, { recursive: true });
    const second = join(caseTwice, "docs/work/hunt-api-p1-again");
    cpSync(join(fixture, "docs/work/hunt-api-p1"), second, { recursive: true });
    writeFileSync(
      join(second, "spec.md"),
      readFileSync(join(second, "spec.md"), "utf8")
        .replace("supermodo/hunt/", "supermodo/HUNT/"),
      "utf8",
    );
    const itemGood = join(fixture, "docs/work/hunt-api-p1");
    const itemBad = join(derivedNoReason, "docs/work/hunt-api-p1");
    return merge(
      run(fixture)
        ? ok("docs-check accepts a valid promoted triad")
        : fail("docs-check rejected scripts/fixtures/docs-tree, which is meant to be clean"),
      runItem(itemGood)
        ? ok("docs-check --item accepts a valid staged item")
        : fail("docs-check --item rejected a clean item — the promotion path validates every item through this mode"),
      runItem(itemBad)
        ? fail("docs-check --item ACCEPTED a malformed item — the promotion path stages and validates through this mode, so nothing would be caught before the rename")
        : ok("docs-check --item rejects a malformed staged item (the check can fail)"),
      run(stripped)
        ? fail("docs-check ACCEPTED a promoted triad with no findings.md — its evidence is gitignored and now lost")
        : ok("docs-check rejects a promoted triad whose evidence is missing (the check can fail)"),
      run(prefix)
        ? fail("docs-check ACCEPTED a promoted id matched only as a PREFIX of another — substring, not identity")
        : ok("docs-check matches promoted ids exactly, not by substring (the check can fail)"),
      run(prose)
        ? fail("docs-check ACCEPTED a promoted id mentioned in prose with no task carrying it")
        : ok("docs-check requires a real task marker, not a prose mention (the check can fail)"),
      run(orphanMarker)
        ? fail("docs-check ACCEPTED a task marker on a prose line — there is no checklist task to do")
        : ok("docs-check reads task ids from checklist lines only (the check can fail)"),
      run(orphanEvidence)
        ? fail("docs-check ACCEPTED evidence with no Promoted-ids entry — an interrupted extension reads as clean")
        : ok("docs-check compares evidence against Promoted-ids in BOTH directions (the check can fail)"),
      run(dupId)
        ? fail("docs-check ACCEPTED a duplicated id in Promoted-ids")
        : ok("docs-check rejects a duplicated Promoted-ids entry (the check can fail)"),
      run(hollow)
        ? fail("docs-check ACCEPTED findings.md headings with empty bodies — a heading is not evidence")
        : ok("docs-check requires each finding section to carry its evidence (the check can fail)"),
      run(noTitle)
        ? fail("docs-check ACCEPTED a finding heading with no title in the documented shape")
        : ok("docs-check requires the documented finding heading shape (the check can fail)"),
      run(nearMiss)
        ? fail("docs-check SKIPPED every promotion check because a provenance key was misspelled")
        : ok("docs-check catches a near-miss provenance key instead of bailing out (the check can fail)"),
      run(noProvenance)
        ? fail("docs-check ACCEPTED a findings.md with no provenance — a retry would promote it again")
        : ok("docs-check requires provenance wherever findings.md exists (the check can fail)"),
      run(dupProvenance)
        ? fail("docs-check ACCEPTED two Promoted-from lines — only the first is ever read")
        : ok("docs-check rejects duplicated provenance lines (the check can fail)"),
      run(aliasFrom)
        ? fail("docs-check ACCEPTED a non-canonical Promoted-from — the duplicate scan compares identities literally")
        : ok("docs-check requires a canonical run identity in Promoted-from (the check can fail)"),
      run(twice)
        ? fail("docs-check ACCEPTED the same finding promoted into two items — one bug, fixed twice")
        : ok("docs-check rejects one finding promoted into two items (the check can fail)"),
      run(emptySeg)
        ? fail("docs-check ACCEPTED an unnormalised Promoted-from — it names the same run and compares as a different key")
        : ok("docs-check requires a normalised run identity (the check can fail)"),
      run(derivedOk)
        ? ok("docs-check accepts a well-formed derived priority")
        : fail("docs-check REJECTED a valid `Priority-source: derived` — an unattended run then has no honest way to rank"),
      run(derivedNoPriority)
        ? fail("docs-check ACCEPTED Priority-source with no Priority — the marker signs a value that is not there")
        : ok("docs-check requires a derived marker to sit beside a priority (the check can fail)"),
      run(derivedBadPriority)
        ? fail("docs-check ACCEPTED a derived marker on a malformed Priority — it renders `P2 — unset` while claiming to be ranked")
        : ok("docs-check requires the priority a derived marker signs to be valid (the check can fail)"),
      run(derivedNoReason)
        ? fail("docs-check ACCEPTED a derived marker naming no assumption — nothing for the user to confirm")
        : ok("docs-check requires a derived marker to name its assumption (the check can fail)"),
      run(derivedUnknownValue)
        ? fail("docs-check ACCEPTED an unrecognised Priority-source value — absence means confirmed, so a typo launders a derived rank into a chosen one")
        : ok("docs-check rejects an unrecognised Priority-source value (the check can fail)"),
      run(twoPriorities)
        ? fail("docs-check ACCEPTED two Priority fields — every reader disagrees about the real value")
        : ok("docs-check rejects two priority fields in one item (the check can fail)"),
      run(twoSources)
        ? fail("docs-check ACCEPTED two Priority-source lines")
        : ok("docs-check rejects duplicated Priority-source lines (the check can fail)"),
      run(caseTwice)
        ? fail("docs-check ACCEPTED one finding claimed twice under case-variant paths of the same report")
        : ok("docs-check compares run identities case-insensitively (the check can fail)"),
      run(lowerIds)
        ? fail("docs-check ACCEPTED lower-cased Promoted-ids — a retry in the shard's own casing claims them again")
        : ok("docs-check requires canonical finding ids in Promoted-ids (the check can fail)"),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

// Every skill that reads project rules must reach the master by the
// single-source path. RESOLVE the reference, never substring-match it: a bare
// "protocols/references/rules.md" (no "../") resolves nowhere AND is invisible
// to checkSingleSource, whose REF_RE requires (?:\.\./)+ — so a substring check
// would keep this suite green with the master unreachable.
// EVERY skill reads project rules. The exceptions are enumerated here rather
// than left implicit, because a skill that silently stops reading rules is a
// project's process being ignored without anyone being told:
//   protocols — holds the masters and answers questions about them; it has no
//               project process to own.
//   reports   — a thin wrapper over a deterministic renderer. Its only knobs
//               (`reports.html`, `reports.open`) are strict config, and a
//               prose file cannot change a script's output.
// Adding a name here needs the same justification: not "it has no template
// yet" (reading and shipping a template are different things) but "there is
// no sequence a project could own".
const RULES_EXEMPT: readonly string[] = ["protocols", "reports"];
const RULES_REF_RE = /(?:\.\.\/)+protocols\/references\/rules\.md/;
const checkRulesMaster = (skillsDir: string, found: readonly string[]): Result => {
  const master = join(skillsDir, "protocols/references/rules.md");
  if (!existsSync(master)) return fail("skills/protocols/references/rules.md missing — the rules contract has no master");
  return merge(
    ...found.filter((s) => !RULES_EXEMPT.includes(s)).map((slug) => {
      const sk = join(skillsDir, slug, "SKILL.md");
      if (!existsSync(sk)) return fail(`skills/${slug}/SKILL.md missing`);
      const rel = readFileSync(sk, "utf8").match(RULES_REF_RE)?.[0];
      return rel !== undefined && resolve(dirname(sk), rel) === master
        ? ok(`skills/${slug} resolves the rules master`)
        : fail(`skills/${slug}/SKILL.md: no reference resolving to skills/protocols/references/rules.md — every skill reads project rules; to exempt one, add it to RULES_EXEMPT with a reason`);
    }),
  );
};

// rules-check over a real .supermodo/rules/ tree. Each mutation is applied to
// its own copy of the clean fixture, so every assertion below fails on exactly
// one defect — and each has a negative control, because an assertion that
// cannot fail is worse than no assertion (see the two comments above).
const checkRulesTree = (root: string, skillsDir: string): Result => {
  const script = join(skillsDir, "config/scripts/rules-check.ts");
  const fixture = join(root, "scripts/fixtures/rules-tree");
  if (!existsSync(script) || !existsSync(fixture)) return fail("rules-check or its fixture tree is missing");
  const run = (r: string): boolean => {
    try { execFileSync("node", [script, r], { stdio: "pipe" }); return true; } catch { return false; }
  };
  const tmp = mkdtempSync(join(tmpdir(), "supermodo-rules-"));
  const mutate = (name: string, file: string, edit: (s: string) => string): string => {
    const dir = join(tmp, name);
    cpSync(fixture, dir, { recursive: true });
    const p = join(dir, ".supermodo/rules", file);
    writeFileSync(p, edit(readFileSync(p, "utf8")), "utf8");
    return dir;
  };
  try {
    // The file is read by filename, so a `rule` that disagrees with the stem
    // means the two identities point at different files.
    const stemMismatch = mutate("stem", "commit.md", (s) => s.replace(/^rule: commit$/m, "rule: commits"));
    // A typo'd skill name is a file nothing will ever read — silently.
    const unknownSkill = mutate("unknown-skill", "vcs.md", (s) =>
      s.replace(/^applies-to: .*$/m, "applies-to: [commit, releases]"));
    // No frontmatter at all: nothing can route it and nothing can diff it.
    const noFront = mutate("no-front", "commit.md", (s) => s.replace(/^---\n[\s\S]*?\n---\n/, ""));
    // Drift cannot diff against a starting point that is not named.
    const noTemplate = mutate("no-template", "commit.md", (s) => s.replace(/^template: .*$\n/m, ""));
    const badVersion = mutate("bad-version", "commit.md", (s) => s.replace(/^template-version: .*$/m, "template-version: 0.7"));
    // The INDEX row is the description; without one the file is unroutable.
    const noDesc = mutate("no-desc", "vcs.md", (s) => s.replace(/^description: .*$\n/m, ""));
    // A stem that is not a skill name and declares no applies-to is read by
    // nobody: the filename cannot route it and the INDEX has no rows for it.
    const orphanStem = join(tmp, "orphan-stem");
    cpSync(fixture, orphanStem, { recursive: true });
    writeFileSync(join(orphanStem, ".supermodo/rules/security.md"),
      "---\nrule: security\ndescription: orphan\ntemplate: security\ntemplate-version: 0.7.0\n---\n\n## Process\n\n1. Nothing.\n", "utf8");
    // 4 KB is a smell detector, not just a budget: a process this long is
    // transcribing machinery, which goes stale the moment that code changes.
    const oversized = mutate("oversized", "commit.md", (s) => `${s}\n${"x".repeat(4096)}\n`);
    // A stale INDEX is worse than none: the skill reads it as the routing
    // table, so a missing row means the file is never loaded by anyone.
    const staleIndex = mutate("stale-index", "INDEX.md", (s) => s.replace(/^\| vcs\.md .*$\n/m, ""));
    // A row for a file that is not cross-cutting sends a skill to read a file
    // the filename convention already covers — double-loading its own rules.
    const overIndex = mutate("over-index", "INDEX.md", (s) =>
      `${s}| commit.md | commit | Conventional Commits with the Jira key from the branch name |\n`);
    // Hand-edited generated file: the marker is the repo-wide contract that
    // only the generator writes it.
    const noMarker = mutate("no-marker", "INDEX.md", (s) => s.replace("<!-- supermodo:generated -->\n", ""));
    // The FILENAME is still right, so every set comparison keyed on filenames
    // agrees — but the row routes vcs.md to release only. commit would never
    // load a file whose own frontmatter names it.
    const wrongRow = mutate("wrong-row", "INDEX.md", (s) =>
      s.replace(/^\| vcs\.md \| [^|]*\|/m, "| vcs.md | release |"));
    // INDEX is a file and counts against the budget like any other.
    const bigIndex = mutate("big-index", "INDEX.md", (s) => `${s}\n${"x".repeat(4096)}\n`);
    // The generator and the validator must agree, or `config --rules` writes
    // an INDEX that rules-check then rejects. Guard the exec: every other exec
    // in this file goes through a try/catch, and an unguarded throw here kills
    // check.ts with a stack trace instead of printing a clean FAIL.
    const regen = join(tmp, "regen");
    cpSync(fixture, regen, { recursive: true });
    const generated = ((): string | undefined => {
      try {
        execFileSync("node", [join(skillsDir, "config/scripts/rules-index.ts"), regen], { stdio: "pipe" });
        return readFileSync(join(regen, ".supermodo/rules/INDEX.md"), "utf8");
      } catch { return undefined; }
    })();
    const committed = readFileSync(join(fixture, ".supermodo/rules/INDEX.md"), "utf8");
    return merge(
      run(fixture)
        ? ok("rules-check accepts a valid .supermodo/rules/ tree")
        : fail("rules-check rejected scripts/fixtures/rules-tree, which is meant to be clean"),
      run(stemMismatch)
        ? fail("rules-check ACCEPTED a `rule` that disagrees with the filename — the skill reads by filename, so the two identities name different files")
        : ok("rules-check requires `rule` to equal the filename stem (the check can fail)"),
      run(unknownSkill)
        ? fail("rules-check ACCEPTED applies-to naming a skill that is not installed — a typo makes a file nothing ever reads")
        : ok("rules-check validates applies-to against installed skills (the check can fail)"),
      run(noFront)
        ? fail("rules-check ACCEPTED a rules file with no frontmatter")
        : ok("rules-check requires frontmatter (the check can fail)"),
      run(noTemplate)
        ? fail("rules-check ACCEPTED a rules file naming no template — drift has nothing to diff against")
        : ok("rules-check requires `template` (the check can fail)"),
      run(badVersion)
        ? fail("rules-check ACCEPTED a non-semver template-version")
        : ok("rules-check requires a semver template-version (the check can fail)"),
      run(noDesc)
        ? fail("rules-check ACCEPTED a rules file with no description — the INDEX row would be blank")
        : ok("rules-check requires a description (the check can fail)"),
      run(orphanStem)
        ? fail("rules-check ACCEPTED a non-skill filename with no applies-to — nothing would ever read it")
        : ok("rules-check requires applies-to on a non-skill filename (the check can fail)"),
      run(oversized)
        ? fail("rules-check ACCEPTED a rules file over the 4 KB cap")
        : ok("rules-check enforces the 4 KB per-file cap (the check can fail)"),
      run(staleIndex)
        ? fail("rules-check ACCEPTED an INDEX missing a cross-cutting file — that file would be read by nobody")
        : ok("rules-check requires every cross-cutting file to have an INDEX row (the check can fail)"),
      run(overIndex)
        ? fail("rules-check ACCEPTED an INDEX row for a per-skill file — the skill would load its own rules twice")
        : ok("rules-check rejects INDEX rows for non-cross-cutting files (the check can fail)"),
      run(noMarker)
        ? fail("rules-check ACCEPTED an INDEX without the generated marker — nothing then stops a hand edit")
        : ok("rules-check requires the generated marker on INDEX.md (the check can fail)"),
      run(wrongRow)
        ? fail("rules-check ACCEPTED an INDEX row whose applies-to contradicts the file's frontmatter — the file would be routed to the wrong skills while every filename comparison still agreed")
        : ok("rules-check compares whole INDEX rows against frontmatter, not filenames (the check can fail)"),
      run(bigIndex)
        ? fail("rules-check ACCEPTED an oversized INDEX — it is a file and counts against the invocation budget")
        : ok("rules-check applies the size cap to INDEX.md too (the check can fail)"),
      generated === committed
        ? ok("rules-index regenerates the fixture INDEX byte-identically")
        : fail(`rules-index output differs from the committed INDEX — the generator and the fixture disagree${generated === undefined ? " (rules-index exited non-zero)" : ""}`),
      run(regen)
        ? ok("a freshly generated INDEX passes rules-check")
        : fail("rules-index wrote an INDEX that rules-check rejects — the two disagree"),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

// A gated skill without a shipped template has nothing to show at its
// first-use gate, so the gate would ask the user to approve nothing. The gate
// shows the `summary` block VERBATIM, and `summary: >` with nothing under it
// satisfies a presence regex while leaving the gate with no text at all — so
// count the actual content lines.
// Skills that stop and show their process before first use. Two triggers:
// irreversible/outward-facing (commit, release) and expensive (flow,
// bug-council). Every skill READS rules; only these four proactively ask.
const GATED = ["commit", "release", "flow", "bug-council"] as const;
const summaryLines = (fm: string): readonly string[] => {
  const lines = fm.split("\n");
  const start = lines.findIndex((l) => /^summary:\s*[>|]/.test(l));
  if (start < 0) return [];
  const after = lines.slice(start + 1);
  const end = after.findIndex((l) => l.length > 0 && !/^\s/.test(l));
  return (end < 0 ? after : after.slice(0, end)).map((l) => l.trim()).filter((l) => l.length > 0);
};
const checkRulesTemplates = (skillsDir: string, found: readonly string[]): Result =>
  merge(
    // A gated skill MUST ship a starting point — otherwise its gate asks the
    // user to approve nothing.
    ...GATED.filter((slug) => !existsSync(join(skillsDir, slug, "rules-templates")))
      .map((slug) => fail(`skills/${slug}/rules-templates/ missing — a gated skill must ship at least one starting point`)),
    // Every template anywhere is validated, gated or not: `work` ships one and
    // never gates, and an unvalidated template is one `config --rules` cannot
    // materialize into a file that passes rules-check.
    ...found.flatMap((slug) => {
      const dir = join(skillsDir, slug, "rules-templates");
      if (!existsSync(dir)) return [];
      const variants = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
      if (variants.length === 0) return [fail(`skills/${slug}/rules-templates/ is empty`)];
      if (variants.length > 3) return [fail(`skills/${slug}/rules-templates/: ${variants.length} variants (max 3) — beyond that the gate is a menu nobody reads`)];
      return [
        ...variants.flatMap((v) => {
          const fm = readFileSync(join(dir, v), "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
          const stem = v.replace(/\.md$/, "");
          const rule = fm.match(/^rule:\s*(\S+)$/m)?.[1];
          const summary = summaryLines(fm);
          return [
            summary.length >= 5 && summary.length <= 7
              ? merge()
              : fail(`skills/${slug}/rules-templates/${v}: \`summary:\` has ${summary.length} content line(s), needs 5-7 — the gate shows this block verbatim`),
            new RegExp(`^template:\\s*${stem}$`, "m").test(fm)
              ? merge()
              : fail(`skills/${slug}/rules-templates/${v}: \`template\` must equal the variant filename stem "${stem}"`),
            // `rule` is the DESTINATION stem (procedures §9), not the folder.
            // A cross-cutting template lives in some skill's folder but
            // materializes under its own name — and must then say who reads it.
            rule === slug || (rule !== undefined && /^applies-to:/m.test(fm))
              ? merge()
              : fail(`skills/${slug}/rules-templates/${v}: \`rule\` is ${JSON.stringify(rule ?? null)} — it must equal "${slug}", or declare applies-to if it is cross-cutting`),
          ];
        }),
        ok(`skills/${slug} ships ${variants.length} rules template(s)`),
      ];
    }),
  );

const checkFixtures = (root: string, skillsDir: string): Result => {
  const script = join(skillsDir, "config/scripts/config-check.ts");
  return merge(
    runFixture(script, join(root, "scripts/fixtures/config-valid.json"))
      ? ok("config-check accepts valid fixture")
      : fail("config-check rejected scripts/fixtures/config-valid.json"),
    runFixture(script, join(root, "scripts/fixtures/config-invalid.json"))
      ? fail("config-check ACCEPTED scripts/fixtures/config-invalid.json (should fail)")
      : ok("config-check rejects invalid fixture"),
    // Each new rule needs a fixture valid EXCEPT for that rule. Adding a vcs
    // defect to config-invalid.json would prove nothing: that file already
    // fails for other reasons, so the assertion would stay green with the
    // whole vcs validator deleted.
    runFixture(script, join(root, "scripts/fixtures/config-vcs-nocapture.json"))
      ? fail("config-check ACCEPTED a vcs.issueKey.pattern with no capturing group — there is nothing to extract as the key")
      : ok("config-check rejects an issueKey pattern with no capturing group (the check can fail)"),
    runFixture(script, join(root, "scripts/fixtures/config-vcs-unsafe.json"))
      ? fail("config-check ACCEPTED an issueKey template carrying a quote — it would close the single-quoted `git commit -m '…'` line the commit skill executes verbatim")
      : ok("config-check rejects a shell-unsafe issueKey template (the check can fail)"),
  );
};

// The grammar layer's fixtures live in DIRECTORIES, not as named files: adding
// a validation rule means dropping in a fixture, with no edit here. That makes
// an emptied directory the silent-pass risk, so the counts are asserted too.
// `pass/` is the control that matters most — it proves the validator is not
// simply rejecting every renamed grammar put in front of it.
const checkGrammarFixtures = (root: string, skillsDir: string): Result => {
  const script = join(skillsDir, "config/scripts/config-check.ts");
  const dir = join(root, "scripts/fixtures/grammar");
  const list = (kind: string): readonly string[] => {
    try {
      return readdirSync(join(dir, kind)).filter((f) => f.endsWith(".json")).sort();
    } catch {
      return [];
    }
  };
  const pass = list("pass");
  const rejected = list("fail");
  const wronglyRejected = pass.filter((f) => !runFixture(script, join(dir, "pass", f)));
  const wronglyAccepted = rejected.filter((f) => runFixture(script, join(dir, "fail", f)));
  return merge(
    pass.length >= 2 && rejected.length >= 20
      ? ok(`grammar fixtures present (${pass.length} valid, ${rejected.length} defective)`)
      : fail(`scripts/fixtures/grammar: expected at least 2 pass/ and 20 fail/ fixtures, found ${pass.length} and ${rejected.length} — an empty directory would make the assertions below vacuous`),
    wronglyRejected.length === 0
      ? ok("every renamed-grammar fixture validates (the check can fail)")
      : fail(`config-check REJECTED a valid renamed grammar: ${wronglyRejected.join(", ")} — a project must be able to rename any token`),
    wronglyAccepted.length === 0
      ? ok("every defective-grammar fixture is rejected (the check can fail)")
      : fail(`config-check ACCEPTED a defective grammar: ${wronglyAccepted.join(", ")} — each of those files is valid except for the one rule it names`),
  );
};

// The grammar layer's real claim is that the SAME tree validates under a
// different spelling. `docs-tree-renamed` is `docs-tree` with every folder,
// triad file, field label, priority level, state character and marker prefix
// renamed, plus a project-required `Owner:` field, and its own config saying
// so. Three things have to hold, and the last two are what stop this from
// being a fixture that passes because nothing runs:
//   1. it is clean under its own grammar;
//   2. it FAILS under the defaults — proof the config is what drove (1);
//   3. mutations are still caught — proof the checks are live, not skipped.
const checkRenamedGrammar = (root: string, skillsDir: string): Result => {
  const script = join(skillsDir, "librarian/scripts/docs-check.ts");
  const fixture = join(root, "scripts/fixtures/docs-tree-renamed");
  if (!existsSync(script) || !existsSync(fixture)) {
    return fail("scripts/fixtures/docs-tree-renamed is missing — the grammar layer has no proof a renamed convention validates");
  }
  const clean = (dir: string): boolean => {
    try {
      execFileSync("node", [script, dir, "documentation/README.md", "documentation/CONVENTIONS.md"], { stdio: "pipe" });
      return true;
    } catch { return false; }
  };
  const tmp = mkdtempSync(join(tmpdir(), "supermodo-grammar-"));
  const copy = (name: string): string => {
    const dir = join(tmp, name);
    cpSync(fixture, dir, { recursive: true });
    return dir;
  };
  const edit = (name: string, file: string, fn: (s: string) => string): string => {
    const dir = copy(name);
    const f = join(dir, "documentation/tickets/hunt-api-p1", file);
    writeFileSync(f, fn(readFileSync(f, "utf8")), "utf8");
    return dir;
  };
  try {
    const noConfig = copy("no-config");
    rmSync(join(noConfig, "skills.config.json"));
    const noOwner = edit("no-owner", "brief.md", (t) => t.replace("Owner: platform-team\n", ""));
    const noMarker = edit("no-marker", "checklist.md", (t) =>
      t.replace(" <!-- item:hnt-20260803141500-004 -->", ""));
    return merge(
      clean(fixture)
        ? ok("a fully renamed docs convention validates (the check can fail)")
        : fail("docs-check REJECTED scripts/fixtures/docs-tree-renamed under its own grammar — a project cannot rename the convention"),
      clean(noConfig)
        ? fail("docs-check ACCEPTED the renamed tree with its skills.config.json removed — it is not reading the grammar from config, so assertion 1 proves nothing")
        : ok("the renamed tree fails under the default grammar (the check can fail)"),
      clean(noOwner)
        ? fail("docs-check ACCEPTED a spec missing a docs.grammar.extraRequired.spec field — the add-only half of the grammar is not enforced")
        : ok("a project-required extra field is enforced (the check can fail)"),
      clean(noMarker)
        ? fail("docs-check ACCEPTED a checklist line with no renamed task marker — the task-id check is not running under a renamed grammar")
        : ok("task IDs are checked under a renamed marker prefix (the check can fail)"),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

// docs-generate WRITES the router's nav section, so a grammar it does not read
// produces links to paths that do not exist — broken navigation in the one file
// every skill starts from. Asserted on copies: generate twice, require the
// second run to change nothing, and require the renamed tree's nav to name the
// renamed paths rather than the defaults.
const checkGenerateGrammar = (root: string, skillsDir: string): Result => {
  const script = join(skillsDir, "librarian/scripts/docs-generate.ts");
  if (!existsSync(script)) return fail("docs-generate.ts is missing");
  const tmp = mkdtempSync(join(tmpdir(), "supermodo-gen-"));
  const run = (dir: string, entry: string): string | undefined => {
    try {
      execFileSync("node", [script, dir, entry], { stdio: "pipe" });
      execFileSync("node", [script, dir, entry], { stdio: "pipe" });
      return readFileSync(join(dir, entry), "utf8");
    } catch { return undefined; }
  };
  const once = (dir: string, entry: string): string | undefined => {
    try {
      execFileSync("node", [script, dir, entry], { stdio: "pipe" });
      return readFileSync(join(dir, entry), "utf8");
    } catch { return undefined; }
  };
  const copy = (name: string, fixture: string): string => {
    const dir = join(tmp, name);
    cpSync(join(root, "scripts/fixtures", fixture), dir, { recursive: true });
    return dir;
  };
  try {
    const plain = copy("plain", "docs-tree");
    const renamed = copy("renamed", "docs-tree-renamed");
    const first = once(plain, "docs/README.md");
    const second = run(plain, "docs/README.md");
    const nav = run(renamed, "documentation/README.md");
    return merge(
      first !== undefined && second !== undefined && first === second
        ? ok("docs-generate is idempotent (the check can fail)")
        : fail("docs-generate is not idempotent — a second run changed the router, so every lifecycle pass would rewrite it"),
      nav === undefined
        ? fail("docs-generate failed on the renamed-grammar fixture")
        : nav.includes("(tickets/hunt-api-p1/brief.md)") && nav.includes("(tickets/QUEUE.md)")
          ? ok("docs-generate writes nav links in the project's own grammar (the check can fail)")
          : fail("docs-generate wrote nav links that ignore docs.layout — the router would point at paths that do not exist"),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

// `commit` writes the message and `release` derives the semver bump from it,
// so the type vocabulary has to be ONE key both read. Before the grammar layer
// it was prose in commit/SKILL.md and a regex in release-check.ts, with nothing
// tying them: rename a type in either and every feature commit silently
// downgrades to a patch. The probe pins both directions — a renamed vocabulary
// bumps correctly, and neither grammar can read the other's types.
const EXPECTED_BUMPS: readonly string[] = [
  "default-feat=minor", "default-fix=patch", "default-breaking=major",
  "default-footer=major", "default-sees-feature=none",
  "renamed-feature=minor", "renamed-bug=patch", "renamed-breaking=major",
  "renamed-sees-feat=none", "max=minor",
  "alpha-demote=minor", "alpha-strict=major", "alpha-past-1.0=major",
];

const checkBumpGrammar = (root: string): Result => {
  const probe = join(root, "scripts/fixtures/bump-probe.mjs");
  if (!existsSync(probe)) return fail("scripts/fixtures/bump-probe.mjs is missing — the semver bump has no proof it reads the project's commit vocabulary");
  const out = ((): readonly string[] => {
    try {
      return execFileSync("node", [probe], { encoding: "utf8" }).trim().split("\n");
    } catch { return []; }
  })();
  const wrong = EXPECTED_BUMPS.filter((e) => !out.includes(e));
  return wrong.length === 0 && out.length === EXPECTED_BUMPS.length
    ? ok("the semver bump follows the project's commit vocabulary (the check can fail)")
    : fail(`bump derivation disagrees with the documented mapping: expected ${wrong.join(", ") || "(count mismatch)"} — got ${out.join(", ") || "(no output)"}`);
};

// docs-convention.md prints the DEFAULT names concretely, because a model
// follows a concrete tree far better than an abstract description of one. The
// cost of that choice is drift: change a default in grammar.ts and the prose
// silently teaches the old name. This asserts the direction that matters —
// every default the code defines must still appear in the prose. (The reverse,
// prose naming something the code dropped, is caught by the fixtures instead.)
const DEFAULT_MENTIONS: readonly (readonly [string, (v: string) => string])[] = [
  ["docs.layout.work", (v) => `${v}/`],
  ["docs.layout.decisions", (v) => `${v}/`],
  ["docs.layout.reference", (v) => `${v}/`],
  ["docs.layout.archive", (v) => `${v}/`],
  ["docs.layout.backlog", (v) => v],
  ["docs.layout.triad.spec", (v) => v],
  ["docs.layout.triad.plan", (v) => v],
  ["docs.layout.triad.tasks", (v) => v],
  ["docs.layout.triad.findings", (v) => v],
  ["docs.layout.adr.prefix", (v) => v],
  ["docs.layout.splitThresholdKb", (v) => `${v} KB`],
  ["docs.grammar.priority.label", (v) => `${v}:`],
  ["docs.grammar.prioritySource.label", (v) => `${v}:`],
  ["docs.grammar.mixed.label", (v) => `${v}:`],
  ["docs.grammar.created.label", (v) => `${v}:`],
  ["docs.grammar.dependsOn.label", (v) => `${v}:`],
  ["docs.grammar.promotion.fromLabel", (v) => `${v}:`],
  ["docs.grammar.promotion.idsLabel", (v) => `${v}:`],
  ["docs.grammar.task.markerPrefix", (v) => `${v}:`],
  ["docs.grammar.question.markerPrefix", (v) => `${v}:`],
  ["docs.grammar.question.heading", (v) => v],
  ["docs.grammar.generated.fileMarker", (v) => v],
  ["docs.grammar.generated.navStart", (v) => v],
  ["docs.grammar.generated.navEnd", (v) => v],
];

const checkConventionDefaults = (root: string, skillsDir: string): Result => {
  const doc = join(skillsDir, "protocols/references/docs-convention.md");
  const probe = join(root, "scripts/fixtures/defaults-probe.mjs");
  if (!existsSync(doc) || !existsSync(probe)) return fail("docs-convention.md or scripts/fixtures/defaults-probe.mjs is missing");
  const values = ((): Record<string, string> => {
    try {
      return JSON.parse(execFileSync("node", [probe], { encoding: "utf8" })) as Record<string, string>;
    } catch { return {}; }
  })();
  const text = readFileSync(doc, "utf8");
  const missing = DEFAULT_MENTIONS
    .filter(([key, render]) => values[key] === undefined || !text.includes(render(values[key])))
    .map(([key]) => key);
  return missing.length === 0
    ? ok("docs-convention.md prints the defaults the code defines (the check can fail)")
    : fail(`docs-convention.md no longer names the default for: ${missing.join(", ")} — the prose teaches a name the code does not use`);
};

// A skill that CONSTRUCTS a docs path — rather than following links out of the
// router — has to resolve the name from config first, or it writes a second
// tree beside the real one in any project that renamed a folder. The roster is
// enumerated so adding a skill to it is a decision someone makes, not a
// side effect of a grep.
const PATH_BUILDERS: readonly string[] = ["librarian", "hunt", "flow", "next", "work", "tests"];

const checkPathResolution = (skillsDir: string): Result => {
  const missing = PATH_BUILDERS.filter((name) => {
    const f = join(skillsDir, name, "SKILL.md");
    return !existsSync(f) || !readFileSync(f, "utf8").includes("Docs names come from config");
  });
  return missing.length === 0
    ? ok("every docs-path-building skill resolves names from config (the check can fail)")
    : fail(`${missing.join(", ")}: builds docs paths but never says to resolve them from docs.layout — it will write to the default names in a project that renamed them`);
};

// "Absent rules file -> the shipped default runs" only means something if
// exactly one variant claims to be the default. Zero and the skill has no
// process to fall back on; two and which one runs is whichever the model read
// first. Cross-cutting templates have no owning skill and so no default.
const checkTemplateDefaults = (skillsDir: string, found: readonly string[]): Result => {
  const results = found.flatMap((name) => {
    const dir = join(skillsDir, name, "rules-templates");
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    const own = files.filter((f) => {
      const fm = readFileSync(join(dir, f), "utf8");
      // A cross-cutting template's `rule:` is not this skill's name.
      return new RegExp(`^rule:[ \\t]*${name}[ \\t]*$`, "m").test(fm);
    });
    if (own.length === 0) return [];
    const defaults = own.filter((f) =>
      /^default:[ \t]*true[ \t]*$/m.test(readFileSync(join(dir, f), "utf8")));
    return defaults.length === 1
      ? [ok(`${name}: one default rules template (${defaults[0]})`)]
      : [fail(`${name}/rules-templates: ${defaults.length} variants marked \`default: true\` (expected exactly 1) — with none there is no process when a project has no rules file, with two the process is whichever one gets read first`)];
  });
  return results.length === 0
    ? fail("no skill ships a rules template — the default-process rule has nothing to check")
    : merge(...results);
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
    checkRulesMaster(skillsDir, found),
    checkRulesTree(root, skillsDir),
    checkRulesTemplates(skillsDir, found),
    checkTemplateDefaults(skillsDir, found),
    checkFixtures(root, skillsDir),
    checkGrammarFixtures(root, skillsDir),
    checkDocsTree(root, skillsDir),
    checkRenamedGrammar(root, skillsDir),
    checkGenerateGrammar(root, skillsDir),
    checkBumpGrammar(root),
    checkConventionDefaults(root, skillsDir),
    checkPathResolution(skillsDir),
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
