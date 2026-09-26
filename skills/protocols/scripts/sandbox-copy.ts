// Disposable read-only workspace for an adapter without a native read-only
// mode (agy): the seat reads a copy the OS sandbox confines, never the project.
// The copy holds committable files only — tracked + untracked-not-ignored when
// the project is a git repo (no .git, no .env or other ignored files), else a
// default exclude list — plus any file the brief names explicitly. A
// before/after hash shows whether the seat broke its read-only contract.
import { execFileSync } from "node:child_process";
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

export type Manifest = Readonly<Record<string, string>>;
export type SandboxCopy = { readonly dir: string; readonly manifest: Manifest; readonly files: number };

const EXCLUDE_DIRS = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", "target", ".next", ".cache", "coverage", "cov_profile"]);
const EXCLUDE_FILE = /^(\.env(\..*)?|.*\.(pem|key|p12|pfx|keystore)|id_(rsa|ed25519|ecdsa)(\.pub)?|\.npmrc|\.pypirc|\.netrc|credentials(\.json)?)$/i;

const walk = (root: string, dir: string = root): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (EXCLUDE_DIRS.has(e.name) ? [] : walk(root, join(dir, e.name)))
    : e.isFile() && !EXCLUDE_FILE.test(e.name) ? [relative(root, join(dir, e.name))] : []);

const gitFiles = (root: string): readonly string[] | undefined => {
  try {
    return execFileSync("git", ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
      .split("\0").filter((f) => f.length > 0 && !EXCLUDE_FILE.test(f.split("/").pop() ?? ""));
  } catch { return undefined; }
};

/** Files under root that the brief names (absolute or root-relative): copied even when ignored, so the seat can read its artefacts. */
// Contained = the real path (symlinks resolved) stays under the real root; anything else is never copied.
const within = (realRoot: string, p: string): boolean => {
  try { const real = realpathSync(p); return real.startsWith(realRoot + sep) && lstatSync(p).isFile(); } catch { return false; }
};

export const namedFiles = (root: string, brief: string): readonly string[] => {
  const realRoot = realpathSync(root);
  return [...new Set([...brief.matchAll(/[\w./@-]+\.[A-Za-z0-9]+/g)].map((m) => m[0]))]
    .map((p) => resolve(root, p))
    .filter((abs) => !abs.split(sep).includes(".git") && within(realRoot, abs))
    .map((abs) => relative(realRoot, realpathSync(abs)));
};

const hashOf = (f: string): string => createHash("sha1").update(readFileSync(f)).digest("hex");

export const manifestOf = (dir: string): Manifest =>
  Object.fromEntries(walkAll(dir).map((f) => [f, hashOf(join(dir, f))]));

const walkAll = (root: string, dir: string = root): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkAll(root, join(dir, e.name)) : e.isFile() ? [relative(root, join(dir, e.name))] : []);

export const makeCopy = (root: string, brief: string): SandboxCopy => {
  const dir = mkdtempSync(join(tmpdir(), "supermodo-seat-"));
  const files = [...new Set([...(gitFiles(root) ?? walk(root)), ...namedFiles(root, brief)])];
  files.forEach((f) => {
    const src = join(root, f);
    // Regular files only: a symlink is never copied (its target may sit outside the project), nor a tracked-but-deleted path.
    if (!existsSync(src) || !lstatSync(src).isFile()) return;
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(src, join(dir, f), constants.COPYFILE_FICLONE);   // APFS/btrfs clone when available, plain copy otherwise
  });
  return { dir, manifest: manifestOf(dir), files: files.length };
};

// Output of legitimate experiments (a test run's dependency install, caches,
// build output) lands in folders that are never copied; it is not a breach.
const isGenerated = (f: string): boolean => f.split(sep).some((seg) => EXCLUDE_DIRS.has(seg));

/** Copied or new files added, removed or changed since the copy was made (generated folders ignored). */
export const changesIn = (copy: SandboxCopy): readonly string[] => {
  const after = Object.fromEntries(Object.entries(manifestOf(copy.dir)).filter(([f]) => !isGenerated(f)));
  const keys = new Set([...Object.keys(copy.manifest), ...Object.keys(after)]);
  return [...keys].filter((k) => copy.manifest[k] !== after[k]).sort();
};

export const removeCopy = (copy: SandboxCopy): void => rmSync(copy.dir, { recursive: true, force: true });
