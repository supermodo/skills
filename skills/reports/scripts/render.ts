// supermodo report renderer — .skills/supermodo/*.md → self-contained HTML.
// Usage (Node ≥ 22.18, zero dependencies), from the project root:
//   node render.ts                      everything + index, open the index
//   node render.ts --run <run-id>       one run page + index, open the run
//   node render.ts --report <path.md>   one report + index, open it
//   node render.ts --open | --no-open   override the configured open policy
//   node render.ts --root <dir>         project root (default: cwd)
//   node render.ts --store <dir>        report store (default: <root>/.skills/supermodo)
//
// Contract (../../protocols/references/reports.md): the .md files are the
// source of truth, this output is a projection. Best-effort by design —
// warnings go to stderr and the exit code is ALWAYS 0, because a render must
// never fail the flow stage that called it.

import { writeFileSync, renameSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, basename, relative, dirname } from "node:path";
import { spawn } from "node:child_process";
import { scan, contained, type Model } from "./lib/scan.ts";
import { runPage, reportPage, indexPage, navOf } from "./lib/page.ts";

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(name);
const value = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const warn = (msg: string): void => console.error(`reports: ${msg}`);

const root = resolve(value("--root") ?? process.cwd());
// --store points straight at a report store; used by the repo self-check so
// fixtures need not sit inside a (gitignored) .skills/ directory.
const store = resolve(value("--store") ?? join(root, ".skills", "supermodo"));

type Config = {
  readonly project?: { readonly name?: string };
  readonly docs?: { readonly entry?: string };
  readonly reports?: { readonly html?: boolean; readonly open?: string };
};

const config = ((): Config => {
  const file = join(root, "skills.config.json");
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, "utf8")) as Config; }
  catch { warn("skills.config.json unreadable — using defaults"); return {}; }
})();

const write = (file: string, html: string): boolean => {
  if (!contained(store, file)) {
    warn(`refusing to write outside .skills/supermodo: ${file}`);
    return false;
  }
  const tmp = `${file}.tmp`;
  try {
    writeFileSync(tmp, html, "utf8");
    renameSync(tmp, file);
    return true;
  } catch (e) {
    warn(`could not write ${relative(root, file)}: ${(e as Error).message}`);
    return false;
  }
};

const project = config.project?.name ?? basename(root);

// ── board staleness ─────────────────────────────────────────────────────────
// `next` recomputes the board from the docs on every run, so a board is never
// stale as a COMPUTATION — only this projection ages, and it ages the moment
// librarian writes a triad, a priority or a backlog entry. All this does is
// report that the newest board is older than the documents it was computed
// from; it never recomputes one, because selection semantics live in `next`
// and nowhere else.
//
// A coarse filesystem mtime is the RIGHT signal here, not a compromise: it also
// catches a hand-edited spec.md, a `git pull` and a checkbox ticked by `work` —
// none of which any skill-side hook could see. Its known lie is a fresh
// checkout, which resets mtimes and shows the banner over a current board; that
// costs one re-run, while the opposite error hides work the user added.

const mtimeOf = (path: string): number => {
  try { return statSync(path).mtimeMs; } catch { return 0; }
};

const newestMtime = (dir: string): number => {
  const entries = (() => {
    try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  })();
  return entries.reduce((newest, e) => {
    const path = join(dir, e.name);
    const at = e.isDirectory() ? newestMtime(path) : mtimeOf(path);
    return at > newest ? at : newest;
  }, 0);
};

// The board's only inputs are the triads and the backlog, both under
// <docs>/work/ (docs-convention.md). 0 means "unknown" — an absent work
// directory or a config that points somewhere unreadable never claims staleness.
const docsTouched = ((): number => {
  const entry = config.docs?.entry ?? "docs/README.md";
  // Config paths are project-relative with no `..` segments (config.md); a
  // config that breaks that rule gets no probe rather than an escape.
  return entry.includes("..") ? 0 : newestMtime(join(root, dirname(entry), "work"));
})();

const renderRun = (model: Model, id: string): string | undefined => {
  const run = model.runs.find((r) => r.id === id);
  if (run === undefined) { warn(`no such run: ${id}`); return undefined; }
  const file = join(run.dir, "report.html");
  return write(file, runPage(run, navOf(project, model))) ? file : undefined;
};

const renderReport = (model: Model, path: string): string | undefined => {
  const target = resolve(root, path);
  const report = model.reports.find((r) => resolve(r.file) === target);
  if (report === undefined) { warn(`no such report: ${path}`); return undefined; }
  const file = join(store, report.href);
  return write(file, reportPage(report, navOf(project, model))) ? file : undefined;
};

const renderAll = (model: Model): readonly string[] => [
  ...model.runs.map((r) => renderRun(model, r.id)),
  ...model.reports.map((r) => renderReport(model, r.file)),
].filter((f): f is string => f !== undefined);

// ── open policy ─────────────────────────────────────────────────────────────

// Deliberately NOT gated on isTTY: this script is normally spawned by a skill,
// so stdout is a pipe every time that matters. A pipe means "an agent ran me",
// not "there is no desktop" — gating on it disabled auto-open everywhere.
const headless = (): string | undefined =>
  process.env.CI !== undefined && process.env.CI !== "" ? "CI is set"
    : process.env.SSH_CONNECTION !== undefined && process.env.DISPLAY === undefined && process.platform !== "darwin"
      ? "SSH without a display"
      : process.platform === "linux" && process.env.DISPLAY === undefined && process.env.WAYLAND_DISPLAY === undefined
        ? "no display server"
        : undefined;

const shouldOpen = (isRun: boolean): boolean => {
  if (flag("--no-open")) return false;
  const mode = config.reports?.open ?? "auto";
  return flag("--open") || mode === "auto" || (mode === "flow" && isRun);
};

const openCommand = (): readonly string[] | undefined =>
  process.platform === "darwin" ? ["open"]
    : process.platform === "win32" ? ["cmd", "/c", "start", ""]
      : process.platform === "linux" ? ["xdg-open"]
        : undefined;

const openInBrowser = (file: string, isRun: boolean): void => {
  const url = `file://${file}`;
  if (!shouldOpen(isRun)) { console.log(url); return; }
  const why = headless();
  if (why !== undefined) { console.log(`${url}  (not opened: ${why})`); return; }
  const cmd = openCommand();
  if (cmd === undefined) { console.log(url); return; }
  try {
    spawn(cmd[0], [...cmd.slice(1), url], { detached: true, stdio: "ignore" }).unref();
    console.log(`opened ${url}`);
  } catch {
    console.log(url);
  }
};

// ── main ────────────────────────────────────────────────────────────────────

const main = (): void => {
  if (config.reports?.html === false) {
    console.log("reports: html rendering disabled (reports.html: false)");
    return;
  }
  if (!existsSync(store)) {
    console.log("reports: nothing to render (.skills/supermodo/ does not exist)");
    return;
  }
  const model = scan(store);
  const runId = value("--run");
  const reportPath = value("--report");

  const primary = runId !== undefined ? renderRun(model, runId)
    : reportPath !== undefined ? renderReport(model, reportPath)
      : undefined;
  const written = runId !== undefined || reportPath !== undefined
    ? (primary === undefined ? [] : [primary])
    : renderAll(model);

  const index = join(store, "index.html");
  const indexOk = write(index, indexPage(project, model, docsTouched));

  const show = (f: string): string => {
    const rel = relative(root, f);
    return rel.startsWith("..") ? f : rel;
  };
  written.forEach((f) => console.log(`wrote ${show(f)}`));
  if (indexOk) console.log(`wrote ${show(index)}`);

  const target = primary ?? (indexOk ? index : undefined);
  if (target !== undefined) openInBrowser(target, runId !== undefined);
};

try { main(); } catch (e) { warn(`${(e as Error).message}`); }
process.exit(0);
