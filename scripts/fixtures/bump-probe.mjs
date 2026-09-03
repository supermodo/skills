// Probe for skills/release/scripts/bump.ts — proves the semver bump is derived
// from the PROJECT's commit vocabulary, not a list baked into the script.
// Prints one `case=result` line per row; scripts/check.ts compares them.
import { applyAlphaPolicy, bumpOfCommit, maxBump } from "../../skills/release/scripts/bump.ts";

const grammar = (types, minorTypes, marker, alphaPolicy) => ({
  ccRe: new RegExp(`^(${types.join("|")})(\\([^)]*\\))?(${marker})?:\\s`),
  breakingFooterRe: /^BREAKING[ -]CHANGE:/m,
  minorTypes,
  alphaPolicy,
});

const DEFAULT = grammar(["feat", "fix", "chore"], ["feat"], "!", "demote");
const RENAMED = grammar(["feature", "bug", "task"], ["feature"], "BREAKING", "strict");

const rows = [
  ["default-feat",        bumpOfCommit(DEFAULT, "feat: add x", "")],
  ["default-fix",         bumpOfCommit(DEFAULT, "fix: correct x", "")],
  ["default-breaking",    bumpOfCommit(DEFAULT, "feat!: drop x", "")],
  ["default-footer",      bumpOfCommit(DEFAULT, "fix: correct x", "BREAKING CHANGE: gone")],
  // The renamed vocabulary is unreadable to the default grammar and vice versa
  // — that asymmetry is the whole point of the assertion.
  ["default-sees-feature", bumpOfCommit(DEFAULT, "feature: add x", "")],
  ["renamed-feature",     bumpOfCommit(RENAMED, "feature: add x", "")],
  ["renamed-bug",         bumpOfCommit(RENAMED, "bug: correct x", "")],
  ["renamed-breaking",    bumpOfCommit(RENAMED, "featureBREAKING: drop x", "")],
  ["renamed-sees-feat",   bumpOfCommit(RENAMED, "feat: add x", "")],
  ["max",                 maxBump(["patch", "minor", "none"])],
  ["alpha-demote",        applyAlphaPolicy(DEFAULT, "major", 0)],
  ["alpha-strict",        applyAlphaPolicy(RENAMED, "major", 0)],
  ["alpha-past-1.0",      applyAlphaPolicy(DEFAULT, "major", 1)],
];
rows.forEach(([k, v]) => console.log(`${k}=${v}`));
