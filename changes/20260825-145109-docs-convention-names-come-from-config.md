---
bump: minor
section: Added
scope: ["README.md", "scripts/check.ts", "scripts/fixtures/bump-probe.mjs", "scripts/fixtures/defaults-probe.mjs", "scripts/fixtures/docs-tree-renamed/", "scripts/fixtures/grammar/", "skills/commit/SKILL.md", "skills/config/scripts/config-check.ts", "skills/config/scripts/grammar-load.ts", "skills/config/scripts/grammar.ts", "skills/flow/SKILL.md", "skills/hunt/SKILL.md", "skills/librarian/SKILL.md", "skills/librarian/scripts/docs-check.ts", "skills/librarian/scripts/docs-generate.ts", "skills/next/SKILL.md", "skills/protocols/references/config.md", "skills/protocols/references/docs-convention.md", "skills/protocols/references/worklist.md", "skills/release/scripts/bump.ts", "skills/release/scripts/release-check.ts", "skills/tests/SKILL.md", "skills/work/SKILL.md"]
---

**The docs convention is yours to name.** Folders, task files, field labels,
priority levels, checklist characters and marker prefixes are all settings now
(`docs.layout` and `docs.grammar`). Call the work folder `tickets/`, rank items
`now / next / later`, mark work in progress with whatever character your team
already types, require an `Owner:` line on every spec — the checker enforces
your spelling rather than ours, in messages that use your words.

What you cannot do is delete a field a skill reads. Try, and config refuses at
the point of change and names the skills that would have broken, instead of
letting it surface next week as a board that came back empty. The convention is
still strict about shape: two levels of work folders, priorities that are
ordered, and task states that partition into done and not-done.

`commit` and `release` now share one commit vocabulary. The list of types lived
in two places, prose in one skill and a pattern in the other, so renaming a type
would quietly have turned every feature into a patch release. Types, the
breaking marker and the subject length caps come from `vcs.commit`, and the 0.x
rule that demotes a breaking change to a minor is a setting
(`release.alphaPolicy`) rather than an assumption.
