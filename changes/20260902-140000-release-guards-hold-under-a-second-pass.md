---
bump: minor
section: Fixed
scope: ["skills/release/scripts/release-check.ts", "skills/config/scripts/config-check.ts", "skills/protocols/references/config.md", "scripts/fixtures/release-state-probe.mjs", "scripts/check.ts"]
---

A second adversarial pass, run against the freshly fixed preflight, found four
more defects — including one introduced by the previous round's own fix.

- **A supplied `--version` is still a validated version.** It was accepted
  before any comparison, so a rollback (`0.5.0` under a published `1.0.0`) and
  a duplicate (`1.0.0` again) both reported "ready" — the second rendering a
  `git tag` that could not succeed. The chosen version must now be above every
  published and declared one, and its tag must not already exist.
- **The version is data, never a pattern.** A version may contain `+` and `.`,
  which are regular-expression metacharacters: the heading
  `## [1.0.1+build.7]` never matched the generated `awk` regex, so the publish
  step received an EMPTY notes file with nothing anywhere saying so. The
  heading is now passed as a variable and compared as a string.
- **Tag style is the project's.** A process required to ship signed tags could
  not express it — `tag` is rendered by the skill, and rules own order only.
  `release.tagStyle` selects `lightweight` (default), `annotated` or `signed`,
  and the command renders accordingly. Three values, all defined by git itself.
- **Every remote is fetched and `release.remote` names the canonical one**
  (see the previous entry), now documented in the config schema alongside
  `tagStyle`.

Also corrected: a four-part scheme was briefly blocked by the stray-tag rule
introduced for prefix overlaps. That rule is now asked only of projects whose
own version is semver, where "no recognised tags" is a symptom rather than the
normal state.
