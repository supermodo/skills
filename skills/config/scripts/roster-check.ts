// supermodo roster-check — validates the project's agent roster (`agents.dir`)
// against the multi-model engine layer (skills/protocols/references/models.md).
// Usage: node roster-check.ts <project-root> [agents.dir] [skills.config.json]
// Exit 0 = valid; exit 1 = invalid (errors on stderr, one per line).
//
// A ROLE is a roster file that declares `job: <class>`. A role names the engine
// class it needs and NOTHING about engines: `model:`, `effort:` or any alias in
// a role file would let the native harness pick an engine behind the broker
// and the user's approvals. Files without `job:` are not supermodo roles (the
// roster dir may hold a user's unrelated agents) and are left alone.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { parseJsonc } from "./jsonc.ts";
import { SHIPPED_CLASSES, isProjectClassName, isShippedClass, projectClassMap } from "./multimodel.ts";

type Front = Readonly<Record<string, string>>;

export const ROLE_CATEGORIES = ["implementers", "reviewers", "test-quality", "infra"] as const;
/** Frontmatter keys that select or shape an ENGINE — forbidden in a role file. */
export const ENGINE_KEYS = ["model", "effort", "alias", "provider", "reasoning", "thinking"] as const;

const frontmatter = (text: string): Front | undefined => {
  const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1];
  return block === undefined
    ? undefined
    : Object.fromEntries(
        block.split("\n")
          .map((l) => l.match(/^([a-zA-Z][a-zA-Z-]*):\s*(.*)$/))
          .filter((m): m is RegExpMatchArray => m !== null)
          .map((m) => [m[1], m[2].trim()]),
      );
};

const mdFiles = (dir: string): readonly string[] =>
  !existsSync(dir) || !statSync(dir).isDirectory() ? []
    : readdirSync(dir).filter((n) => n.endsWith(".md")).map((n) => join(dir, n)).sort();

const rel = (root: string, file: string): string => relative(root, file) || file;

/** Validate ONE role file's frontmatter. `projectClasses` = `multimodel.classes` resolved. */
export const checkRoleFront = (label: string, fm: Front | undefined, projectClasses: Readonly<Record<string, string>>): string[] => {
  if (fm === undefined || fm.job === undefined) return [];          // not a supermodo role
  const job = fm.job;
  const known = isShippedClass(job) || (isProjectClassName(job) && projectClasses[job] !== undefined);
  return [
    ...(known ? [] : [`${label}: job "${job}" is not a shipped class (${Object.keys(SHIPPED_CLASSES).join(" | ")}) nor a project class declared in skills.config.json → multimodel.classes — a reference never creates a class; fix the spelling or declare it`]),
    ...ENGINE_KEYS.filter((k) => fm[k] !== undefined)
      .map((k) => `${label}: "${k}:" is not allowed in a role file — a role declares the engine CLASS it needs (job: ${job}) and the user's registry assigns the engine; remove "${k}:" (run \`config --upgrade\` to migrate every role file)`),
    ...(fm.category !== undefined && !(ROLE_CATEGORIES as readonly string[]).includes(fm.category)
      ? [`${label}: category must be one of ${ROLE_CATEGORIES.join(" | ")}`] : []),
  ];
};

export const checkRoster = (root: string, dir: string, projectClasses: Readonly<Record<string, string>>): string[] =>
  mdFiles(resolve(root, dir)).flatMap((file) =>
    checkRoleFront(rel(root, file), frontmatter(readFileSync(file, "utf8")), projectClasses));

export type RosterRole = { readonly stem: string; readonly category: string; readonly job: string; readonly body: string; readonly file: string };

/** The roster's ROLES (files declaring `job:`), with their instruction bodies. Non-role files are skipped. */
export const readRoster = (root: string, dir: string): readonly RosterRole[] =>
  mdFiles(resolve(root, dir)).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    const fm = frontmatter(text);
    if (fm === undefined || fm.job === undefined) return [];
    const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
    return [{ stem: basename(file, ".md"), category: fm.category ?? "", job: fm.job, body, file }];
  });

const readProjectClasses = (configFile: string): Readonly<Record<string, string>> => {
  try {
    const cfg = parseJsonc(readFileSync(configFile, "utf8")) as { multimodel?: { classes?: unknown } };
    return projectClassMap(cfg?.multimodel?.classes as never);
  } catch {
    return {};
  }
};

const main = (): number => {
  const root = resolve(process.argv[2] ?? ".");
  const dir = process.argv[3] ?? ".supermodo/agents";
  const configFile = resolve(root, process.argv[4] ?? "skills.config.json");
  const errors = checkRoster(root, dir, readProjectClasses(configFile));
  errors.forEach((e) => console.error(`roster-check: ${e}`));
  if (errors.length > 0) return 1;
  console.log(`roster-check: ${dir} valid (${mdFiles(resolve(root, dir)).length} file(s))`);
  return 0;
};

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith("roster-check.ts")) process.exit(main());
