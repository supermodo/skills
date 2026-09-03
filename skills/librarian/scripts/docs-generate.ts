// supermodo docs-generate — regenerates the nav section of the docs router
// between <!-- supermodo:nav:start --> and <!-- supermodo:nav:end -->.
// Idempotent; touches nothing outside the markers. The router itself is NOT
// a fully-generated file — only the delimited nav section is owned here, so
// no file-level <!-- supermodo:generated --> marker is inserted.
// Usage: node docs-generate.ts [project-root] [docs-entry]   (Node ≥ 22.18)
//   docs-entry: root-relative router path (default: the configured docs root
//   + README.md). Every folder, file and marker name below is resolved from
//   the project's skills.config.json — see config/scripts/grammar-load.ts.

import { readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { buildGrammar } from "../../config/scripts/grammar-load.ts";

// Resolved once at the CLI edge, exactly as docs-check does.
const G = buildGrammar(process.argv[2] ?? ".", false);
const START = G.navStart;
const END = G.navEnd;

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

const triadLine = (docs: string, relPath: string, indent: string): string => {
  const title = firstHeading(join(docs, G.work, relPath, G.spec)) ?? relPath;
  const link = (f: string): string => `${G.work}/${relPath}/${f}`;
  return `${indent}- [${title}](${link(G.spec)}) — [plan](${link(G.plan)}) · [tasks](${link(G.tasks)})`;
};

// A work/ dir is a triad (has tasks.md) or a program (README.md +
// NN-<slug>/ initiative triads, listed nested under the program line).
const workLines = (docs: string): readonly string[] =>
  listDirs(join(docs, G.work)).flatMap((w) => {
    const dir = join(docs, G.work, w);
    if (!existsSync(join(dir, G.tasks)) && existsSync(join(dir, G.programReadme))) {
      const title = firstHeading(join(dir, G.programReadme)) ?? w;
      return [
        `- **[${title}](${G.work}/${w}/${G.programReadme})**`,
        ...listDirs(dir)
          .filter((n) => G.initiativeRe.test(n))
          .map((n) => triadLine(docs, `${w}/${n}`, "  ")),
      ];
    }
    return [triadLine(docs, w, "")];
  });

const adrLines = (docs: string): readonly string[] =>
  listFiles(join(docs, G.decisions), (n) => G.adrNameRe.test(n) && n.endsWith(".md")).map((a) => {
    const title = firstHeading(join(docs, G.decisions, a)) ?? a.replace(/\.md$/, "");
    return `- [${title}](${G.decisions}/${a})`;
  });

const referenceLines = (docs: string): readonly string[] =>
  listFiles(join(docs, G.reference), (n) => n.endsWith(".md")).map((rf) => {
    const title = firstHeading(join(docs, G.reference, rf)) ?? rf.replace(/\.md$/, "");
    return `- [${title}](${G.reference}/${rf})`;
  });

const navBody = (docs: string): string =>
  [
    "",
    "### Active work",
    "",
    ...orNone(workLines(docs)),
    "",
    `- [Backlog](${G.backlog})`,
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
  const entryRel = process.argv[3] ?? `${G.root}/README.md`;
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
