// Two defences against a project-supplied regular expression that backtracks
// exponentially. JavaScript has no regex timeout and V8 is a backtracking
// engine: `^((a+)+)$` spent 19 seconds of CPU on one small file, and two
// trivial rewrites of it (`^((a)+)+$`, `^(a|a)+$`) walked straight past a
// guard that knew only the first shape.
//
//   1. `dangerousPattern` is a static screen: a repeated group whose body
//      itself repeats or branches — every shape that has actually hung the
//      preflight. It runs where the value is validated (config-check) AND
//      where it is compiled (release-check), because config-check may never
//      have been run. It is not a proof of safety; that is a hard problem.
//   2. `matchWithin` runs the pattern in a child process under a hard budget,
//      so whatever the screen misses costs a fraction of a second, not a hang.
import { execFileSync } from "node:child_process";

// The pattern with escapes and character-class bodies blanked to `x`, so the
// only ( ) | + * { left are the ones that shape the match.
const structure = (src: string): string =>
  [...src].reduce<{ readonly out: string; readonly esc: boolean; readonly cls: boolean }>(
    (s, ch) =>
      s.esc ? { out: s.out + "x", esc: false, cls: s.cls }
      : ch === "\\" ? { out: s.out + "x", esc: true, cls: s.cls }
      : s.cls ? { out: s.out + (ch === "]" ? "]" : "x"), esc: false, cls: ch !== "]" }
      : ch === "[" ? { out: s.out + "[", esc: false, cls: true }
      : { out: s.out + ch, esc: false, cls: false },
    { out: "", esc: false, cls: false },
  ).out;

// `+`, `*`, or a counted `{n}` / `{n,}` / `{n,m}` starting at position i.
const quantifierAt = (st: string, i: number): boolean =>
  st[i] === "+" || st[i] === "*" || (st[i] === "{" && /^\{\d+(?:,\d*)?\}/.test(st.slice(i)));

// (open, close) index pairs of every group.
const groups = (st: string): readonly (readonly [number, number])[] =>
  [...st].reduce<{ readonly open: readonly number[]; readonly spans: readonly (readonly [number, number])[] }>(
    (s, ch, i) =>
      ch === "(" ? { open: [...s.open, i], spans: s.spans }
      : ch === ")" && s.open.length > 0
        ? { open: s.open.slice(0, -1), spans: [...s.spans, [s.open[s.open.length - 1], i] as const] }
      : s,
    { open: [], spans: [] },
  ).spans;

// The reason a pattern is refused, or undefined when the screen sees nothing.
export const dangerousPattern = (src: string): string | undefined => {
  const st = structure(src);
  const hit = groups(st).find(([open, close]) => {
    if (!quantifierAt(st, close + 1)) return false;
    const body = st.slice(open + 1, close);
    return [...body].some((ch, k) => ch === "|" || quantifierAt(body, k));
  });
  if (hit === undefined) return undefined;
  const text = src.slice(hit[0], hit[1] + 1);
  const body = st.slice(hit[0] + 1, hit[1]);
  return [...body].some((_, k) => quantifierAt(body, k))
    ? `nested quantifiers (a repeated group that itself repeats: ${text}) backtrack exponentially`
    : `a repeated group containing an alternation (${text}) backtracks exponentially when its branches overlap`;
};

export type Bounded =
  | { readonly kind: "match"; readonly group1: string | undefined }
  | { readonly kind: "timeout" }
  | { readonly kind: "invalid"; readonly message: string };

// Runs as `node -e RUNNER -- <pattern> <flags>` with the input on stdin: the
// pattern never touches a shell, and the budget is enforced by the OS.
const RUNNER = [
  "const [pattern, flags] = process.argv.slice(1);",
  'const input = require("node:fs").readFileSync(0, "utf8");',
  "const m = input.match(new RegExp(pattern, flags));",
  "process.stdout.write(JSON.stringify(m === null || m[1] === undefined ? null : m[1]));",
].join("\n");

export const matchWithin = (pattern: string, flags: string, input: string, budgetMs: number): Bounded => {
  try {
    const out = execFileSync(process.execPath, ["-e", RUNNER, "--", pattern, flags],
      { input, encoding: "utf8", timeout: budgetMs, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
    const g = JSON.parse(out) as string | null;
    return { kind: "match", group1: g === null ? undefined : g };
  } catch (e) {
    const err = e as { readonly code?: string; readonly signal?: string | null; readonly stderr?: string };
    return err.code === "ETIMEDOUT" || (err.signal !== undefined && err.signal !== null)
      ? { kind: "timeout" }
      : { kind: "invalid", message: (err.stderr ?? "").split("\n").find((l) => /SyntaxError|Invalid/.test(l))?.trim() ?? "the pattern failed to run" };
  }
};
