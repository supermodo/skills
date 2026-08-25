// supermodo grammar loader — resolves a project's skills.config.json into the
// compiled names and regexes every docs script parses with. Shared by
// docs-check.ts and docs-generate.ts so the convention exists in ONE place.
//   (Node ≥ 22.18)

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { DEFAULTS, resolve as resolveGrammar } from "./grammar.ts";

// ── The project's grammar ──────────────────────────────────────────────────
// Every name, token and shape this script parses is resolved from the
// project's own skills.config.json (defaults where unset) — see
// config/scripts/grammar.ts. docs-check enforces THIS project's convention,
// not the package's: rename `work/` to `tasks/` or `P0..P3` to `now/next/later`
// and the same tree still validates.
//
// Tokens are escaped before they enter a RegExp even though config-check
// already rejects metacharacters in them: this script must also be correct
// against a config nobody validated.

export const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Alternation, not a character class: `^`, `-` and `]` all need position-
// dependent escaping inside a class, and one wrong state character would
// silently widen or void the match.
const alt = (xs: readonly string[]): string => `(?:${xs.map(esc).join("|")})`;

// Whole-tree mode is HANDED the project root, so its config is exactly
// <root>/skills.config.json — nothing to search for. `--item <dir>` is handed
// a staged triad deep inside the tree instead, so it walks up; but it stops at
// the repository boundary, because without that stop an item in a project with
// no config of its own would silently adopt an unrelated ancestor's grammar.
const findConfig = (start: string, walkUp: boolean): unknown => {
  const read = (dir: string): unknown => {
    const f = join(dir, "skills.config.json");
    if (!existsSync(f)) return undefined;
    try { return JSON.parse(readFileSync(f, "utf8")) as unknown; } catch { return undefined; }
  };
  const up = (dir: string, left: number): unknown => {
    const here = read(dir);
    const parent = dirname(dir);
    return here !== undefined ? here
      : existsSync(join(dir, ".git")) || left === 0 || parent === dir ? undefined
        : up(parent, left - 1);
  };
  const from = resolve(start);
  return walkUp ? up(from, 24) : read(from);
};

const at = (root: unknown, dotted: string): any =>
  dotted.split(".").reduce<any>((a, k) => (a === undefined || a === null ? undefined : a[k]), root);

export const buildGrammar = (start: string, walkUp: boolean) => {
  const r = resolveGrammar(DEFAULTS, findConfig(start, walkUp) ?? {});
  const L = (k: string): any => at(r, `docs.layout.${k}`);
  const g = (k: string): any => at(r, `docs.grammar.${k}`);
  const states: readonly string[] = [
    g("task.states.pending"), g("task.states.inProgress"),
    ...g("task.states.done"), ...g("task.states.paused"),
  ];
  const adrDigits: number = L("adr.digits");
  const adrNum = `\\d{${adrDigits}}`;
  const adrPre = esc(L("adr.prefix"));
  const decisions = esc(L("decisions"));
  const sep = esc(g("priority.separator"));
  const prio = esc(g("priority.label"));
  const src = esc(g("prioritySource.label"));
  const taskPrefix: string = g("task.markerPrefix");
  const V = (k: string): any => at(r, `vcs.commit.${k}`);
  const footer: string = V("breakingFooter");
  return Object.freeze({
    root: L("root") as string,
    work: L("work") as string,
    decisions: L("decisions") as string,
    reference: L("reference") as string,
    archive: L("archive") as string,
    backlog: L("backlog") as string,
    spec: L("triad.spec") as string,
    plan: L("triad.plan") as string,
    tasks: L("triad.tasks") as string,
    findings: L("triad.findings") as string,
    programReadme: L("program.readme") as string,
    adrPrefix: L("adr.prefix") as string,
    adrDigits,
    splitKb: L("splitThresholdKb") as number,
    taskPrefix,
    priorityLabel: g("priority.label") as string,
    sourceLabel: g("prioritySource.label") as string,
    derivedValue: g("prioritySource.derivedValue") as string,
    fromLabel: g("promotion.fromLabel") as string,
    idsLabel: g("promotion.idsLabel") as string,
    findingSections: g("finding.requiredSections") as readonly string[],
    extraSpec: g("extraRequired.spec") as readonly string[],
    extraBacklog: g("extraRequired.backlog") as readonly string[],
    adrShape: `${L("adr.prefix")}${"N".repeat(adrDigits)}-<slug>.md`,
    programKey: L("program.frontmatterKey") as string,
    initiativeDigits: L("program.initiativeDigits") as number,
    initiativeShape: `${"N".repeat(L("program.initiativeDigits"))}-<slug>/`,
    // regexes
    programKeyRe: new RegExp(`^${esc(L("program.frontmatterKey"))}:\\s*(.+)$`, "m"),
    initiativeRe: new RegExp(`^\\d{${L("program.initiativeDigits")}}-[a-z0-9-]+$`),
    checklistRe: new RegExp(`^\\s*- \\[${alt(states)}\\]`),
    taskMarkerRe: new RegExp(`<!--\\s*${esc(taskPrefix)}:([a-z0-9-]+)\\s*-->`),
    taskMarkerReG: (): RegExp => new RegExp(`<!--\\s*${esc(taskPrefix)}:([a-z0-9-]+)\\s*-->`, "g"),
    adrDirRe: new RegExp(`(^|/)${decisions}/[^/]+\\.md$`),
    adrFileRe: new RegExp(`(^|/)${decisions}/${adrPre}${adrNum}-[a-z0-9-]+\\.md$`),
    adrNameRe: new RegExp(`^${adrPre}(${adrNum})-`),
    adrStatusRe: new RegExp(`^(${[g("adrStatuses.proposed"), g("adrStatuses.accepted"), g("adrStatuses.rejected")].map(esc).join("|")}|${esc(g("adrStatuses.supersededBy"))}: ${adrPre}${adrNum})$`),
    priorityRe: new RegExp(`^${prio}:[ \\t]*${alt(g("priority.levels"))}[ \\t]*${sep}[ \\t]*${g("priority.requireClassification") ? "[^\\s:][^\\n:]*:[ \\t]*" : ""}\\S[^\\n]*$`, "m"),
    priorityLooseReG: (): RegExp => new RegExp(`^[ \\t]*${prio}[ \\t]*:.*$`, "gim"),
    sourceLooseReG: (): RegExp => new RegExp(`^[ \\t]*${src}[ \\t]*:[ \\t]*(.*?)[ \\t]*$`, "gim"),
    sourceDerivedRe: new RegExp(`^${src}:[ \\t]*${esc(g("prioritySource.derivedValue"))}[ \\t]*${sep}[ \\t]*\\S`, "m"),
    sourceShape: `${g("prioritySource.label")}: ${g("prioritySource.derivedValue")} ${g("priority.separator")} <what was assumed> <date>`,
    fromReG: (): RegExp => new RegExp(`^${esc(g("promotion.fromLabel"))}:[ \\t]*(\\S+)[ \\t]*$`, "gm"),
    fromRe: new RegExp(`^${esc(g("promotion.fromLabel"))}:[ \\t]*(\\S+)[ \\t]*$`, "m"),
    idsReG: (): RegExp => new RegExp(`^${esc(g("promotion.idsLabel"))}:[ \\t]*(.+?)[ \\t]*$`, "gm"),
    idsRe: new RegExp(`^${esc(g("promotion.idsLabel"))}:[ \\t]*(.+?)[ \\t]*$`, "m"),
    provenanceLooseReG: (): RegExp =>
      new RegExp(`^[ \\t]*(?:${esc(g("promotion.fromLabel"))}|${esc(g("promotion.idsLabel"))})[ \\t]*:.*$`, "gim"),
    navStart: `<!-- ${g("generated.navStart")} -->`,
    navEnd: `<!-- ${g("generated.navEnd")} -->`,
    fileMarker: `<!-- ${g("generated.fileMarker")} -->`,
    // The commit vocabulary: `commit` writes with it, `release` derives the
    // semver bump from it. One key, two skills — see CONSUMED_BY.
    commitTypes: V("types") as readonly string[],
    minorTypes: V("minorTypes") as readonly string[],
    breakingMarker: V("breakingMarker") as string,
    breakingFooter: footer,
    subjectSoftCap: V("subjectSoftCap") as number,
    subjectHardCap: V("subjectHardCap") as number,
    alphaPolicy: at(r, "release.alphaPolicy") as string,
    ccRe: new RegExp(`^(${(V("types") as string[]).map(esc).join("|")})(\\([^)]*\\))?(${esc(V("breakingMarker"))})?:\\s`),
    // The documented footer, tolerating the hyphenated spelling the spec allows.
    breakingFooterRe: new RegExp(`^${esc(footer).split(" ").join("[ -]")}:`, "m"),
    navStartName: g("generated.navStart") as string,
    navEndName: g("generated.navEnd") as string,
    fileMarkerName: g("generated.fileMarker") as string,
  });
};

// Resolved once at the CLI edge: the grammar is an input to the run, like the
// project root, and every check below reads it.
