---
bump: minor
section: Fixed
scope: ["docs/release.md", "scripts/check.ts", "scripts/fixtures/release-state-probe.mjs", "scripts/fixtures/config-valid-commented.jsonc", "scripts/fixtures/grammar/fail/consumed-child-blanked.json", "scripts/fixtures/grammar/fail/release-forge-enum-removed.json", "scripts/fixtures/grammar/fail/release-github-flag-removed.json", "scripts/fixtures/grammar/fail/release-integration-mode-removed.json", "skills/config/scripts/config-check.ts", "skills/config/scripts/grammar.ts", "skills/config/scripts/regex-safety.ts", "skills/release/SKILL.md", "skills/release/scripts/release-check.ts"]
---

An independent verification of every claim made about the release and config
guards found the ones below either false or held by nothing; each is fixed and
now has a check that fails when the behaviour regresses.

- **A supplied `--version` is ordered against everything published.** Under a
  published 1.0.0, `--version 0.9` rendered `git tag v0.9`: the rollback guard
  only spoke semver. Versions now compare as semver when both sides parse and
  as dotted numbers otherwise, and one that cannot be ordered is refused.
- **A hostile `versionPattern` cannot hang the preflight.** Two rewrites of the
  known catastrophic pattern passed the old screen and hung `release-check`
  for good. A shared screen now runs in `config-check` and in the preflight
  itself, and the pattern executes under a 500 ms budget for whatever the
  screen misses. The same screen covers `vcs.issueKey.pattern`.
- **Blanking a child of a consumed key is refused.** `docs.grammar.task.states.done: []`
  validated clean and left the checklist with no way to say "done"; the floor
  now walks each consumed key's subtree and names the skills that parse it.
- **A duplicated changelog heading is counted as text**, so `1.0.1+build.7`
  headed twice is warned about — the `+` no longer disables the warning.
- **The release guide names no forge.** `forge` and `integration` are gone from
  the documented config, `gh release list` is no longer ordered before
  reporting state, and the self-check fails if the guide instructs a forge CLI.
- **The self-check refuses a poisoned expectation table** (a row expecting a
  failure value), and seventeen behaviours that were only ever asserted —
  in-progress operations, an inherited `GIT_DIR`, remote-tracking versions,
  BOM rules files, semver prerelease ordering, commented configs, more version
  homes — now have rows that fail when they regress.
