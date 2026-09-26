// The patch path — an external `code-generation` seat authors a patch as TEXT;
// the broker (never the host model) applies it atomically and can reverse it
// from journaled pre-images. Contract: references/models.md → "The patch path".
//
// Patch format (JSON): { "files": [ { "path": "src/a.ts", "content": "<whole file>" }
//                                 | { "path": "src/b.ts", "replace": [ { "search": "<exact text>", "with": "<text>" } ] }
//                                 | { "path": "src/c.ts", "delete": true } ] }
// Never unified diffs. Every block is dry-run before ANY write; a failed dry-run
// leaves the tree byte-identical. Paths are project-relative, POSIX, no "..",
// never under .git/, never a supermodo/agent config file.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

type Replace = { readonly search: string; readonly with: string };
type FilePatch = { readonly path: string; readonly content?: string; readonly replace?: readonly Replace[]; readonly delete?: true };
export type Patch = { readonly files: readonly FilePatch[] };
type Pre = { readonly path: string; readonly existed: boolean; readonly content: string | null };
export type Journal = { readonly run: string; readonly at: string; readonly root: string; readonly pre: readonly Pre[]; readonly post: readonly { path: string; hash: string | null }[] };

const PROTECTED = [".git/", "CLAUDE.md", "AGENTS.md", ".claude/", ".codex/", ".gemini/", ".supermodo/", ".mcp.json", "skills.config.json"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const pathError = (p: unknown): string | undefined =>
  typeof p !== "string" || p.length === 0 ? "path: non-empty string"
    : p.startsWith("/") || p.includes("\\") || p.split("/").includes("..") ? `path "${p}": project-relative POSIX path without ".."`
    : PROTECTED.some((x) => p === x || p.startsWith(x)) ? `path "${p}": protected (git, agent/host configuration, supermodo files) — a patch never touches it`
    : undefined;

/** Shape check only — no filesystem access. */
export const checkPatch = (v: unknown): string[] => {
  if (!isObj(v) || !Array.isArray(v.files)) return ['patch: { "files": [...] }'];
  const errs = v.files.flatMap((f, i) => {
    const ctx = `files[${i}]`;
    if (!isObj(f)) return [`${ctx}: object expected`];
    const modes = ["content", "replace", "delete"].filter((k) => f[k] !== undefined);
    return [
      ...(pathError(f.path) !== undefined ? [`${ctx}.${pathError(f.path)}`] : []),
      ...(modes.length !== 1 ? [`${ctx}: exactly one of content | replace | delete`] : []),
      ...(f.content !== undefined && typeof f.content !== "string" ? [`${ctx}.content: string`] : []),
      ...(f.delete !== undefined && f.delete !== true ? [`${ctx}.delete: literal true`] : []),
      ...(f.replace !== undefined && (!Array.isArray(f.replace) || f.replace.length === 0 || !f.replace.every((r) => isObj(r) && typeof r.search === "string" && r.search.length > 0 && typeof r.with === "string"))
        ? [`${ctx}.replace: non-empty array of { search, with } with a non-empty search`] : []),
    ];
  });
  const paths = v.files.map((f) => (isObj(f) ? f.path : undefined));
  return [...errs, ...(new Set(paths).size !== paths.length ? ["patch: a path appears more than once"] : [])];
};

const hash = (s: string): string => {
  const h = [...Buffer.from(s, "utf8")].reduce((a, b) => ((a * 33) ^ b) >>> 0, 5381);
  return h.toString(16);
};

const applyReplaces = (text: string, rs: readonly Replace[]): { text?: string; error?: string } =>
  rs.reduce<{ text?: string; error?: string }>((acc, r, i) => {
    if (acc.error !== undefined || acc.text === undefined) return acc;
    const n = acc.text.split(r.search).length - 1;
    return n === 1 ? { text: acc.text.replace(r.search, () => r.with) }
      : { error: `replace[${i}]: search text found ${n} times (must be exactly once)` };
  }, { text });

/** Dry-run every block against the tree; returns the full post-state or the first error per file. */
const dryRun = (root: string, patch: Patch): { ok: true; post: readonly { path: string; content: string | null }[]; pre: readonly Pre[] } | { ok: false; errors: readonly string[] } => {
  const results = patch.files.map((f) => {
    const abs = resolve(root, f.path);
    if (!abs.startsWith(resolve(root) + sep)) return { error: `${f.path}: escapes the project root` };
    const existed = existsSync(abs);
    if (existed && statSync(abs).isDirectory()) return { error: `${f.path}: is a directory` };
    const current = existed ? readFileSync(abs, "utf8") : null;
    const pre: Pre = { path: f.path, existed, content: current };
    if (f.delete === true) return existed ? { pre, post: { path: f.path, content: null } } : { error: `${f.path}: delete of a missing file` };
    if (f.content !== undefined) return { pre, post: { path: f.path, content: f.content } };
    if (current === null) return { error: `${f.path}: replace on a missing file` };
    const r = applyReplaces(current, f.replace as readonly Replace[]);
    return r.error !== undefined ? { error: `${f.path}: ${r.error}` } : { pre, post: { path: f.path, content: r.text as string } };
  });
  const errors = results.flatMap((r) => ("error" in r && r.error !== undefined ? [r.error] : []));
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, post: results.map((r) => (r as { post: { path: string; content: string | null } }).post), pre: results.map((r) => (r as { pre: Pre }).pre) };
};

const writeAtomic = (abs: string, content: string): void => {
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.tmp`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, abs);
};

/** Apply: dry-run all, then write all; journal pre-images for reverse-apply. Throws before any write on error. */
export const applyPatch = (root: string, patch: Patch, run: string): Journal => {
  const shape = checkPatch(patch);
  if (shape.length > 0) throw new Error(shape.join("; "));
  const dry = dryRun(root, patch);
  if (!dry.ok) throw new Error(`dry-run failed, tree untouched: ${dry.errors.join("; ")}`);
  dry.post.forEach((p) => (p.content === null ? rmSync(resolve(root, p.path), { force: true }) : writeAtomic(resolve(root, p.path), p.content)));
  const journal: Journal = {
    run, at: new Date().toISOString(), root: resolve(root), pre: dry.pre,
    post: dry.post.map((p) => ({ path: p.path, hash: p.content === null ? null : hash(p.content) })),
  };
  const dir = join(root, ".skills", "supermodo", "patches");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${run}-${Date.now()}.journal.json`), `${JSON.stringify(journal, null, 2)}\n`);
  return journal;
};

/** Reverse-apply from the journal — refuses any file edited since the patch (hash mismatch) and reports what needs a hand. */
export const revertPatch = (journal: Journal): { reverted: readonly string[]; refused: readonly string[] } => {
  const root = journal.root;
  const current = journal.post.map((p) => {
    const abs = resolve(root, p.path);
    const now = existsSync(abs) ? hash(readFileSync(abs, "utf8")) : null;
    return { path: p.path, intact: now === p.hash };
  });
  const refused = current.filter((c) => !c.intact).map((c) => c.path);
  if (refused.length > 0) return { reverted: [], refused };
  journal.pre.forEach((p) => {
    const abs = resolve(root, p.path);
    if (!p.existed) rmSync(abs, { force: true });
    else writeAtomic(abs, p.content as string);
  });
  return { reverted: journal.pre.map((p) => p.path), refused: [] };
};
