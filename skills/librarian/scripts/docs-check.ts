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
import { join, dirname, basename, resolve, sep } from "node:path";

type Issue = { readonly cls: string; readonly msg: string };

const issue = (cls: string, msg: string): Issue => ({ cls, msg });
const relTo = (root: string) => (p: string): string =>
  p.slice(root.length + 1).split(sep).join("/");

const walkMd = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      return e.name === "archive" || e.name.startsWith(".") ? [] : walkMd(p);
    }
    return e.name.endsWith(".md") ? [p] : [];
  });

const checkStructure = (docs: string, entryName: string, conventions: string): readonly Issue[] => [
  ...[entryName, "work/BACKLOG.md"]
    .filter((req) => !existsSync(join(docs, req)))
    .map((req) => issue("structure", `<docs>/${req} missing`)),
  ...(existsSync(conventions)
    ? []
    : [issue("structure", `conventions file missing (${basename(conventions)} — configured via docs.conventions)`)]),
  ...["work", "decisions", "reference", "archive"]
    .filter((dir) => !existsSync(join(docs, dir)))
    .map((dir) => issue("structure", `<docs>/${dir}/ missing`)),
];

const checkSize = (f: string, r: string): readonly Issue[] => {
  const kb = statSync(f).size / 1024;
  return kb > 40
    ? [issue("size", `${r} is ${kb.toFixed(0)} KB (>40 KB) — split at responsibility boundaries`)]
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
  if (!r.endsWith("/tasks.md")) return [];
  const checklistLines = text
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /^\s*- \[[ xX/^-]\]/.test(line));
  const ids = checklistLines.map(({ line, n }) => ({
    n,
    id: line.match(/<!--\s*task:([a-z0-9-]+)\s*-->/)?.[1],
  }));
  const missing = ids
    .filter(({ id }) => id === undefined)
    .map(({ n }) => issue("task-id", `${r}:${n}: checklist line missing <!-- task:<slug> --> ID`));
  const dupes = ids
    .filter(({ id }, i) => id !== undefined && ids.findIndex((o) => o.id === id) < i)
    .map(({ n, id }) => issue("task-id", `${r}:${n}: duplicate task ID "${id}"`));
  return [...missing, ...dupes];
};

const checkAdrFile = (r: string, text: string): readonly Issue[] => {
  if (!/(^|\/)decisions\/[^/]+\.md$/.test(r) || r.endsWith("README.md")) return [];
  if (!/(^|\/)decisions\/ADR-\d{4}-[a-z0-9-]+\.md$/.test(r)) {
    return [issue("adr", `${r}: name must match ADR-NNNN-<slug>.md`)];
  }
  const status = text.match(/^[Ss]tatus:\s*(.+)$/m);
  if (status === null) return [issue("adr", `${r}: missing "Status:" line`)];
  return /^(proposed|accepted|rejected|superseded-by: ADR-\d{4})$/.test(status[1].trim())
    ? []
    : [issue("adr", `${r}: invalid status "${status[1].trim()}"`)];
};

const checkAdrNumbering = (docs: string): readonly Issue[] => {
  const dir = join(docs, "decisions");
  if (!existsSync(dir)) return [];
  const nums = readdirSync(dir)
    .map((n) => n.match(/^ADR-(\d{4})-/)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
  const pad = (n: number): string => String(n).padStart(4, "0");
  const dupes = nums
    .filter((n, i) => i > 0 && n === nums[i - 1])
    .map((n) => issue("adr", `duplicate ADR number ${pad(n)}`));
  const gaps = nums
    .filter((n, i) => i > 0 && n > nums[i - 1] + 1)
    .map((n, _, __) => issue("adr", `ADR numbering gap before ${pad(n)} — numbering must be sequential`));
  const start = nums.length > 0 && nums[0] > 1
    ? [issue("adr", `ADR numbering starts at ${pad(nums[0])} — expected 0001`)]
    : [];
  return [...dupes, ...gaps, ...start];
};

// work/ holds two kinds of dir: a TRIAD (has tasks.md) or a PROGRAM
// (has README.md + NN-<slug>/ initiative triads). Depth is capped at
// program/initiative — nothing nests deeper.
const INITIATIVE_RE = /^\d{2}-[a-z0-9-]+$/;

const triadIssues = (dir: string, rel: string): readonly Issue[] =>
  ["spec.md", "plan.md", "tasks.md"]
    .filter((part) => !existsSync(join(dir, part)))
    .map((part) => issue("triad", `${rel} missing ${part}`));

const programIssues = (dir: string, rel: string): readonly Issue[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const subdirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const initiatives = subdirs.filter((n) => INITIATIVE_RE.test(n));
  const nums = initiatives.map((n) => n.slice(0, 2));
  const fmProgram = (() => {
    try {
      return readFileSync(join(dir, "README.md"), "utf8")
        .match(/^program:\s*(.+)$/m)?.[1].trim();
    } catch {
      return undefined;
    }
  })();
  return [
    ...files
      .filter((n) => n !== "README.md")
      .map((n) => issue("program", `${rel}${n}: stray file — a program dir holds only README.md and NN-<slug>/ initiatives`)),
    ...subdirs
      .filter((n) => !INITIATIVE_RE.test(n))
      .map((n) => issue("program", `${rel}${n}/: initiative dirs must match NN-<slug> (two digits, kebab-case)`)),
    ...(initiatives.length === 0
      ? [issue("program", `${rel} has no NN-<slug>/ initiatives`)]
      : []),
    ...nums
      .filter((n, i) => nums.indexOf(n) < i)
      .map((n) => issue("program", `${rel} duplicate initiative number ${n}`)),
    ...(fmProgram === undefined
      ? [issue("program", `${rel}README.md: missing "program:" frontmatter line`)]
      : fmProgram !== basename(dir)
        ? [issue("program", `${rel}README.md: program "${fmProgram}" != folder "${basename(dir)}"`)]
        : []),
    ...initiatives.flatMap((n) => [
      ...triadIssues(join(dir, n), `${rel}${n}/`),
      ...readdirSync(join(dir, n), { withFileTypes: true })
        .filter((c) => c.isDirectory() &&
          (INITIATIVE_RE.test(c.name) || existsSync(join(dir, n, c.name, "tasks.md"))))
        .map((c) => issue("program", `${rel}${n}/${c.name}/: nesting deeper than program/initiative is not allowed`)),
    ]),
  ];
};

const checkWork = (docs: string): readonly Issue[] => {
  const workDir = join(docs, "work");
  if (!existsSync(workDir)) return [];
  return readdirSync(workDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => {
      const dir = join(workDir, e.name);
      const rel = `<docs>/work/${e.name}/`;
      if (existsSync(join(dir, "tasks.md"))) return triadIssues(dir, rel);
      if (existsSync(join(dir, "README.md"))) return programIssues(dir, rel);
      return [issue("triad", `${rel} is neither a triad (no tasks.md) nor a program (no README.md + NN-<slug>/ initiatives)`)];
    });
};

const count = (text: string, needle: string): number =>
  text.split(needle).length - 1;

const checkNavMarkers = (r: string, text: string, isRouter: boolean): readonly Issue[] => {
  const starts = count(text, "<!-- supermodo:nav:start -->");
  const ends = count(text, "<!-- supermodo:nav:end -->");
  const si = text.indexOf("<!-- supermodo:nav:start -->");
  const ei = text.indexOf("<!-- supermodo:nav:end -->");
  return [
    ...(starts !== ends || starts > 1
      ? [issue("generated", `${r}: unbalanced or duplicated supermodo:nav markers (${starts} start / ${ends} end)`)]
      : []),
    ...(starts === 1 && ends === 1 && ei < si
      ? [issue("generated", `${r}: supermodo:nav:end appears before supermodo:nav:start`)]
      : []),
    ...(isRouter && text.includes("<!-- supermodo:generated -->")
      ? [issue("generated", `${r}: router must not carry the file-level supermodo:generated marker (only the nav section is generated)`)]
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

const main = (): number => {
  const root = resolve(process.argv[2] ?? ".");
  const entryRel = process.argv[3] ?? "docs/README.md";
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
