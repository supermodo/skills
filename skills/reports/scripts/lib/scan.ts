// Read .skills/supermodo/ into a model. Tolerant by contract: an unreadable
// or unparseable report becomes an item marked `unreadable` — the orchestrator
// already failed that stage; the renderer shows, it never judges.

import { readdirSync, readFileSync, existsSync, statSync, realpathSync } from "node:fs";
import { join, relative, sep, dirname, basename } from "node:path";
import { parseFrontmatter, str, list } from "./frontmatter.ts";

export type Stage = {
  readonly order: string;
  readonly skill: string;
  readonly status: string;
  readonly summary: string;
  readonly questions: readonly string[];
  readonly drift: readonly string[];
  readonly decisions: readonly string[];
  readonly body: string;
  readonly unreadable: boolean;
  readonly gate: boolean;
};

export type Run = {
  readonly kind: "run";
  readonly id: string;
  readonly dir: string;
  readonly task: string;
  readonly stamp: string;
  readonly stages: readonly Stage[];
  readonly live: boolean;
  readonly status: string;
  readonly needsYou: readonly string[];
  readonly href: string;
};

export type Report = {
  readonly kind: "report" | "release";
  readonly id: string;
  readonly file: string;
  readonly skill: string;
  readonly task: string;
  readonly stamp: string;
  readonly status: string;
  readonly summary: string;
  readonly questions: readonly string[];
  readonly body: string;
  readonly unreadable: boolean;
  readonly needsYou: readonly string[];
  readonly href: string;
};

export type Model = { readonly runs: readonly Run[]; readonly reports: readonly Report[] };

/** Mandatory gates, by stage-file order prefix (see flow's eight stages). */
const GATES = new Set(["05", "06b"]);

/**
 * The only `status` values a report may declare (reports.md). Anything else is
 * treated as unreadable rather than passed through: `needsYou` matches these
 * strings exactly, so a typo like `needs_input` or `failure` would otherwise
 * render as an ordinary healthy row and drop out of the alert surface — the
 * one place the user looks to find what went wrong.
 */
const STATUSES = new Set(["ok", "failed", "needs-input", "skipped"]);

const readText = (file: string): string | undefined => {
  try { return readFileSync(file, "utf8"); } catch { return undefined; }
};

const dirsOf = (dir: string): readonly string[] => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch { return []; }
};

const mdOf = (dir: string): readonly string[] => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name).sort();
  } catch { return []; }
};

/**
 * Containment (reports.md): resolve symlinks and refuse anything that leaves
 * the project's real .skills/supermodo/.
 */
export const contained = (root: string, path: string): boolean => {
  // A file about to be written does not exist yet, so resolve the nearest
  // existing ancestor and re-attach the remainder — otherwise a symlinked
  // parent (/var → /private/var) reads as an escape.
  const realOf = (p: string): string => {
    if (existsSync(p)) return realpathSync(p);
    const parent = dirname(p);
    return parent === p ? p : join(realOf(parent), basename(p));
  };
  try {
    const rel = relative(realOf(root), realOf(path));
    return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`${sep}`));
  } catch { return false; }
};

const stampOf = (name: string): string => name.match(/^(\d{8}-\d{6})/)?.[1] ?? "";

export const dateOf = (stamp: string): string =>
  stamp === "" ? "" : `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;

export const timeOf = (stamp: string): string =>
  stamp === "" ? "" : `${stamp.slice(9, 11)}:${stamp.slice(11, 13)}`;

const stageOf = (dir: string, name: string): Stage => {
  const order = name.match(/^(\d+[a-z]?)-/)?.[1] ?? "";
  const raw = readText(join(dir, name));
  if (raw === undefined) {
    return { order, skill: name.replace(/\.md$/, ""), status: "unreadable", summary: "", questions: [], drift: [], decisions: [], body: "", unreadable: true, gate: GATES.has(order) };
  }
  const { fm, body, hadFm } = parseFrontmatter(raw);
  const skill = str(fm, "skill") || name.replace(/^\d+[a-z]?-/, "").replace(/\.md$/, "");
  const status = str(fm, "status");
  const valid = hadFm && STATUSES.has(status);
  return {
    order,
    skill,
    status: valid ? status : "unreadable",
    summary: str(fm, "summary"),
    questions: list(fm, "questions"),
    drift: list(fm, "drift_notes"),
    decisions: list(fm, "decisions"),
    body,
    unreadable: !valid,
    gate: GATES.has(order),
  };
};

const runNeedsYou = (stages: readonly Stage[], live: boolean): readonly string[] => [
  ...stages.filter((s) => s.status === "failed").map((s) => `${s.skill} failed`),
  ...stages.filter((s) => s.status === "needs-input").map((s) => `${s.skill} needs input`),
  ...(stages.flatMap((s) => s.questions).length > 0
    ? [`${stages.flatMap((s) => s.questions).length} open question(s)`] : []),
  ...(live || stages.length === 0 ? []
    : stages.some((s) => s.gate) && stages.filter((s) => s.gate).every((s) => s.status === "ok")
      ? [] : ["a mandatory gate never went green"]),
];

const runStatus = (stages: readonly Stage[], live: boolean): string =>
  stages.some((s) => s.status === "failed") ? "failed"
    : live ? "running"
      : stages.some((s) => s.status === "needs-input") ? "needs-input"
        : stages.length === 0 ? "unreadable"
          : stages.every((s) => s.status === "ok" || s.status === "skipped") ? "ok" : "partial";

const isLive = (dir: string): boolean => {
  const raw = readText(join(dir, "state.json"));
  if (raw === undefined) return false;
  try {
    const state = JSON.parse(raw) as { status?: unknown };
    return state.status === "running";
  } catch { return false; }
};

const readRun = (root: string, id: string): Run | undefined => {
  const dir = join(root, "runs", id);
  if (!contained(root, dir)) return undefined;
  const stages = mdOf(dir).filter((n) => /^\d/.test(n)).map((n) => stageOf(dir, n));
  const live = isLive(dir);
  return {
    kind: "run",
    id,
    dir,
    task: id.replace(/^\d{8}-\d{6}-?/, "") || id,
    stamp: stampOf(id),
    stages,
    live,
    status: runStatus(stages, live),
    needsYou: runNeedsYou(stages, live),
    href: `runs/${id}/report.html`,
  };
};

const readReport = (root: string, skillDir: string, name: string): Report | undefined => {
  const file = join(root, skillDir, name);
  if (!contained(root, file)) return undefined;
  const raw = readText(file);
  const parsed = raw === undefined ? undefined : parseFrontmatter(raw);
  const fm = parsed?.fm ?? {};
  const status = str(fm, "status");
  // reports.md makes `skill`, `status` and `summary` required of EVERY report,
  // and standalone reports have no orchestrator to validate them fail-closed —
  // this scanner is their only reader, so it enforces the contract here.
  // Showing a contract violation as `unreadable` is still "show, never judge":
  // it reports that the file does not meet the format, not that the work failed.
  const unreadable = parsed === undefined || !parsed.hadFm
    || !STATUSES.has(status)
    || str(fm, "skill") === "" || str(fm, "summary") === "";
  const questions = list(fm, "questions");
  const base = name.replace(/\.md$/, "");
  return {
    kind: skillDir === "release" ? "release" : "report",
    id: `${skillDir}/${base}`,
    file,
    // The directory is a DISPLAY fallback only — it never satisfies the
    // required field above, so a missing `skill` still reads as unreadable.
    skill: str(fm, "skill") || skillDir,
    task: str(fm, "task"),
    stamp: stampOf(name),
    status: unreadable ? "unreadable" : status,
    summary: str(fm, "summary"),
    questions,
    body: parsed?.body ?? "",
    unreadable,
    needsYou: [
      ...(status === "failed" ? ["failed"] : []),
      ...(status === "needs-input" ? ["needs input"] : []),
      ...(questions.length > 0 ? [`${questions.length} open question(s)`] : []),
    ],
    href: `${skillDir}/${base}.html`,
  };
};

const byStampDesc = <T extends { readonly stamp: string; readonly id: string }>(a: T, b: T): number =>
  a.stamp === b.stamp ? (a.id < b.id ? 1 : -1) : (a.stamp < b.stamp ? 1 : -1);

/** Whole archive, newest first. Deterministic for a given tree. */
export const scan = (root: string): Model => {
  if (!existsSync(root) || !statSync(root).isDirectory()) return { runs: [], reports: [] };
  const runs = dirsOf(join(root, "runs"))
    .map((id) => readRun(root, id))
    .filter((r): r is Run => r !== undefined)
    .sort(byStampDesc);
  const reports = dirsOf(root)
    .filter((d) => d !== "runs")
    .flatMap((d) => mdOf(join(root, d)).map((n) => readReport(root, d, n)))
    .filter((r): r is Report => r !== undefined)
    .sort(byStampDesc);
  return { runs, reports };
};
