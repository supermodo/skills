---
bump: minor
section: Removed
scope: ["skills/config/scripts/config-check.ts", "skills/release/scripts/release-check.ts", "skills/protocols/references/config.md", "skills/protocols/references/rules.md", "scripts/fixtures/grammar/fail/release-mode-removed.json", "scripts/fixtures/grammar/fail/release-github-flag-removed.json"]
---

`release.mode` and `release.githubRelease` are removed from
`skills.config.json`.

`release.mode` never named a value — it named a choice between two workflows,
and a workflow is a sequence, which belongs in `.supermodo/rules/release.md`
(frontmatter `template: light|full`) where the rest of your process already
lives. Keeping it in config meant two places described your release and
nothing kept them agreeing. `release.githubRelease` hardcoded one forge into a
boolean; whether and how a project publishes a release is part of its process,
so it moves into the rules file in the project's own words rather than into
another enum.

A config still carrying either is an error, not a silent ignore, and the
message names the migration: run `config --rules release` to materialize the
template matching the mode you had, and let `config` rewrite the file under
its usual dry-run and approval. `release` reports the same under `migrations`
and refuses to treat the stale key as meaningful.
