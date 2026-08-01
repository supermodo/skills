// supermodo docs-generate — regenerates the nav section of the docs router
// between <!-- supermodo:nav:start --> and <!-- supermodo:nav:end -->.
// Idempotent; touches nothing outside the markers. The router itself is NOT
// a fully-generated file — only the delimited nav section is owned here, so
// no file-level <!-- supermodo:generated --> marker is inserted.
// Usage: node docs-generate.ts [project-root] [docs-entry]   (Node ≥ 22.18)
//   docs-entry: root-relative router path (default "docs/README.md").

import { readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const START = "<!-- supermodo:nav:start -->";
const END = "<!-- supermodo:nav:end -->";

const firstHeading = (p: string): string | undefined => {
  try {
    return readFileSync(p, "utf8").match(/^#\s+(.+)$/m)?.[1].trim();
  } catch {
    return undefined;
  }
};

const listDirs = (dir: string): readonly string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];

const listFiles = (dir: string, match: (n: string) => boolean): readonly string[] =>
  existsSync(dir) ? readdirSync(dir).filter(match).sort() : [];

const orNone = (lines: readonly string[]): readonly string[] =>
  lines.length === 0 ? ["_none_"] : lines;

const INITIATIVE_RE = /^\d{2}-[a-z0-9-]+$/;

const triadLine = (docs: string, relPath: string, indent: string): string => {
  const title = firstHeading(join(docs, "work", relPath, "spec.md")) ?? relPath;
  return `${indent}- [${title}](work/${relPath}/spec.md) — [plan](work/${relPath}/plan.md) · [tasks](work/${relPath}/tasks.md)`;
};

// A work/ dir is a triad (has tasks.md) or a program (README.md +
// NN-<slug>/ initiative triads, listed nested under the program line).
const workLines = (docs: string): readonly string[] =>
  listDirs(join(docs, "work")).flatMap((w) => {
    const dir = join(docs, "work", w);
    if (!existsSync(join(dir, "tasks.md")) && existsSync(join(dir, "README.md"))) {
      const title = firstHeading(join(dir, "README.md")) ?? w;
      return [
        `- **[${title}](work/${w}/README.md)**`,
        ...listDirs(dir)
          .filter((n) => INITIATIVE_RE.test(n))
          .map((n) => triadLine(docs, `${w}/${n}`, "  ")),
      ];
    }
    return [triadLine(docs, w, "")];
  });

const adrLines = (docs: string): readonly string[] =>
  listFiles(join(docs, "decisions"), (n) => /^ADR-\d{4}-.+\.md$/.test(n)).map((a) => {
    const title = firstHeading(join(docs, "decisions", a)) ?? a.replace(/\.md$/, "");
    return `- [${title}](decisions/${a})`;
  });

const referenceLines = (docs: string): readonly string[] =>
  listFiles(join(docs, "reference"), (n) => n.endsWith(".md")).map((rf) => {
    const title = firstHeading(join(docs, "reference", rf)) ?? rf.replace(/\.md$/, "");
    return `- [${title}](reference/${rf})`;
  });

const navBody = (docs: string): string =>
  [
    "",
    "### Active work",
    "",
    ...orNone(workLines(docs)),
    "",
    "- [Backlog](work/BACKLOG.md)",
    "",
    "### Decisions",
    "",
    ...orNone(adrLines(docs)),
    "",
    "### Reference",
    "",
    ...orNone(referenceLines(docs)),
    "",
  ].join("\n");

const replaceNav = (text: string, body: string): string | undefined => {
  const si = text.indexOf(START);
  const ei = text.indexOf(END);
  if (si === -1 || ei === -1 || ei < si) return undefined;
  return text.slice(0, si + START.length) + "\n" + body + "\n" + text.slice(ei);
};

const writeAtomic = (path: string, content: string): void => {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
};

const main = (): number => {
  const root = resolve(process.argv[2] ?? ".");
  const entryRel = process.argv[3] ?? "docs/README.md";
  const router = resolve(root, entryRel);
  const docs = dirname(router);
  if (!existsSync(router)) {
    console.error(`docs-generate: ${entryRel} missing — run the config skill first`);
    return 1;
  }
  const text = readFileSync(router, "utf8");
  const next = replaceNav(text, navBody(docs));
  if (next === undefined) {
    console.error(`docs-generate: ${entryRel} must contain ${START} ... ${END}`);
    return 1;
  }
  if (next === text) {
    console.log("docs-generate: up to date");
    return 0;
  }
  writeAtomic(router, next);
  console.log("docs-generate: nav regenerated");
  return 0;
};

process.exit(main());
