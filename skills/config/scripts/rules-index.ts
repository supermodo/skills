// supermodo rules-index — regenerate .supermodo/rules/INDEX.md from the
// cross-cutting files' frontmatter. Usage: node rules-index.ts [project-root]
// The INDEX is generated IN ITS ENTIRETY; never hand-edit it.
// Contract: ../../protocols/references/rules.md

import { readdirSync, readFileSync, writeFileSync, existsSync, renameSync, realpathSync, openSync, closeSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";

type Front = Readonly<Record<string, string>>;

const frontmatter = (text: string): Front | undefined => {
  const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1];
  return block === undefined
    ? undefined
    : Object.fromEntries(
        block.split("\n")
          .map((l) => l.match(/^([a-z][a-z-]*):\s*(.*)$/))
          .filter((m): m is RegExpMatchArray => m !== null)
          .map((m) => [m[1], m[2].trim()]),
      );
};

const list = (v: string | undefined): readonly string[] =>
  v === undefined
    ? []
    : v.replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s) => s.length > 0);

const HEADER = `<!-- supermodo:generated -->
# Rules index

Cross-cutting rules files and the skills that read them. Regenerate with
\`node <skills>/config/scripts/rules-index.ts <project-root>\`.

| file | applies-to | description |
| --- | --- | --- |
`;

// Real-path containment. `join` alone does not stop a symlinked parent from
// escaping the project (skills/config/references/procedures.md §4), and
// .supermodo/rules is committed content — untrusted by the same rule that
// makes a committed Makefile untrusted.
const containedDir = (root: string): string | undefined => {
  const realRoot = realpathSync(resolve(root));
  const dir = realpathSync(join(realRoot, ".supermodo/rules"));
  return dir === realRoot || dir.startsWith(realRoot + sep) ? dir : undefined;
};

const main = (): number => {
  const root = process.argv[2] ?? process.cwd();
  if (!existsSync(join(root, ".supermodo/rules"))) {
    console.log("rules-index: no .supermodo/rules/ — nothing to generate");
    return 0;
  }
  const dir = containedDir(root);
  if (dir === undefined) {
    console.error("rules-index: .supermodo/rules resolves outside the project root — refusing to write");
    return 1;
  }
  const rows = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "INDEX.md")
    .sort()
    .flatMap((f) => {
      const fm = frontmatter(readFileSync(join(dir, f), "utf8"));
      if (fm === undefined) return [];
      const appliesTo = list(fm["applies-to"]);
      const stem = f.replace(/\.md$/, "");
      const cross = appliesTo.length > 1 || (appliesTo.length === 1 && appliesTo[0] !== stem);
      // Byte-identical to rules-check's canonicalRow, by contract.
      return cross ? [`| ${f} | ${appliesTo.join(", ")} | ${fm.description ?? ""} |`] : [];
    });
  const out = `${HEADER}${rows.join("\n")}\n`;
  // Exclusive create: a pre-existing .INDEX.md.tmp SYMLINK would otherwise
  // redirect writeFileSync onto an arbitrary file. "wx" fails instead.
  const tmp = join(dir, ".INDEX.md.tmp");
  rmSync(tmp, { force: true });
  closeSync(openSync(tmp, "wx"));
  writeFileSync(tmp, out, "utf8");
  renameSync(tmp, join(dir, "INDEX.md"));
  console.log(`rules-index: INDEX.md written (${rows.length} cross-cutting file(s))`);
  return 0;
};

process.exit(main());
