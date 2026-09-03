// supermodo docs-check — zero-dependency structure + link + task-ID checker
// for the supermodo docs convention (v1).
// Usage: node docs-check.ts [project-root] [docs-entry] [conventions]
//   (Node ≥ 22.18)
//   docs-entry:  root-relative router path (default "docs/README.md" —
//                pass the config's docs.entry when it differs).
//   conventions: root-relative conventions path (default: CONVENTIONS.md
//                beside the router — pass docs.conventions when set).
// Exit 0 = clean; exit 1 = issues (one per line on stdout, prefixed by class).

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename, resolve, sep, posix } from "node:path";
import { buildGrammar, esc } from "../../config/scripts/grammar-load.ts";

type Issue = { readonly cls: string; readonly msg: string };

const issue = (cls: string, msg: string): Issue => ({ cls, msg });
const relTo = (root: string) => (p: string): string =>
  p.slice(root.length + 1).split(sep).join("/");

const G = process.argv[2] === "--item"
  ? buildGrammar(process.argv[3] ?? ".", true)
  : buildGrammar(process.argv[2] ?? ".", false);

const walkMd = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      return e.name === G.archive || e.name.startsWith(".") ? [] : walkMd(p);
    }
    return e.name.endsWith(".md") ? [p] : [];
  });

const checkStructure = (docs: string, entryName: string, conventions: string): readonly Issue[] => [
  ...[entryName, G.backlog]
    .filter((req) => !existsSync(join(docs, req)))
    .map((req) => issue("structure", `<docs>/${req} missing`)),
  ...(existsSync(conventions)
    ? []
    : [issue("structure", `conventions file missing (${basename(conventions)} — configured via docs.conventions)`)]),
  ...[G.work, G.decisions, G.reference, G.archive]
    .filter((dir) => !existsSync(join(docs, dir)))
    .map((dir) => issue("structure", `<docs>/${dir}/ missing`)),
];

const checkSize = (f: string, r: string): readonly Issue[] => {
  const kb = statSync(f).size / 1024;
  return kb > G.splitKb
    ? [issue("size", `${r} is ${kb.toFixed(0)} KB (>${G.splitKb} KB) — split at responsibility boundaries`)]
    : [];
};

// Inline links: [t](path), [t](<path with spaces>); reference defs: [label]: path
const LINK_RE = /\[[^\]]*\]\((?:<([^>]+)>|([^)#\s]+))(?:#[^)]*)?\)/g;
const REFDEF_RE = /^\[[^\]]+\]:\s+(?:<([^>]+)>|(\S+))(?:\s+["'(].*)?\s*$/gm;

const isLocal = (target: string): boolean =>
  !/^[a-z][a-z0-9+.-]*:/i.test(target); // excludes http(s):, mailto:, etc.

const checkLinks = (f: string, r: string, text: string): readonly Issue[] =>
  [...text.matchAll(LINK_RE), ...text.matchAll(REFDEF_RE)]
    .map((m) => (m[1] ?? m[2]).replace(/#.*$/, ""))
    .filter((target) => target.length > 0 && isLocal(target))
    .filter((target) => !existsSync(resolve(dirname(f), decodeURI(target))))
    .map((target) => issue("link", `${r}: broken link → ${target}`));

const checkTaskIds = (r: string, text: string): readonly Issue[] => {
  if (!r.endsWith(`/${G.tasks}`)) return [];
  const checklistLines = text
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => G.checklistRe.test(line));
  const ids = checklistLines.map(({ line, n }) => ({
    n,
    id: line.match(G.taskMarkerRe)?.[1],
  }));
  const missing = ids
    .filter(({ id }) => id === undefined)
    .map(({ n }) => issue("task-id", `${r}:${n}: checklist line missing <!-- ${G.taskPrefix}:<slug> --> ID`));
  const dupes = ids
    .filter(({ id }, i) => id !== undefined && ids.findIndex((o) => o.id === id) < i)
    .map(({ n, id }) => issue("task-id", `${r}:${n}: duplicate task ID "${id}"`));
  return [...missing, ...dupes];
};

const checkAdrFile = (r: string, text: string): readonly Issue[] => {
  if (!G.adrDirRe.test(r) || r.endsWith(G.programReadme)) return [];
  if (!G.adrFileRe.test(r)) {
    return [issue("adr", `${r}: name must match ${G.adrShape}`)];
  }
  const status = text.match(/^[Ss]tatus:\s*(.+)$/m);
  if (status === null) return [issue("adr", `${r}: missing "Status:" line`)];
  return G.adrStatusRe.test(status[1].trim())
    ? []
    : [issue("adr", `${r}: invalid status "${status[1].trim()}"`)];
};

const checkAdrNumbering = (docs: string): readonly Issue[] => {
  const dir = join(docs, G.decisions);
  if (!existsSync(dir)) return [];
  const nums = readdirSync(dir)
    .map((n) => n.match(G.adrNameRe)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
  const pad = (n: number): string => String(n).padStart(G.adrDigits, "0");
  const dupes = nums
    .filter((n, i) => i > 0 && n === nums[i - 1])
    .map((n) => issue("adr", `duplicate ADR number ${pad(n)}`));
  const gaps = nums
    .filter((n, i) => i > 0 && n > nums[i - 1] + 1)
    .map((n, _, __) => issue("adr", `ADR numbering gap before ${pad(n)} — numbering must be sequential`));
  const start = nums.length > 0 && nums[0] > 1
    ? [issue("adr", `ADR numbering starts at ${pad(nums[0])} — expected ${pad(1)}`)]
    : [];
  return [...dupes, ...gaps, ...start];
};

// work/ holds two kinds of dir: a TRIAD (has tasks.md) or a PROGRAM
// (has README.md + NN-<slug>/ initiative triads). Depth is capped at
// program/initiative — nothing nests deeper.


// A promoted triad carries its own evidence: run artifacts are gitignored, so
// a `Promoted-ids` entry with no findings.md line and no task is work that
// survived only on the machine that promoted it. See promotion.md.
const readIf = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "");

// A run identity is compared literally by the duplicate scan, so its stored
// form must be the ONE spelling of that path: normalised (no `//`, `.`, `..`,
// no trailing slash), repo-relative under `.skills/supermodo/`, no `.md`.
const isCanonicalFrom = (v: string): boolean =>
  v.startsWith(".skills/supermodo/")
  && v.length > ".skills/supermodo/".length
  && !v.endsWith(".md")
  && !v.includes("\\")
  && posix.normalize(v) === v
  && !v.endsWith("/");

// Finding ids are minted `<PREFIX>-<run-stamp>-<seq>` (promotion.md). A
// lowercased copy names the same finding and compares as a different claim,
// so a retry using the shard's own casing promotes it a second time.
const isCanonicalId = (v: string): boolean => /^[A-Z][A-Z0-9]*-\d+-\d+$/.test(v);

// Both halves of the key are canonicalised. The path because a
// case-insensitive filesystem resolves `hunt/run` and `HUNT/run` to one
// report; the id for the same reason one level down. Two genuinely distinct
// reports differing only in case cannot coexist there, so the worst this
// costs on a case-sensitive filesystem is a repair prompt.
const claimKey = (from: string, id: string): string =>
  `${posix.normalize(from).toLowerCase()} ${id.toLowerCase()}`;

// `Priority:` per worklist.md — `P<0-3> — <classification>: <justification>`.


// Absent or malformed on its own is NOT reported: the protocol renders those
// as provisional `P2 — unset` and lists them under repairs, and a project with
// no priorities at all still draws a board. What IS reported is a state no
// reader can resolve — two priority fields, which every reader would read
// differently, or a `Priority-source:` marker signing a value that is not
// there. The marker is the only thing separating a rank a human chose from one
// a tool computed (worklist.md, "Confirmed, derived, unset"), so a marker that
// does not parse must not be allowed to read as absence, which means confirmed.
const priorityIssues = (dir: string, rel: string): readonly Issue[] => {
  const spec = readIf(join(dir, G.spec));
  if (spec === "") return [];
  const fields = [...spec.matchAll(G.priorityLooseReG())];
  const sources = [...spec.matchAll(G.sourceLooseReG())];
  return [
    ...(fields.length > 1
      ? [issue("priority", `${rel}${G.spec}: ${fields.length} priority fields — an item carries at most one, and two is not a range`)]
      : []),
    ...(sources.length > 1
      ? [issue("priority", `${rel}${G.spec}: ${sources.length} ${G.sourceLabel} lines — one item, one provenance`)]
      : []),
    ...(sources.length === 1
      ? [
          ...(G.sourceDerivedRe.test(spec)
            ? []
            : [issue("priority", `${rel}${G.spec}: ${G.sourceLabel} must read "${G.sourceShape}" — the only defined value is "${G.derivedValue}", and it has to name the assumption the user is being asked to confirm`)]),
          ...(G.priorityRe.test(spec)
            ? []
            : [issue("priority", `${rel}${G.spec}: ${G.sourceLabel}: ${G.derivedValue} with no valid ${G.priorityLabel}: line — the marker says who chose a value that is not there`)]),
        ]
      : []),
  ];
};

const promotionIssues = (dir: string, rel: string): readonly Issue[] => {
  const spec = readIf(join(dir, G.spec));
  // Decide whether this is a promotion BEFORE parsing it strictly. Returning
  // early because the exact line did not match is how `Promoted-from :` or a
  // lower-cased key skips every check below while findings.md sits there
  // unvalidated. A near-miss key, or the presence of findings.md at all, means
  // this item claims to be promoted and must prove it.
  const loose = [...spec.matchAll(G.provenanceLooseReG())];
  const hasFindings = existsSync(join(dir, G.findings));
  if (loose.length === 0 && !hasFindings) return [];
  const fromLines = [...spec.matchAll(G.fromReG())];
  // The run identity must be CANONICAL, because the duplicate scan matches on
  // it literally. `…/2026-08-03-api.md`, an absolute path or a `..` segment
  // all name the same run and none of them compares equal, so the same
  // findings get promoted again with nothing flagged.
  const canonical = fromLines.flatMap(([, v]) =>
    isCanonicalFrom(v)
      ? []
      : [issue("promotion", `${rel}${G.spec}: ${G.fromLabel} "${v}" is not a canonical run identity — a normalised repo-relative report stem under .skills/supermodo/, no .md, no empty/. /.. segments`)]);
  const idLines = [...spec.matchAll(G.idsReG())];
  if (fromLines.length !== 1 || idLines.length !== 1) {
    return [issue("promotion", `${rel}${G.spec}: a promoted item needs exactly one "${G.fromLabel}:" and one "${G.idsLabel}:" in the documented form — found ${fromLines.length} and ${idLines.length}${hasFindings ? `, and ${G.findings} is present` : ""}`)];
  }
  const stray = loose.length > 2
    ? [issue("promotion", `${rel}${G.spec}: ${loose.length} provenance-key lines, expected exactly the two`)]
    : [];
  const idLine = idLines[0][1];
  const ids = idLine.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  const sorted = [...ids].sort();
  const order = ids.every((id, i) => id === sorted[i])
    ? []
    : [issue("promotion", `${rel}${G.spec}: ${G.idsLabel} must be ASCII-sorted so the line is a function of the set`)];
  const idDupes = ids
    .filter((id, i) => ids.indexOf(id) < i)
    .map((id) => issue("promotion", `${rel}${G.spec}: ${G.idsLabel} lists ${id} twice`));
  const idShape = ids
    .filter((id) => !isCanonicalId(id))
    .map((id) => issue("promotion", `${rel}${G.spec}: ${G.idsLabel} entry "${id}" is not a canonical finding id (<PREFIX>-<run-stamp>-<seq>, as minted)`));
  const findings = readIf(join(dir, G.findings));
  if (findings === "") {
    return [...order, ...stray, ...canonical, ...idDupes, ...idShape, issue("promotion", `${rel} missing ${G.findings} — promoted work carries its evidence, the run artifact is gitignored`)];
  }
  // EXACT sets, never substring: "…-01" is contained in "…-010". Evidence ids
  // head their section (`## <ID> — title`); task ids come ONLY from checklist
  // lines, since a marker sitting in prose is not work anyone can do.
  const promoted = new Set(ids);
  // A heading is a finding section when its first token looks like a finding
  // id or is one this spec claims — so an ordinary `## Notes` heading is left
  // alone, while a malformed finding heading is still caught below.
  const sections = findings
    .split(/^(?=##[ \t])/m)
    .filter((s) => s.startsWith("##"))
    .map((body) => ({ body, head: body.slice(0, body.indexOf("\n") + 1 || undefined) }))
    .map(({ body, head }) => ({ body, head, tok: head.replace(/^##[ \t]+/, "").split(/\s/)[0] ?? "" }))
    .filter(({ tok }) => /^[A-Z][A-Z0-9]*-\d+-\d+$/.test(tok) || promoted.has(tok));
  const headings = sections.map((s) => s.tok);
  const evidence = new Set(headings);
  // The heading alone is not evidence. A section with the right id and an
  // empty body passes every set comparison while carrying nothing anyone can
  // act on — and the shard it was copied from is gitignored, so the loss is
  // permanent and looks clean.
  const shape = sections.flatMap(({ head, tok }) =>
    /^##[ \t]+\S+[ \t]+—[ \t]+\S/.test(head)
      ? []
      : [issue("promotion", `${rel}${G.findings}: "${tok}" must head a "## ${tok} — <title>" section`)]);
  const bodies = sections.flatMap(({ body, tok }) =>
    G.findingSections
      .filter((field) => !new RegExp(`(^|\\n)[-*\\s]*${field}:[ \\t]*\\S`, "i").test(body))
      .map((field) => issue("promotion", `${rel}${G.findings}: ${tok} has no "${field}:" — a heading is not evidence`)));
  const taskIds = new Set(
    readIf(join(dir, G.tasks))
      .split("\n")
      .filter((line) => G.checklistRe.test(line))
      .flatMap((line) => [...line.matchAll(G.taskMarkerReG())].map((m) => m[1])),
  );
  return [
    ...order,
    ...stray,
    ...canonical,
    ...idDupes,
    ...idShape,
    ...shape,
    ...bodies,
    ...headings
      .filter((h, i) => headings.indexOf(h) < i)
      .map((h) => issue("promotion", `${rel}${G.findings}: ${h} heads two sections`)),
    ...ids.filter((id) => !evidence.has(id))
      .map((id) => issue("promotion", `${rel}: ${id} is in ${G.idsLabel} but heads no "## ${id} — …" section in ${G.findings}`)),
    ...ids.filter((id) => !taskIds.has(id.toLowerCase()))
      .map((id) => issue("promotion", `${rel}: ${id} is in ${G.idsLabel} but no CHECKLIST task carries <!-- ${G.taskPrefix}:${id.toLowerCase()} -->`)),
    // The reverse direction, for evidence only. findings.md belongs to the
    // promotion, so a section with no provenance is the state an interrupted
    // extension leaves (provenance is written last) — clean-looking, and the
    // finding gets promoted a second time later. Tasks get no reverse check:
    // a triad may legitimately carry tasks that are not findings.
    ...headings.filter((h) => !promoted.has(h))
      .map((h) => issue("promotion", `${rel}${G.findings}: ${h} has evidence but is absent from ${G.idsLabel} — an extension that never recorded its provenance`)),
  ];
};


// `extraRequired` is the ADD-ONLY half of the grammar: fields a project makes
// mandatory on top of the convention. Nothing in the package reads their
// values — that is the point. A team requiring `Owner:` or `Jira:` gets it
// enforced here without the package having to know what those mean.
const extraSpecIssues = (dir: string, rel: string): readonly Issue[] => {
  if (G.extraSpec.length === 0) return [];
  const spec = readIf(join(dir, G.spec));
  if (spec === "") return [];
  return G.extraSpec
    .filter((label) => !new RegExp(`^${esc(label)}:[ \\t]*\\S`, "m").test(spec))
    .map((label) => issue("required", `${rel}${G.spec}: missing required field "${label}:" — docs.grammar.extraRequired.spec`));
};

// Backlog entries per docs-convention: `- **<slug>** (date): text`, an entry
// running until the next top-level list item. Struck-through and graduated
// entries are history, not live work, so a field added today is never
// backdated onto them.
const liveBacklogEntries = (text: string): readonly { readonly slug: string; readonly body: string; readonly n: number }[] => {
  const lines = text.split("\n");
  const starts = lines.flatMap((l, i) => (/^- /.test(l) ? [i] : []));
  return starts.flatMap((i, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : lines.length;
    const body = lines.slice(i, end).join("\n");
    const m = lines[i].match(/^- \*\*([a-z0-9-]+)\*\*/);
    return m === null || /→ graduated/.test(body) ? [] : [{ slug: m[1], body, n: i + 1 }];
  });
};

const extraBacklogIssues = (docs: string): readonly Issue[] => {
  if (G.extraBacklog.length === 0) return [];
  const file = join(docs, G.backlog);
  if (!existsSync(file)) return [];
  return liveBacklogEntries(readFileSync(file, "utf8")).flatMap(({ slug, body, n }) =>
    G.extraBacklog
      .filter((label) => !new RegExp(`^[ \\t]+${esc(label)}[ \\t]*:[ \\t]*\\S`, "im").test(body))
      .map((label) => issue("required", `<docs>/${G.backlog}:${n}: entry "${slug}" is missing required field "${label}:" — docs.grammar.extraRequired.backlog`)));
};

const triadIssues = (dir: string, rel: string): readonly Issue[] => [
  ...[G.spec, G.plan, G.tasks]
    .filter((part) => !existsSync(join(dir, part)))
    .map((part) => issue("triad", `${rel} missing ${part}`)),
  ...promotionIssues(dir, rel),
  ...priorityIssues(dir, rel),
  ...extraSpecIssues(dir, rel),
];

const programIssues = (dir: string, rel: string): readonly Issue[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const subdirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const initiatives = subdirs.filter((n) => G.initiativeRe.test(n));
  const nums = initiatives.map((n) => n.slice(0, G.initiativeDigits));
  const fmProgram = (() => {
    try {
      return readFileSync(join(dir, G.programReadme), "utf8")
        .match(G.programKeyRe)?.[1].trim();
    } catch {
      return undefined;
    }
  })();
  return [
    ...files
      .filter((n) => n !== G.programReadme)
      .map((n) => issue("program", `${rel}${n}: stray file — a program dir holds only ${G.programReadme} and ${G.initiativeShape} initiatives`)),
    ...subdirs
      .filter((n) => !G.initiativeRe.test(n))
      .map((n) => issue("program", `${rel}${n}/: initiative dirs must match ${G.initiativeShape} (${G.initiativeDigits} digits, kebab-case)`)),
    ...(initiatives.length === 0
      ? [issue("program", `${rel} has no ${G.initiativeShape} initiatives`)]
      : []),
    ...nums
      .filter((n, i) => nums.indexOf(n) < i)
      .map((n) => issue("program", `${rel} duplicate initiative number ${n}`)),
    ...(fmProgram === undefined
      ? [issue("program", `${rel}${G.programReadme}: missing "${G.programKey}:" frontmatter line`)]
      : fmProgram !== basename(dir)
        ? [issue("program", `${rel}${G.programReadme}: ${G.programKey} "${fmProgram}" != folder "${basename(dir)}"`)]
        : []),
    ...initiatives.flatMap((n) => [
      ...triadIssues(join(dir, n), `${rel}${n}/`),
      ...readdirSync(join(dir, n), { withFileTypes: true })
        .filter((c) => c.isDirectory() &&
          (G.initiativeRe.test(c.name) || existsSync(join(dir, n, c.name, G.tasks))))
        .map((c) => issue("program", `${rel}${n}/${c.name}/: nesting deeper than program/initiative is not allowed`)),
    ]),
  ];
};

// Every triad under work/, flat or inside a program, as [dir, rel].
const allTriads = (workDir: string): readonly (readonly [string, string])[] =>
  readdirSync(workDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .flatMap((e) => {
      const dir = join(workDir, e.name);
      if (existsSync(join(dir, G.tasks))) return [[dir, `<docs>/${G.work}/${e.name}/`] as const];
      return readdirSync(dir, { withFileTypes: true })
        .filter((c) => c.isDirectory() && existsSync(join(dir, c.name, G.tasks)))
        .map((c) => [join(dir, c.name), `<docs>/${G.work}/${e.name}/${c.name}/`] as const);
    });

// One finding, one item. Per-item validation cannot see this: two promotions
// racing, or one retried after a grouping change, each produce a self-
// consistent item claiming the same finding. On the board it is one bug to fix
// twice, and whichever item is archived first makes the other look stale.
const duplicatePromotions = (workDir: string): readonly Issue[] => {
  const claims = allTriads(workDir).flatMap(([dir, rel]) => {
    const spec = readIf(join(dir, G.spec));
    const from = spec.match(G.fromRe)?.[1];
    const idLine = spec.match(G.idsRe)?.[1];
    if (from === undefined || idLine === undefined) return [];
    return idLine.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
      .map((id) => ({ key: claimKey(from, id), id, from, rel }));
  });
  return claims
    .filter((c, i) => claims.findIndex((o) => o.key === c.key) < i)
    .map((c) => {
      const first = claims.find((o) => o.key === c.key)?.rel ?? "?";
      return issue("promotion", `${c.id} (from ${c.from}) is promoted twice — ${first} and ${c.rel}`);
    });
};

const checkWork = (docs: string): readonly Issue[] => {
  const workDir = join(docs, G.work);
  if (!existsSync(workDir)) return [];
  return [
    // Dot dirs are skipped here exactly as `walkMd` skips them: a promotion
    // stages its next item under `docs/work/.staging/` so the final move is a
    // same-filesystem rename, and that half-built triad is not yet work.
    ...readdirSync(workDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .flatMap((e) => {
        const dir = join(workDir, e.name);
        const rel = `<docs>/${G.work}/${e.name}/`;
        if (existsSync(join(dir, G.tasks))) return triadIssues(dir, rel);
        if (existsSync(join(dir, G.programReadme))) return programIssues(dir, rel);
        return [issue("triad", `${rel} is neither a triad (no ${G.tasks}) nor a program (no ${G.programReadme} + ${G.initiativeShape} initiatives)`)];
      }),
    ...duplicatePromotions(workDir),
  ];
};

const count = (text: string, needle: string): number =>
  text.split(needle).length - 1;

const checkNavMarkers = (r: string, text: string, isRouter: boolean): readonly Issue[] => {
  const starts = count(text, G.navStart);
  const ends = count(text, G.navEnd);
  const si = text.indexOf(G.navStart);
  const ei = text.indexOf(G.navEnd);
  return [
    ...(starts !== ends || starts > 1
      ? [issue("generated", `${r}: unbalanced or duplicated ${G.navStartName}/${G.navEndName} markers (${starts} start / ${ends} end)`)]
      : []),
    ...(starts === 1 && ends === 1 && ei < si
      ? [issue("generated", `${r}: ${G.navEndName} appears before ${G.navStartName}`)]
      : []),
    ...(isRouter && text.includes(G.fileMarker)
      ? [issue("generated", `${r}: router must not carry the file-level ${G.fileMarkerName} marker (only the nav section is generated)`)]
      : []),
  ];
};

const checkFile = (rel: (p: string) => string, router: string) => (f: string): readonly Issue[] => {
  const text = readFileSync(f, "utf8");
  const r = rel(f);
  return [
    ...checkSize(f, r),
    ...checkLinks(f, r, text),
    ...checkTaskIds(r, text),
    ...checkAdrFile(r, text),
    ...checkNavMarkers(r, text, f === router),
  ];
};

// `--item <dir>` validates ONE work directory in place — the mode a promotion
// needs to check a staged triad before renaming it into docs/work/. Whole-tree
// checks (structure, links, ADR numbering, cross-item duplicates) do not apply
// to a directory that is not in the tree yet, so they are skipped.
const checkItem = (dir: string): number => {
  const d = resolve(dir);
  if (!existsSync(d)) {
    console.log(`[triad] ${dir} does not exist`);
    return 1;
  }
  const rel = `${dir.replace(/\/+$/, "")}/`;
  const issues = [
    ...triadIssues(d, rel),
    ...checkTaskIds(`${rel}${G.tasks}`, readIf(join(d, G.tasks))),
  ];
  issues.forEach(({ cls, msg }) => console.log(`[${cls}] ${msg}`));
  console.log(issues.length > 0 ? `docs-check: ${issues.length} issue(s)` : "docs-check: item ok");
  return issues.length > 0 ? 1 : 0;
};

const main = (): number => {
  if (process.argv[2] === "--item") return checkItem(process.argv[3] ?? ".");
  const root = resolve(process.argv[2] ?? ".");
  const entryRel = process.argv[3] ?? `${G.root}/README.md`;
  const entry = resolve(root, entryRel);
  const docs = dirname(entry);
  const conventions = process.argv[4] !== undefined
    ? resolve(root, process.argv[4])
    : join(docs, "CONVENTIONS.md");
  if (!existsSync(docs)) {
    console.log(`[structure] ${dirname(entryRel)}/ missing — run the config skill to scaffold the convention`);
    return 1;
  }
  const issues: readonly Issue[] = [
    ...checkStructure(docs, basename(entry), conventions),
    ...walkMd(docs).flatMap(checkFile(relTo(root), entry)),
    ...checkAdrNumbering(docs),
    ...checkWork(docs),
    ...extraBacklogIssues(docs),
  ];
  issues.forEach(({ cls, msg }) => console.log(`[${cls}] ${msg}`));
  if (issues.length > 0) {
    console.log(`docs-check: ${issues.length} issue(s)`);
    return 1;
  }
  console.log("docs-check: clean");
  return 0;
};

process.exit(main());
