// Semver bump derivation from Conventional Commits — pure, so it can be tested
// without a repository. The commit VOCABULARY is the project's (grammar.ts);
// the MAPPING is not: a breaking change outranks a feature, which outranks
// everything else. That ordering is the skeleton and does not move.
//   (Node ≥ 22.18)

export type Bump = "major" | "minor" | "patch" | "none";

export type CommitGrammar = {
  readonly ccRe: RegExp;              // ^(<types>)(\(scope\))?(<marker>)?:\s
  readonly breakingFooterRe: RegExp;  // ^BREAKING[ -]CHANGE:
  readonly minorTypes: readonly string[];
  readonly alphaPolicy: string;       // "demote" | "strict"
};

// A commit = subject + body: breaking via the configured marker in the subject
// OR the configured footer in the body.
export const bumpOfCommit = (g: CommitGrammar, subject: string, body: string): Bump => {
  const m = subject.match(g.ccRe);
  if (m === null) return "none";
  if (m[3] !== undefined || g.breakingFooterRe.test(body)) return "major";
  return g.minorTypes.includes(m[1]) ? "minor" : "patch";
};

export const maxBump = (bumps: readonly Bump[]): Bump =>
  (["major", "minor", "patch"] as const).find((b) => bumps.includes(b)) ?? "none";

// Alpha (0.x): with alphaPolicy "demote" (the default) a breaking change is
// MINOR, because 0.x makes no compatibility promise; "strict" majors it.
export const applyAlphaPolicy = (g: CommitGrammar, bump: Bump, major: number): Bump =>
  g.alphaPolicy === "demote" && major === 0 && bump === "major" ? "minor" : bump;
