// supermodo roster-migrate — moves role files onto the engine layer
// (skills/protocols/references/models.md → Migration). Runs from `config --upgrade`
// independently of `configVersion`.
// Usage (Node ≥ 22.18):
//   node roster-migrate.ts scan  <project-root> [agents.dir]      → JSON proposal { rows: [{file, engineKeys, job}] }
//   node roster-migrate.ts apply <project-root> <table.json>      → rewrites the approved rows temp-then-rename
// A row's `job` is the class the file will declare; the engine keys are deleted; the body is untouched.

import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { ENGINE_KEYS, ROLE_CATEGORIES } from "./roster-check.ts";
import { isProjectClassName, isShippedClass } from "./multimodel.ts";

type Row = { readonly file: string; readonly engineKeys: readonly string[]; readonly job: string; readonly category?: string };

const DEFAULT_BY_CATEGORY: Readonly<Record<string, string>> = {
  implementers: "code-generation", reviewers: "adversary", "test-quality": "adversary", infra: "leg-work",
};
const CATEGORY_HINTS: readonly (readonly [RegExp, string])[] = [
  [/review|audit|critic|qa/i, "reviewers"], [/test|quality|coverage/i, "test-quality"],
  [/infra|deploy|ci|ops|pipeline/i, "infra"], [/implement|engineer|builder|developer|dev/i, "implementers"],
];

const split = (text: string): { front: string | undefined; body: string } => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  return m ? { front: m[1], body: text.slice(m[0].length) } : { front: undefined, body: text };
};
const fieldsOf = (front: string): Readonly<Record<string, string>> =>
  Object.fromEntries(front.split("\n").map((l) => l.match(/^([a-zA-Z][a-zA-Z-]*):\s*(.*)$/)).filter((m): m is RegExpMatchArray => m !== null).map((m) => [m[1], m[2].trim()]));

const guessCategory = (stem: string, fm: Readonly<Record<string, string>>): string | undefined =>
  (ROLE_CATEGORIES as readonly string[]).includes(fm.category ?? "") ? fm.category
    : CATEGORY_HINTS.find(([re]) => re.test(`${stem} ${fm.description ?? ""}`))?.[1];

const mdFiles = (dir: string): readonly string[] =>
  !existsSync(dir) || !statSync(dir).isDirectory() ? [] : readdirSync(dir).filter((n) => n.endsWith(".md")).map((n) => join(dir, n)).sort();

/** Files that are roles (declare job:) or look like roles that predate the engine layer (carry an engine key). */
export const scan = (root: string, dir: string): readonly Row[] =>
  mdFiles(resolve(root, dir)).flatMap((file) => {
    const { front } = split(readFileSync(file, "utf8"));
    if (front === undefined) return [];
    const fm = fieldsOf(front);
    const engineKeys = ENGINE_KEYS.filter((k) => fm[k] !== undefined);
    if (fm.job === undefined && engineKeys.length === 0) return [];           // not a role, not legacy
    if (fm.job !== undefined && engineKeys.length === 0) return [];           // already migrated
    const category = guessCategory(basename(file, ".md"), fm);
    const job = fm.job ?? (category !== undefined ? DEFAULT_BY_CATEGORY[category] : "adversary");
    return [{ file: relative(root, file), engineKeys, job, ...(category ? { category } : {}) }];
  });

const rewriteFront = (front: string, job: string): string =>
  [...front.split("\n").filter((l) => !ENGINE_KEYS.some((k) => l.startsWith(`${k}:`)) && !l.startsWith("job:")), `job: ${job}`].join("\n");

export const apply = (root: string, rows: readonly Row[], projectClasses: Readonly<Record<string, string>> = {}): readonly string[] =>
  rows.map((row) => {
    const abs = resolve(root, row.file);
    if (!abs.startsWith(resolve(root))) return `${row.file}: outside the project root — skipped`;
    if (!(isShippedClass(row.job) || (isProjectClassName(row.job) && projectClasses[row.job] !== undefined))) return `${row.file}: "${row.job}" is not a declared class — skipped`;
    const text = readFileSync(abs, "utf8");
    const { front, body } = split(text);
    if (front === undefined) return `${row.file}: no frontmatter — skipped`;
    const next = `---\n${rewriteFront(front, row.job)}\n---\n${body}`;
    const tmp = `${abs}.${process.pid}.tmp`;
    writeFileSync(tmp, next, "utf8");
    renameSync(tmp, abs);
    return `${row.file}: job: ${row.job}; removed ${ENGINE_KEYS.filter((k) => fieldsOf(front)[k] !== undefined).join(", ") || "nothing"}`;
  });

const main = (): number => {
  const [cmd, rootArg, third] = process.argv.slice(2);
  const root = resolve(rootArg ?? ".");
  if (cmd === "scan") {
    console.log(JSON.stringify({ rows: scan(root, third ?? ".supermodo/agents") }, null, 2));
    return 0;
  }
  if (cmd === "apply") {
    if (third === undefined) { console.error("roster-migrate: apply <project-root> <table.json>"); return 1; }
    const table = JSON.parse(readFileSync(resolve(third), "utf8")) as { rows: Row[] };
    apply(root, table.rows).forEach((line) => console.log(`roster-migrate: ${line}`));
    return 0;
  }
  console.error("usage: roster-migrate.ts scan <root> [agents.dir] | apply <root> <table.json>");
  return 1;
};

if (basename(process.argv[1] ?? "") === "roster-migrate.ts") process.exit(main());
