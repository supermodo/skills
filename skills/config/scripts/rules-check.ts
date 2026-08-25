// supermodo rules-check — zero-dependency validator for .supermodo/rules/ (v1).
// Usage: node rules-check.ts [project-root]   (Node ≥ 22.18)
// Exit 0 = valid, or no .supermodo/rules/ at all; exit 1 = invalid.
//
// Deliberately independent of skills.config.json: commit and release are
// config-optional, and their process is exactly what a config-less project
// wants to pin. Folding this into config-check.ts would make that case
// unreachable. Contract: ../../protocols/references/rules.md

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 4096;

// This script ships inside the config skill, so its siblings ARE the installed
// roster — which is what `applies-to` is validated against.
const skillsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const installedSkills = (): readonly string[] =>
  readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

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

const isCrossCutting = (stem: string, appliesTo: readonly string[]): boolean =>
  appliesTo.length > 1 || (appliesTo.length === 1 && appliesTo[0] !== stem);

// The canonical INDEX row for a cross-cutting file, derived from frontmatter.
// rules-index.ts writes exactly this string, so the generator and the
// validator agree by construction rather than by hope.
const canonicalRow = (file: string, fm: Front): string =>
  `| ${file} | ${list(fm["applies-to"]).join(", ")} | ${fm.description ?? ""} |`;

const validateFile = (dir: string, file: string, skills: readonly string[]): readonly string[] => {
  const stem = file.replace(/\.md$/, "");
  const path = join(dir, file);
  const bytes = statSync(path).size;
  const fm = frontmatter(readFileSync(path, "utf8"));
  if (fm === undefined) {
    return [`${file}: no frontmatter — every rules file declares rule, description, template, template-version`];
  }
  const appliesTo = list(fm["applies-to"]);
  return [
    ...(bytes > MAX_BYTES
      ? [`${file}: ${bytes} bytes (cap ${MAX_BYTES}) — a process this long is transcribing machinery, not sequence`]
      : []),
    ...(fm.rule === stem
      ? []
      : [`${file}: rule ${JSON.stringify(fm.rule ?? null)} != filename stem "${stem}" — skills read this file by filename`]),
    ...(fm.description === undefined || fm.description.length === 0
      ? [`${file}: description required — it is the row the INDEX shows`]
      : []),
    ...(fm.template === undefined || fm.template.length === 0
      ? [`${file}: template required — it names the shipped starting point drift diffs against`]
      : []),
    ...(/^\d+\.\d+\.\d+$/.test(fm["template-version"] ?? "")
      ? []
      : [`${file}: template-version must be semver, got ${JSON.stringify(fm["template-version"] ?? null)}`]),
    ...appliesTo
      .filter((s) => !skills.includes(s))
      .map((s) => `${file}: applies-to names "${s}", which is not an installed skill`),
    ...(new Set(appliesTo).size !== appliesTo.length ? [`${file}: duplicate entries in applies-to`] : []),
    ...(!skills.includes(stem) && appliesTo.length === 0
      ? [`${file}: "${stem}" is not a skill name, so applies-to is required — nothing would ever read this file`]
      : []),
  ];
};

const indexRows = (text: string): readonly string[] =>
  text.split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\|\s*[^|\s]+\.md\s*\|/.test(l));

const validateIndex = (dir: string, expected: readonly string[]): readonly string[] => {
  const path = join(dir, "INDEX.md");
  if (!existsSync(path)) {
    return expected.length === 0
      ? []
      : [`INDEX.md: missing, but ${expected.length} cross-cutting file(s) need routing — run rules-index.ts`];
  }
  const text = readFileSync(path, "utf8");
  const rows = indexRows(text);
  const bytes = statSync(path).size;
  return [
    // INDEX is a file like any other and counts against the invocation budget.
    ...(bytes > MAX_BYTES ? [`INDEX.md: ${bytes} bytes (cap ${MAX_BYTES})`] : []),
    ...(text.includes("<!-- supermodo:generated -->")
      ? []
      : ["INDEX.md: missing the <!-- supermodo:generated --> marker — it is generated in its entirety, never hand-edited"]),
    // Compare WHOLE ROWS, not just filenames. A row whose applies-to or
    // description disagrees with the file's frontmatter routes the file to the
    // wrong skills while every filename-only set comparison still agrees.
    ...expected.filter((r) => !rows.includes(r))
      .map((r) => `INDEX.md: missing or altered row — expected exactly:\n    ${r}`),
    ...rows.filter((r) => !expected.includes(r))
      .map((r) => `INDEX.md: unexpected row (not derivable from any file's frontmatter):\n    ${r}`),
  ];
};

const main = (): number => {
  const root = process.argv[2] ?? process.cwd();
  const dir = join(root, ".supermodo/rules");
  if (!existsSync(dir)) {
    console.log("rules-check: no .supermodo/rules/ — nothing to validate");
    return 0;
  }
  const skills = installedSkills();
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "INDEX.md").sort();
  const expectedRows = files.flatMap((f) => {
    const fm = frontmatter(readFileSync(join(dir, f), "utf8"));
    return fm !== undefined && isCrossCutting(f.replace(/\.md$/, ""), list(fm["applies-to"]))
      ? [canonicalRow(f, fm)]
      : [];
  });
  const errors = [
    ...files.flatMap((f) => validateFile(dir, f, skills)),
    ...validateIndex(dir, expectedRows),
  ];
  errors.forEach((e) => console.error(`rules-check: ${e}`));
  if (errors.length > 0) return 1;
  console.log(`rules-check: ${files.length} rules file(s) valid`);
  return 0;
};

process.exit(main());
