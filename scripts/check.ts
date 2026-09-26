// supermodo repo self-check — run from the repo root: node scripts/check.ts
// Validates: manifests parse, skill folders/frontmatter, single-source
// protocol references resolve (no local master copies), fixtures behave.
// Zero dependencies. Node ≥ 22.18.

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync, mkdtempSync, cpSync, rmSync, utimesSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { stripJsonc } from "../skills/config/scripts/jsonc.ts";


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
  const runOut = (r: string): string => {
    try {
      execFileSync("node", [script, r, "docs/README.md"], { stdio: "pipe" });
      return "";
    } catch (e) {
      const err = e as { readonly stdout?: Buffer; readonly stderr?: Buffer };
      return `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
  };
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
    rmSync(join(stripped, "docs/work/hunt-api-p1/findings.md"));    // A work dir that is neither a triad nor a program is nothing the board
    // can read; and program/initiative is the whole depth there is. Both
    // relations held only because the clean fixture never exercised them.
    const loose = join(tmp, "loose");
    cpSync(fixture, loose, { recursive: true });
    mkdirSync(join(loose, "docs/work/loose-notes"), { recursive: true });
    writeFileSync(join(loose, "docs/work/loose-notes/spec.md"), "# loose\n", "utf8");
    const deep = join(tmp, "deep");
    cpSync(fixture, deep, { recursive: true });
    mkdirSync(join(deep, "docs/work/prog-x/01-init/02-deeper"), { recursive: true });
    writeFileSync(join(deep, "docs/work/prog-x/README.md"), "---\nprogram: prog-x\n---\n\n# prog-x\n", "utf8");

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
        : ok("docs-check matches promoted ids exactly, not by substring (the check can fail)"),      runOut(loose).includes("is neither a triad")
        ? ok("docs-check names a work dir that is neither a triad nor a program (the check can fail)")
        : fail("docs-check ACCEPTED a work dir with no tasks.md and no program README — the board would show a folder nothing can read"),
      runOut(deep).includes("nesting deeper than program/initiative")
        ? ok("docs-check refuses nesting below program/initiative (the check can fail)")
        : fail("docs-check ACCEPTED an initiative nested inside an initiative — the two-level depth cap is not enforced"),

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
      : ok("config-check rejects invalid fixture"),    // Comments and trailing commas are the one thing JSONC adds, and every
    // other fixture the suite feeds is strict JSON — so a reader quietly
    // reverted to JSON.parse would have stayed green.
    runFixture(script, join(root, "scripts/fixtures/config-valid-commented.jsonc"))
      ? ok("config-check reads a commented config (the check can fail)")
      : fail("config-check REJECTED scripts/fixtures/config-valid-commented.jsonc — comments and trailing commas are exactly what the shared JSONC reader exists to accept"),

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
    checkMultimodelFixture(root, script),
  );
};

// The multimodel policy fixture is valid EXCEPT for one defect per rule, and
// every rule must name its field: a validator that merely says "invalid" would
// leave the user hunting through a policy for which of eight keys it meant.
const MULTIMODEL_EXPECTED = [
  "agents.hosts is removed",
  "multimodel.models: not a policy key",
  "multimodel.jobs: not a policy key",
  'multimodel.classes.adversary: "adversary" is a shipped class',
  "multimodel.classes.security-audit: project class names match",
  'multimodel.classes.s-triage: unknown key "kind"',
  "multimodel.classes.s-triage.extends: one of",
  "multimodel.variants.hunt: variant name",
  "multimodel.forbid.reviewer[0]",
  "multimodel.require.adversary: non-empty array",
  "multimodel.concurrency: integer 1–8",
] as const;

// The roster validator has a pass set (a role, a project-class role, and a
// user's unrelated agent that keeps its `model:`) and a fail set (engine keys
// in a role, a misspelt class). Both must behave, and the fail messages must
// name the file and the key.
const checkRosterFixtures = (root: string, skillsDir: string): Result => {
  const script = join(skillsDir, "config/scripts/roster-check.ts");
  const fixtureRoot = join(root, "scripts/fixtures/roster");
  const run = (dir: string): { okRun: boolean; stderr: string } => {
    try {
      execFileSync("node", [script, fixtureRoot, dir, "skills.config.json"], { stdio: "pipe" });
      return { okRun: true, stderr: "" };
    } catch (e) {
      return { okRun: false, stderr: String((e as { stderr?: Buffer }).stderr ?? "") };
    }
  };
  const pass = run("pass");
  const failed = run("fail");
  const expected = ['fail/implementer.md: "model:" is not allowed', 'fail/implementer.md: "effort:" is not allowed', "fail/implementer.md: category", 'fail/typo.md: job "advesary" is not a shipped class'];
  const missing = expected.filter((n) => !failed.stderr.includes(n));
  return merge(
    pass.okRun ? ok("roster-check accepts roles, project-class roles and unrelated agents (the check can fail)")
      : fail(`roster-check REJECTED scripts/fixtures/roster/pass: ${pass.stderr.trim()}`),
    failed.okRun ? fail("roster-check ACCEPTED scripts/fixtures/roster/fail (engine keys in a role, misspelt class)")
      : missing.length === 0 ? ok("roster-check names every role-file defect (the check can fail)")
      : fail(`roster-check did not report: ${missing.join(" | ")}`),
  );
};

// The registry writer is exercised end to end in a throwaway registry dir:
// enrol the five transports, assign, then every rule that must refuse — a
// judgment-only model in a generative class, effort on a native alias, an
// unadmitted adapter, an undeclared project class — must refuse BY NAME, and
// the registry on disk must still validate afterwards.
const checkRegistryCli = (root: string, skillsDir: string): Result => {
  const script = join(skillsDir, "config/scripts/models.ts");
  const dir = mkdtempSync(join(tmpdir(), "supermodo-registry-"));
  const env = { ...process.env, SUPERMODO_REGISTRY_DIR: dir };
  const run = (args: readonly string[]): { okRun: boolean; out: string } => {
    try {
      return { okRun: true, out: String(execFileSync("node", [script, ...args], { stdio: "pipe", env, cwd: root })) };
    } catch (e) {
      return { okRun: false, out: String((e as { stderr?: Buffer }).stderr ?? "") };
    }
  };
  const setup = [
    ["enrol", "astra", "--lineage", "openai", "--transport", "adapter", "--adapter", "codex", "--pin", "gpt-6-astra"],
    ["enrol", "opus5", "--lineage", "anthropic", "--transport", "adapter", "--adapter", "claude", "--pin", "claude-opus-5"],
    ["enrol", "jev", "--lineage", "typesafe", "--transport", "http-typed", "--endpoint", "https://api.typesafe.ai/v1/systemone", "--key-env", "TYPESAFE_API_KEY", "--pin", "jev-1.13.0"],
    ["enrol", "flash", "--lineage", "google", "--transport", "http-chat", "--endpoint", "https://example.invalid/v1/chat/completions", "--key-env", "GEMINI_API_KEY", "--pin", "gemini-3.8-flash"],
    ["enrol", "sonnet-native", "--lineage", "anthropic", "--transport", "native", "--host", "claude", "--alias", "sonnet"],
    ["enrol", "gem", "--lineage", "google", "--transport", "adapter", "--adapter", "agy", "--pin", "gemini-3.8-flash-medium"],
    ["consent", "gem"],
    ["consent", "gem", "--revoke"],
    ["assign", "lead", "opus5", "--effort", "medium"],
    ["assign", "adversary", "astra", "--effort", "xhigh"],
    ["assign", "judgment", "jev"],
    ["assign", "leg-work", "sonnet-native"],
    ["assign", "lead", "host"],
    ["assign", "code-generation", "host"],
    ["decline", "lead", "astra", "--effort", "high"],
    ["assign", "s-security-audit", "astra", "--effort", "xhigh", "--project-root", join(root, "scripts/fixtures/roster")],
  ] as const;
  const setupFailures = setup.map((args) => run(args)).filter((r) => !r.okRun).map((r) => r.out.trim());
  const refusals: readonly (readonly [readonly string[], string])[] = [
    [["assign", "lead", "jev"], "typed-judgment model"],
    [["assign", "judgment", "host"], "the host cannot hold a judgment class"],
    [["assign", "lead", "host", "--effort", "high"], "the host seat runs at the session's effort"],
    [["assign", "leg-work", "sonnet-native", "--effort", "high"], "native alias cannot be pinned to an effort"],
    [["enrol", "kimi", "--lineage", "moonshot", "--transport", "adapter", "--adapter", "kimi", "--pin", "k2"], "not admitted until they pass the canary-write test"],
    [["assign", "s-security-audit", "astra"], "not a shipped class nor a project class"],
    [["consent", "astra"], "not a sandboxed adapter"],
    [["enrol", "bad", "--lineage", "x", "--transport", "http-chat", "--endpoint", "https://e.invalid/v1", "--key-env", "MY_SECRET", "--pin", "m"], "never an arbitrary env var name"],
  ];
  const wrongRefusals = refusals
    .map(([args, needle]) => ({ needle, r: run(args) }))
    .filter(({ needle, r }) => r.okRun || !r.out.includes(needle))
    .map(({ needle }) => needle);
  const finalShow = run(["show", "--project-root", join(root, "scripts/fixtures/roster")]);
  rmSync(dir, { recursive: true, force: true });
  return merge(
    setupFailures.length === 0 ? ok("config --models enrols five transports, assigns (incl. the host row), declines and scopes a project class (the check can fail)")
      : fail(`config --models setup failed: ${setupFailures.join(" | ")}`),
    wrongRefusals.length === 0 ? ok("config --models refuses every invalid write by name (the check can fail)")
      : fail(`config --models did not refuse by name: ${wrongRefusals.join(" | ")}`),
    finalShow.okRun && finalShow.out.includes("s-security-audit") && finalShow.out.includes("lead|astra|high")
      ? ok("config --models show lists project-scoped assignments and declines")
      : fail("config --models show is missing the project-scoped assignment or the decline"),
  );
};

// A sandboxed seat reads a disposable copy: committable files and the files
// its brief names, never .git, .env or node_modules; any write in the copy is
// seen. Probed on a non-git tree (the fallback exclude list).
const checkSandboxCopy = (skillsDir: string): Result => {
  const src = mkdtempSync(join(tmpdir(), "supermodo-sbx-src-"));
  const files: Readonly<Record<string, string>> = {
    "src/a.ts": "export const a = 1;\n", ".env": "TOKEN=x\n", "node_modules/m/i.js": "x\n", ".git/config": "[core]\n", "keys/id_rsa": "k\n", ".skills/r/plan.md": "plan\n",
  };
  Object.entries(files).forEach(([f, body]) => { mkdirSync(dirname(join(src, f)), { recursive: true }); writeFileSync(join(src, f), body); });
  const script = join(skillsDir, "protocols/scripts/sandbox-copy.ts");
  const probe = `import { makeCopy, changesIn, removeCopy } from ${JSON.stringify(script)};
import { existsSync, mkdirSync, writeFileSync } from "node:fs"; import { join } from "node:path";
const c = makeCopy(${JSON.stringify(src)}, "review ${src}/.skills/r/plan.md");
const seen = ["src/a.ts", ".skills/r/plan.md", ".env", "node_modules/m/i.js", ".git/config", "keys/id_rsa"].map((f) => existsSync(join(c.dir, f)));
const before = changesIn(c).length; mkdirSync(join(c.dir, "node_modules/.deno"), { recursive: true }); writeFileSync(join(c.dir, "node_modules/.deno/lock"), "x"); writeFileSync(join(c.dir, "src/a.ts"), "changed"); const after = changesIn(c);
removeCopy(c); console.log(JSON.stringify({ seen, before, after, gone: !existsSync(c.dir) }));`;
  const out = ((): string => { try { return String(execFileSync("node", ["--input-type=module", "-e", probe], { stdio: "pipe" })); } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } })();
  rmSync(src, { recursive: true, force: true });
  const r = ((): { seen: boolean[]; before: number; after: string[]; gone: boolean } | undefined => { try { return JSON.parse(out); } catch { return undefined; } })();
  return r !== undefined && JSON.stringify(r.seen) === JSON.stringify([true, true, false, false, false, false]) && r.before === 0
    && r.after.length === 1 && r.after[0] === "src/a.ts" && r.gone
    ? ok("sandbox copy holds committable + brief-named files only (no .git/.env/keys/node_modules), sees a source write but not an experiment's node_modules, and is removed (the check can fail)")
    : fail(`sandbox copy probe: ${out.trim().slice(0, 300)}`);
};

// The engine layer's pure logic is probed by two .mjs scripts under fixtures/:
// the descriptor schema (a valid descriptor passes, ten defects are named,
// every shipped skills/*/sequence.json loads) and the whole-variant solver
// (backtracking, lineage/session constraints, policy, roster fan-out).
const checkEngineProbes = (root: string): Result =>
  merge(...(["descriptor-probe.mjs", "solver-probe.mjs", "patch-probe.mjs"] as const).map((probe) => {
    const file = join(root, "scripts/fixtures", probe);
    try {
      const out = String(execFileSync("node", [file], { stdio: "pipe" })).trim();
      return ok(`${out} (the check can fail)`);
    } catch (e) {
      return fail(`${probe}: ${String((e as { stderr?: Buffer }).stderr ?? "").trim() || "exited non-zero"}`);
    }
  }));

// The broker's host-seat path: a seat the moderator runs itself is ledgered with
// status "host" (never "failed"), with its output when --result is passed.
const checkBrokerHostSeat = (root: string, skillsDir: string): Result => {
  const broker = join(skillsDir, "protocols/scripts/broker.ts");
  const dir = mkdtempSync(join(tmpdir(), "supermodo-broker-"));
  const project = join(dir, "project");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(dir, "registry.json"), JSON.stringify({
    registryVersion: 1,
    models: {
      astra: { lineage: "openai", transport: "adapter", adapter: "codex", pin: "gpt-6-astra" },
      opus5: { lineage: "anthropic", transport: "adapter", adapter: "claude", pin: "claude-opus-5" },
    },
    jobs: { lead: [{ model: "astra", effort: "xhigh" }, { model: "host" }], adversary: [{ model: "astra", effort: "xhigh" }, { model: "opus5", effort: "medium" }] },
    projects: {}, decisions: {},
  }));
  writeFileSync(join(dir, "out.md"), "the host seat's plan\n");
  const env = { ...process.env, SUPERMODO_REGISTRY_DIR: dir };
  const run = (args: readonly string[]): Record<string, unknown> | undefined => {
    try { return JSON.parse(String(execFileSync("node", [broker, ...args], { stdio: "pipe", env, cwd: root }))) as Record<string, unknown>; } catch { return undefined; }
  };
  const plan = run(["plan", "--skill", "grill", "--project-root", project, "--host", "claude", "--host-pin", "claude-fable-5-1", "--run", "probe", "--skills-dir", skillsDir]);
  const planFile = plan?.planFile as string | undefined;
  const withResult = planFile ? run(["dispatch", "--plan", planFile, "--seat", "plan-b", "--brief", join(dir, "out.md"), "--result", join(dir, "out.md")]) : undefined;
  const without = planFile ? run(["dispatch", "--plan", planFile, "--seat", "plan-b", "--brief", join(dir, "out.md")]) : undefined;
  writeFileSync(join(dir, "empty.md"), "  \n");
  const empty = planFile ? run(["dispatch", "--plan", planFile, "--seat", "plan-b", "--brief", join(dir, "empty.md")]) : undefined;
  rmSync(dir, { recursive: true, force: true });
  return merge(
    plan?.staffed === true && (plan?.seats as { id: string; model: string }[]).some((s) => s.id === "plan-b" && s.model === "host") && typeof plan?.roundsDir === "string"
      ? ok("broker plan seats the host row and returns roundsDir (the check can fail)")
      : fail(`broker plan did not seat the host row: ${JSON.stringify(plan ?? "no output").slice(0, 300)}`),
    withResult?.status === "host" && withResult?.effectiveModel === "claude-fable-5-1" && withResult?.text === "the host seat's plan\n"
      ? ok("broker dispatch --result ledgers a host seat as status host with its output and pin (the check can fail)")
      : fail(`broker dispatch --result on a host seat: ${JSON.stringify(withResult ?? "no output").slice(0, 300)}`),
    without?.status === "host" && String(without?.cause ?? "").includes("--result")
      ? ok("broker dispatch on a host seat without --result is status host and names the flag (the check can fail)")
      : fail(`broker dispatch on a host seat without --result: ${JSON.stringify(without ?? "no output").slice(0, 300)}`),
    empty === undefined
      ? ok("broker dispatch refuses an empty brief (the check can fail)")
      : fail(`broker dispatch ran a seat on an empty brief: ${JSON.stringify(empty).slice(0, 200)}`),
  );
};

// A provider out of capacity (503 / high demand) is retried after a backoff;
// a usage-limit failure is not. Probed with a fake agy on PATH: 503, 503, then
// success → ok after three calls; "usage limit" → failed after one call.
const checkCapacityRetry = (root: string, skillsDir: string): Result => {
  const broker = join(skillsDir, "protocols/scripts/broker.ts");
  const dir = mkdtempSync(join(tmpdir(), "supermodo-capacity-"));
  const project = join(dir, "project"), bin = join(dir, "bin");
  mkdirSync(project, { recursive: true }); mkdirSync(bin, { recursive: true });
  writeFileSync(join(project, "a.ts"), "export const a = 1;\n");
  writeFileSync(join(dir, "registry.json"), JSON.stringify({
    registryVersion: 1,
    models: { flash: { lineage: "google", transport: "adapter", adapter: "agy", pin: "gemini-probe", sandbox: "network-open" } },
    jobs: { "leg-work": [{ model: "flash" }, { model: "host" }], adversary: [{ model: "flash" }, { model: "host" }] },
    projects: {}, decisions: {},
  }));
  // Fake agy: FAKE_MODE=capacity answers 503 until its third call; FAKE_MODE=quota always fails on a usage limit.
  writeFileSync(join(bin, "agy"), `#!/bin/sh
cat > /dev/null
n=$(( $(cat "${dir}/count" 2>/dev/null || echo 0) + 1 )); echo $n > "${dir}/count"
if [ "$FAKE_MODE" = quota ]; then echo '{"status":"ERROR","error":"You have hit your usage limit"}'; exit 0; fi
if [ $n -lt 3 ]; then echo '{"status":"ERROR","error":"Error 503, Message: This model is currently experiencing high demand"}'; exit 0; fi
echo '{"status":"SUCCESS","response":"reviewed"}'
`, { mode: 0o755 });
  writeFileSync(join(dir, "brief.md"), "review a.ts\n");
  const env = (mode: string) => ({ ...process.env, SUPERMODO_REGISTRY_DIR: dir, SUPERMODO_CAPACITY_BACKOFF_MS: "0,0,0", FAKE_MODE: mode, PATH: `${bin}:${process.env.PATH}` });
  const run = (args: readonly string[], mode: string): Record<string, unknown> | undefined => {
    try { return JSON.parse(String(execFileSync("node", [broker, ...args], { stdio: "pipe", env: env(mode), cwd: root }))) as Record<string, unknown>; } catch { return undefined; }
  };
  const plan = run(["plan", "--skill", "hunt", "--project-root", project, "--host", "claude", "--host-pin", "claude-probe", "--run", "cap", "--skills-dir", skillsDir], "capacity");
  const planFile = plan?.planFile as string | undefined;
  const calls = (): number => Number(existsSync(join(dir, "count")) ? readFileSync(join(dir, "count"), "utf8").trim() : 0);
  const capacity = planFile ? run(["dispatch", "--plan", planFile, "--seat", "find-x", "--brief", join(dir, "brief.md")], "capacity") : undefined;
  const capacityCalls = calls();
  rmSync(join(dir, "count"), { force: true });
  const quota = planFile ? run(["dispatch", "--plan", planFile, "--seat", "find-x", "--brief", join(dir, "brief.md")], "quota") : undefined;
  const quotaCalls = calls();
  rmSync(dir, { recursive: true, force: true });
  return merge(
    capacity?.status === "ok" && capacityCalls === 3
      ? ok("broker retries a provider out of capacity (503 / high demand) after a backoff (the check can fail)")
      : fail(`capacity retry: status ${String(capacity?.status)} after ${capacityCalls} call(s): ${JSON.stringify(capacity ?? plan ?? "no output").slice(0, 300)}`),
    quota?.status === "failed" && quotaCalls === 1
      ? ok("broker fails a usage-limit error at once, without retrying (the check can fail)")
      : fail(`usage-limit: status ${String(quota?.status)} after ${quotaCalls} call(s)`),
  );
};

// Triager pilot: agreement joins the triager's materiality answers with the
// user's later dispositions; uncertain answers are counted but not scored.
const checkTriageAgreement = (skillsDir: string): Result => {
  const script = join(skillsDir, "protocols/scripts/broker.ts");
  const probe = `import { triageAgreement } from ${JSON.stringify(script)};
console.log(JSON.stringify(triageAgreement([
  { role: "triager", answers: { "materiality:H1": { choice: "material" }, "materiality:H2": { choice: "nit" }, "materiality:H3": { choice: "uncertain" }, "materiality:H4": { choice: "material" } } },
  { event: "disposition", finding: "H1", decision: "promoted" }, { event: "disposition", finding: "H2", decision: "promoted" },
  { event: "disposition", finding: "H3", decision: "dismissed" }, { event: "disposition", finding: "H9", decision: "dismissed" },
])));`;
  const out = ((): string => { try { return String(execFileSync("node", ["--input-type=module", "-e", probe], { stdio: "pipe" })); } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? e); } })();
  const r = ((): Record<string, unknown> | undefined => { try { return JSON.parse(out.trim().split("\n").pop() ?? ""); } catch { return undefined; } })();
  return r?.pairs === 2 && r?.agree === 1 && r?.disagree === 1 && r?.uncertain === 1 && r?.rate === 0.5
    ? ok("triage-agreement joins triager answers with user dispositions, uncertain unscored (the check can fail)")
    : fail(`triage-agreement probe: ${out.trim().slice(0, 300)}`);
};

// roster-migrate: scan must find exactly the two legacy role files in the
// fixture (not the user's own agent, not the already-migrated role) and apply
// must leave them with `job:` and no engine key, body untouched.
const checkRosterMigrate = (root: string, skillsDir: string): Result => {
  const script = join(skillsDir, "config/scripts/roster-migrate.ts");
  const src = join(root, "scripts/fixtures/roster-migrate");
  const tmp = mkdtempSync(join(tmpdir(), "supermodo-migrate-"));
  cpSync(src, tmp, { recursive: true });
  try {
    const scan = JSON.parse(String(execFileSync("node", [script, "scan", tmp, "agents"], { stdio: "pipe" }))) as { rows: { file: string; job: string; engineKeys: string[] }[] };
    const files = scan.rows.map((r) => r.file).sort();
    const table = join(tmp, "table.json");
    writeFileSync(table, JSON.stringify(scan));
    execFileSync("node", [script, "apply", tmp, table], { stdio: "pipe" });
    const after = readFileSync(join(tmp, "agents/api-reviewer.md"), "utf8");
    const untouched = readFileSync(join(tmp, "agents/notes.md"), "utf8") === readFileSync(join(src, "agents/notes.md"), "utf8");
    const roster = ((): boolean => { try { execFileSync("node", [join(skillsDir, "config/scripts/roster-check.ts"), tmp, "agents"], { stdio: "pipe" }); return true; } catch { return false; } })();
    return merge(
      files.join(",") === "agents/api-reviewer.md,agents/pipeline-engineer.md" && scan.rows.every((r) => r.engineKeys.length > 0)
        ? ok("roster-migrate scan finds exactly the legacy role files (the check can fail)")
        : fail(`roster-migrate scan returned ${files.join(",")}`),
      /^---\n[\s\S]*job: adversary\n---\n/.test(after) && !/^(model|effort):/m.test(after) && after.includes("Check every changed handler")
        ? ok("roster-migrate apply adds job:, removes engine keys, keeps the body (the check can fail)")
        : fail("roster-migrate apply produced an unexpected file"),
      untouched ? ok("roster-migrate leaves non-role agents untouched") : fail("roster-migrate touched a non-role agent"),
      roster ? ok("migrated roster passes roster-check") : fail("migrated roster fails roster-check"),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

const checkMultimodelFixture = (root: string, script: string): Result => {
  const fixture = join(root, "scripts/fixtures/config-multimodel-invalid.json");
  const stderr = ((): string => {
    try {
      execFileSync("node", [script, fixture], { stdio: "pipe" });
      return "";
    } catch (e) {
      return String((e as { stderr?: Buffer }).stderr ?? "");
    }
  })();
  if (stderr === "") return fail("config-check ACCEPTED scripts/fixtures/config-multimodel-invalid.json (should fail)");
  const missing = MULTIMODEL_EXPECTED.filter((needle) => !stderr.includes(needle));
  return missing.length === 0
    ? ok(`config-check names every multimodel policy defect (${MULTIMODEL_EXPECTED.length} rules; the check can fail)`)
    : fail(`config-check did not report: ${missing.join(" | ")}`);
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

// A probe speaks in two registers. A PASSING value is lower-case prose or
// data — `clean`, `blocked`, `1.1.0`, `git tag v1.0.1` — and a FAILING value
// shouts (`MISSED`, `LEAKED`, `BARE`, `BLOCKED:<reason>`) or is a bare `no`.
// An expectation table may only ever hold the first kind. The mistake this
// guards against is routine, not hostile: regress a behaviour, watch the probe
// print MISSED, and "fix the test" by pasting the new output into the table —
// the build is green again and the regression is now the documented
// behaviour. So a table is validated BEFORE its probe is compared, and a
// shouting row fails the build naming itself.
const FAILURE_SENTINEL = /^(?:[A-Z][A-Z_-]+(?::.*)?|no)$/;
const sentinelRows = (table: readonly string[]): readonly string[] =>
  table.filter((e) => FAILURE_SENTINEL.test(e.slice(e.indexOf("=") + 1)));
const bakedSentinels = (name: string, table: readonly string[]): Result => {
  const baked = sentinelRows(table);
  return baked.length === 0
    ? merge()
    : fail(`${name} carries a failure sentinel as an expectation: ${baked.join(", ")} — the table asserts a regression as the documented behaviour (a row reading MISSED, LEAKED, BLOCKED:… or no is never a pass)`);
};

// The guard's own negative control: every register it must refuse, next to
// every register it must let through.
const checkSentinelGuard = (): Result =>
  sentinelRows(["a=MISSED", "b=BLOCKED:reason", "c=no", "d=SELF-MERGE", "e=BLOCKED", "f=clean", "g=none", "h=1.2.3.5", "i=git tag v1.0.1", "j=v1.2.3-rc.1"]).join(",")
    === "a=MISSED,b=BLOCKED:reason,c=no,d=SELF-MERGE,e=BLOCKED"
    ? ok("an expectation table cannot carry a failure sentinel (the check can fail)")
    : fail("the failure-sentinel guard does not recognise the probe's vocabulary — a regression could be pasted into EXPECTED_RELEASE_STATE as the documented behaviour");

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

// The release preflight's whole job is to know the state BEFORE anything is
// pushed, and every way it can be wrong is silent: a version file it cannot
// parse reads as "no version", a tag outside HEAD's ancestry reads as "not
// released yet", and a stale checkout reads as clean. None of those surface
// until a version has already been published twice or rolled backwards. The
// probe builds throwaway repositories in exactly those states.
const EXPECTED_RELEASE_STATE: readonly string[] = [
  // a JSONC version file is readable
  "jsonc-version=1.0.0",
  "jsonc-suggested=1.1.0",
  "jsonc-strict-fails=yes",
  "jsonc-string-intact=yes",
  "jsonc-trailing-comma=yes",
  // state comes from every branch and tag, not from HEAD's ancestry
  "cross-branch-tag=v1.0.1",
  "cross-branch-highest=1.0.1",
  "stale-checkout=blocked",
  "behind-main=blocked",
  "stale-repair=offered",
  "no-steps-when-blocked=yes",
  // a squash release bounds the unreleased range at the back-merge
  "backmerge-range=1",
  "backmerge-bump=patch",
  "backmerge-version=1.1.1",
  // git commands are rendered from this project's real names...
  "plan-clean=ready",
  "plan-add=git add package.json CHANGELOG.md",
  "plan-tag=yes",
  "plan-one-tag=yes",
  "plan-backmerge=yes",
  "plan-gh=clean",
  "plan-quoted=yes",
  "plan-order=bump-commit>integrate>tag>push>extract-notes>publish-release>back-merge",
  // ...and nothing of the default spelling survives a renaming project
  "renamed-clean=ready",
  "renamed-merge=yes",
  "renamed-no-squash=clean",
  "renamed-tag=yes",
  "renamed-no-gh=clean",
  "renamed-no-default-branch=clean",
  // a hotfix rejoins the open stabilization branch, never picking between two
  "hotfix-rejoin=yes",
  "hotfix-patch=1.0.1",
  "hotfix-many-asks=asks",
  "hotfix-many-no-pick=clean",
  // the fetch is why any of it is trustworthy; offline DEGRADES to a warning
  "fetch-ran=ok",
  "fetch-catches-stale=caught",
  "fetch-repair=offered",
  "offline-degrades=failed",
  "offline-warns=yes",
  "offline-not-blocked=clean",
  "offline-repair=offered",
  // a rules file IS the sequence; the inference it replaces does not run
  "rule-detected=yes",
  "rule-template=light",
  "rule-no-default-order=withheld",
  "rule-steps-rendered=yes",
  "rule-skips-inference=skipped",
  "rule-steps-scoped=await-approval,back-merge,bump-commit,cut-hotfix,cut-stabilization,extract-notes,integrate,open-request,publish-release,push,push-branch,push-tag,sync-main,tag",
  // without one, the process is proposed with the evidence behind each guess
  "norule-infers=proposed",
  "norule-strategy=squash",
  "norule-evidenced=yes",
  // the skill renders git and REFUSES to invent a forge's commands
  "only-git-rendered=yes",
  "no-forge-cli=clean",
  "publish-is-yours=yes",
  "publish-no-commands=none",
  "request-steps-are-yours=await-approval,open-request,publish-release",
  "no-suicidal-delete=absent",
  "notes-rendered=yes",
  // removed config keys are migrated, never ignored
  "migration-count=2",
  "migration-names-rules=yes",
  "migration-mode-inert=light",
  // CI and remotes are OBSERVED for the user to read, never classified
  "ci-detected=yes",
  "ci-owns-versioning=flagged",
  "ci-observed-not-classified=observation",
  "ci-remote-verbatim=verbatim",
  // the shape comes from the rules file, not from a config key
  "shape-from-rule=full",
  "shape-offers-cut=yes",
  // version files are not all JSON; a section path beats the first match
  "toml-version=1.0.0",
  "toml-says-how=by-section",
  "toml-no-false-warning=clean",
  "bare-version-file=2.5.0",
  "bare-warns-shape=yes",
  // a scheme with no arithmetic is read, reported, and never invented
  "calver-readable=2026.08.1",
  "calver-no-guess=abstains",
  "calver-not-blocked=usable",
  "calver-says-skipped=yes",
  // a dependency's version is not the package's; one heading, one entry
  "toml-section-wins=3.1.0",
  "duplicate-entry-warned=yes",
  "duplicate-buildmeta-warned=yes",

  // prereleases parse, order, and get no invented successor
  "prerelease-tag-seen=v1.2.3-rc.1",
  "prerelease-no-guess=abstains",
  "prerelease-explains=yes",
  // one branch is a process too
  "trunk-ready=ready",
  "trunk-order=bump-commit>tag>push>extract-notes>publish-release",
  "trunk-no-self-merge=clean",
  // a tag carrying a version the prefix does not recognise is a HALT
  "foreign-tags-blocked=blocked",
  "foreign-tags-named=yes",
  "scoped-prefix-works=pkg-a@1.0.0",
  // the first release is the declared version; CI owning versioning halts
  "first-release-version=0.1.0",
  "first-release-explains=yes",
  "ci-owned-blocks=blocked",
  "ci-owned-no-steps=none",
  // a shallow clone cannot answer any of this
  "shallow-blocked=blocked",
  "shallow-repair=offered",
  // hostile config values: exponential regex, symlink escape
  "redos-rejected=rejected",
  "redos-nested-group-rejected=rejected",
  "redos-alternation-rejected=rejected",
  "redos-issuekey-rejected=rejected",
  "redos-benign-accepted=valid",
  "redos-preflight-refuses=blocked",
  "redos-runtime-bounded=blocked",

  "symlink-escape-blocked=blocked",
  // a mid-cycle main->dev sync is NOT a release boundary
  "midcycle-sync-not-boundary=1.1.0",
  "midcycle-warns-widened=yes",
  "real-backmerge-bounds=1",
  "real-backmerge-bump=patch",
  // a path is not a shell token
  "spaced-path-quoted=quoted",
  "spaced-path-never-bare=clean",
  "plain-path-unquoted=readable",
  // a tag whose name and contents disagree is not authoritative
  "wrong-tag-blocked=blocked",
  "wrong-tag-no-steps=none",
  // tags live in one namespace: every remote is fetched
  "upstream-tag-seen=2.0.0",
  "upstream-blocks-rollback=blocked",
  "multi-remote-warned=yes",
  // clean porcelain is not 'no operation in progress'
  "merge-in-progress-blocked=blocked",
  "merge-in-progress-no-steps=none",
  // a stabilization branch that exists only on the remote counts
  "remote-only-stabilization=rejoined",
  // line endings must not decide the workflow
  "crlf-rules-template=full",
  "crlf-rules-shape=full",
  "lf-rules-unchanged=full",
  // a prefix can prefix a DIFFERENT convention
  "prefix-overlap-blocked=blocked",
  "calver-tags-not-foreign=clean",
  // declining to guess must not leave the project with no plan
  "fourpart-no-steps-alone=none",
  "fourpart-version-supplied=1.2.3.5",
  "fourpart-steps-rendered=yes",
  "fourpart-rollback-blocked=blocked",

  // a supplied version is still a validated version
  "chosen-rollback-blocked=blocked",
  "chosen-duplicate-blocked=blocked",
  "chosen-forward-ok=ready",
  "chosen-short-rollback-blocked=blocked",
  "chosen-short-no-tag=clean",
  "chosen-unorderable-blocked=blocked",

  // the version is data, never a pattern
  "buildmeta-not-a-regex=string-compare",
  "buildmeta-heading-literal=literal",
  // tag style is the project's
  "tag-default-lightweight=git tag v1.0.1",
  "tag-annotated=git tag -a v1.0.1 -m 'release: v1.0.1'",
  "tag-signed=git tag -s v1.0.1 -m 'release: v1.0.1'",
  // a ref is not a shell token
  "injectable-ref-blocked=blocked",
  "injectable-ref-never-rendered=clean",
  "injectable-repair-quoted=clean",
  // facts and commands must describe ONE repository
  "missing-remote-blocked=blocked",
  "worktree-branch-blocked=blocked",
  "tag-changelog-mismatch=blocked",
  "signed-policy-baseline=reported",  // controls for what was only ever asserted (probe section 27)
  "cherry-pick-in-progress-blocked=blocked",
  "revert-in-progress-blocked=blocked",
  "bisect-in-progress-blocked=blocked",
  "rebase-in-progress-blocked=blocked",
  "am-in-progress-blocked=blocked",
  "sequencer-in-progress-blocked=blocked",
  "inherited-gitdir-blocked=blocked",
  "remote-tracking-version-seen=3.0.0",
  "remote-tracking-rollback-blocked=blocked",
  "nofetch-flag-inert=ok",
  "bom-rules-template=full",
  "prerelease-numeric-order=1.0.0-beta.11",
  "prerelease-below-release=1.0.0",
  "gradle-version=4.2.0",
  "python-dunder-version=5.0.1",
  "jsonc-config-read=rel-1.0.0",
  "no-trailing-comment=clean",

];

const checkReleaseState = (root: string): Result => {
  const baked = bakedSentinels("EXPECTED_RELEASE_STATE", EXPECTED_RELEASE_STATE);
  if (baked.fails.length > 0) return baked;

  const probe = join(root, "scripts/fixtures/release-state-probe.mjs");
  if (!existsSync(probe)) return fail("scripts/fixtures/release-state-probe.mjs is missing — the release preflight has no proof it reads state from git");
  const out = ((): readonly string[] => {
    try {
      return execFileSync("node", [probe], { encoding: "utf8" }).trim().split("\n");
    } catch { return []; }
  })();
  const wrong = EXPECTED_RELEASE_STATE.filter((e) => !out.includes(e));
  return wrong.length === 0 && out.length === EXPECTED_RELEASE_STATE.length
    ? ok("the release preflight reads version state from git and builds its sequence from config (the check can fail)")
    : fail(`release preflight disagrees with the documented behavior: expected ${wrong.join(", ") || "(count mismatch)"} — got ${out.join(", ") || "(no output)"}`);
};

// Executable release COMMANDS have one home: release-check.ts renders them
// with the project's real branch names, remote, version and tag substituted.
// (Their ORDER has a different home — the project's rules file.) A copy in
// SKILL.md is a copy that can do neither: it teaches `main` and `dev` to a
// project that renamed them, and drifts from the renderer the moment either
// changes.
const SEQUENCE_MARKERS: readonly string[] = ["git merge --squash", "git tag ", "git push origin"];

// A dispatch brief that names an output schema must name one that ships and is
// strict (every property required, no extra keys): a missing file made every
// run improvise its own shape, so verdicts stopped being comparable.
const strictSchema = (s: unknown): boolean => {
  const o = s as { type?: unknown; properties?: Record<string, unknown>; required?: readonly string[]; additionalProperties?: unknown; items?: unknown };
  const props = o.properties ?? {};
  const selfOk = o.type !== "object" ||
    (o.additionalProperties === false && Object.keys(props).every((k) => (o.required ?? []).includes(k)));
  return selfOk && Object.values(props).every(strictSchema) && (o.items === undefined || strictSchema(o.items));
};

const checkSchemaRefs = (skillsDir: string, found: readonly string[]): Result => {
  const refs = [...new Set(found.flatMap((slug) => mdFilesOf(skillsDir, slug)
    .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/protocols\/schemas\/([a-z0-9-]+\.schema\.json)/g)].map((m) => m[1]))))];
  const bad = refs.flatMap((name) => {
    const f = join(skillsDir, "protocols/schemas", name);
    if (!existsSync(f)) return [`${name}: referenced but missing`];
    try { return strictSchema(JSON.parse(readFileSync(f, "utf8"))) ? [] : [`${name}: not strict (every property required, additionalProperties false)`]; }
    catch { return [`${name}: invalid JSON`]; }
  });
  return bad.length === 0 ? ok(`output schemas: ${refs.length} referenced, all shipped and strict`) : fail(`output schemas: ${bad.join("; ")}`);
};

// A rules template selects a descriptor variant and refers to seats by node
// id, never restating the graph (models.md → Sequence descriptors). So every
// template of a skill with a sequence.json names an existing variant, and any
// node id it quotes exists in that variant.
const checkTemplateVariants = (skillsDir: string, found: readonly string[]): Result => {
  const bad = found.flatMap((skill) => {
    const seq = join(skillsDir, skill, "sequence.json"), dir = join(skillsDir, skill, "rules-templates");
    if (!existsSync(seq) || !existsSync(dir)) return [];
    const variants = (JSON.parse(readFileSync(seq, "utf8")) as { variants: Record<string, { nodes: { id: string }[] }> }).variants;
    const allIds = new Set(Object.values(variants).flatMap((v) => v.nodes.map((n) => n.id)));
    return readdirSync(dir).filter((f) => f.endsWith(".md")).flatMap((f) => {
      const text = readFileSync(join(dir, f), "utf8");
      const variant = /^template:\s*(\S+)/m.exec(text)?.[1] ?? f.replace(/\.md$/, "");
      if (variants[variant] === undefined) return [`${skill}/rules-templates/${f}: variant "${variant}" is not in sequence.json (${Object.keys(variants).join(", ")})`];
      const ids = new Set(variants[variant].nodes.map((n) => n.id));
      const stale = [...text.matchAll(/`([a-z][a-z0-9-]*)`/g)].map((m) => m[1]).filter((id) => allIds.has(id) && !ids.has(id));
      return stale.length ? [`${skill}/rules-templates/${f}: quotes node id(s) ${[...new Set(stale)].join(", ")} not in variant "${variant}"`] : [];
    });
  });
  return bad.length === 0 ? ok("rules templates select an existing descriptor variant and quote only its node ids (the check can fail)") : fail(bad.join("; "));
};

// Every role a descriptor seats ships its brief as skills/<skill>/roles/<role>.md
// (used unless a project roster file with `job:` overrides it). Judgment roles
// live in protocols/references/judgment-roles.md; `roster:*` roles are the
// project's own files.
const JUDGMENT_ROLES = new Set(["router", "ranker", "matcher", "sentinel", "triager"]);
const checkRoleBriefs = (skillsDir: string, found: readonly string[]): Result => {
  const missing = found.flatMap((skill) => {
    const seq = join(skillsDir, skill, "sequence.json");
    if (!existsSync(seq)) return [];
    const roles = new Set(Object.values((JSON.parse(readFileSync(seq, "utf8")) as { variants: Record<string, { nodes: { role: string }[] }> }).variants)
      .flatMap((v) => v.nodes.map((n) => n.role)).filter((r) => !JUDGMENT_ROLES.has(r) && !r.startsWith("roster:")));
    return [...roles].filter((r) => !existsSync(join(skillsDir, skill, "roles", `${r}.md`))).map((r) => `${skill}/roles/${r}.md`);
  });
  return missing.length === 0 ? ok("every descriptor role ships its brief in roles/<role>.md (the check can fail)") : fail(`missing role briefs: ${missing.join(", ")}`);
};

const checkSequenceSingleSource = (skillsDir: string): Result => {
  const f = join(skillsDir, "release/SKILL.md");
  if (!existsSync(f)) return fail("skills/release/SKILL.md is missing");
  const text = readFileSync(f, "utf8");
  const found = SEQUENCE_MARKERS.filter((m) => text.includes(m));
  return found.length === 0
    ? ok("release commands live only in release-check.ts; their order lives in the rules file (the check can fail)")
    : fail(`release/SKILL.md re-embeds release commands (${found.join(", ")}) — it cannot substitute the project's names and will drift from release-check.ts`);
};

// The guide may name a forge CLI only as the thing it must never emit, never
// as an instruction. `gh release list` "before you say anything about state"
// ordered a GitHub-only command on every preflight, in a skill whose whole
// argument is that the set of forges is not enumerable.
const FORGE_CLI_MARKERS: readonly string[] = ["gh release", "glab release", "`gh `", "`glab `", "`bb `", "`tea `", "`hub `"];

const checkNoForgeCliInGuide = (root: string, skillsDir: string): Result =>
  merge(...([["skills/release/SKILL.md", join(skillsDir, "release/SKILL.md")], ["docs/release.md", join(root, "docs/release.md")]] as const).map(([label, f]) => {
    if (!existsSync(f)) return fail(`${label} is missing`);
    const text = readFileSync(f, "utf8");
    const found = FORGE_CLI_MARKERS.filter((m) => text.includes(m));
    return found.length === 0
      ? ok(`${label} instructs no forge CLI (the check can fail)`)
      : fail(`${label} names a forge CLI (${found.join(", ")}) — publishing is the project's own step; the guide must not order a command the rules file did not name`);
  }));

// The JSONC reader blanks comments and trailing commas to SPACES so that
// every byte offset and line number survives the strip: a parse error still
// names the position it occupies in the file the user is looking at. The
// property held by construction and was pinned by nothing.
const checkJsoncPositions = (): Result => {
  const src = '{\n  "a": 1, // one\n  /* two\n     lines */ "b": [1, 2,],\n  "c": "https://x//y", \n}\n';
  const out = stripJsonc(src);
  const newlines = (s: string): string => [...s].flatMap((ch, i) => (ch === "\n" ? [i] : [])).join(",");
  const parsed = ((): { readonly a?: number; readonly b?: readonly number[]; readonly c?: string } | undefined => {
    try { return JSON.parse(out) as { readonly a?: number; readonly b?: readonly number[]; readonly c?: string }; } catch { return undefined; }
  })();
  return out.length === src.length && newlines(out) === newlines(src)
    && parsed?.a === 1 && parsed?.b?.length === 2 && parsed?.c === "https://x//y"
    ? ok("the JSONC reader keeps every offset and newline in place (the check can fail)")
    : fail("the JSONC reader moves text while stripping — a parse error would name a position in a string the user never sees");
};

// A skill's default process has ONE home, its rules template: that is what a
// project materialises and later diffs against. A second copy of the steps in
// SKILL.md is the copy that drifts, and the model reads the prose first.
const checkNoTemplateCopy = (skillsDir: string, found: readonly string[]): Result =>
  merge(...found.flatMap((slug): readonly Result[] => {
    const dir = join(skillsDir, slug, "rules-templates");
    if (!existsSync(dir) || !existsSync(join(skillsDir, slug, "SKILL.md"))) return [];
    const skill = readFileSync(join(skillsDir, slug, "SKILL.md"), "utf8");
    const steps = readdirSync(dir).filter((f) => f.endsWith(".md")).flatMap((f) =>
      readFileSync(join(dir, f), "utf8").split("\n").flatMap((l) => {
        const m = l.match(/^\d+\.\s+(.{20,})$/);
        return m === null ? [] : [m[1].trim()];
      }));
    const copied = steps.filter((s) => skill.includes(s));
    return [copied.length < 2
      ? ok(`skills/${slug}/SKILL.md carries no copy of its template's steps (the check can fail)`)
      : fail(`skills/${slug}/SKILL.md repeats ${copied.length} step(s) of its rules template verbatim (e.g. ${JSON.stringify(copied[0].slice(0, 60))}) — the process has one home, the template; SKILL.md holds capabilities and invariants`)];
  }));

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
    checkRosterFixtures(root, skillsDir),
    checkRegistryCli(root, skillsDir),
    checkRosterMigrate(root, skillsDir),
    checkEngineProbes(root),
    checkBrokerHostSeat(root, skillsDir),
    checkGrammarFixtures(root, skillsDir),
    checkDocsTree(root, skillsDir),
    checkRenamedGrammar(root, skillsDir),
    checkGenerateGrammar(root, skillsDir),
    checkBumpGrammar(root),
    checkSentinelGuard(),
    checkReleaseState(root),

    checkSequenceSingleSource(skillsDir),
    checkSchemaRefs(skillsDir, found),
    checkSandboxCopy(skillsDir),
    checkTemplateVariants(skillsDir, found),
    checkRoleBriefs(skillsDir, found),
    checkTriageAgreement(skillsDir),
    checkCapacityRetry(root, skillsDir),
    checkNoForgeCliInGuide(root, skillsDir),
    checkJsoncPositions(),
    checkNoTemplateCopy(skillsDir, found),


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
