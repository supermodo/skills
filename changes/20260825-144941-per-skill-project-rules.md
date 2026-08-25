---
bump: minor
section: Added
scope: ["README.md", "scripts/check.ts", "scripts/fixtures/config-valid.json", "scripts/fixtures/config-vcs-nocapture.json", "scripts/fixtures/config-vcs-unsafe.json", "scripts/fixtures/rules-tree/", "skills/bug-council/SKILL.md", "skills/bug-council/rules-templates/", "skills/commit/SKILL.md", "skills/commit/rules-templates/", "skills/config/SKILL.md", "skills/config/references/procedures.md", "skills/config/rules-templates/", "skills/config/scripts/config-check.ts", "skills/config/scripts/rules-check.ts", "skills/config/scripts/rules-index.ts", "skills/flow/SKILL.md", "skills/flow/rules-templates/", "skills/grill/SKILL.md", "skills/hunt/SKILL.md", "skills/hunt/references/layers.md", "skills/librarian/SKILL.md", "skills/next/SKILL.md", "skills/protocols/SKILL.md", "skills/protocols/references/config.md", "skills/protocols/references/rules.md", "skills/refactor/SKILL.md", "skills/release/SKILL.md", "skills/release/rules-templates/", "skills/sync-configs/SKILL.md", "skills/tdd/SKILL.md", "skills/tests/SKILL.md", "skills/work/SKILL.md", "skills/work/rules-templates/"]
---

**Your process, written down once.** Every skill now reads
`.supermodo/rules/<skill>.md` before it acts — that file IS the process for that
skill in your project, not hints layered over ours. The four that cost the most
or cannot be undone (`commit`, `release`, `flow`, `bug-council`) show you what
they are about to do the first time you run them and ask before doing it, so the
process starts as an agreement rather than a surprise. Say no once and you are
never asked again.

Each ships a starting point you can accept, edit or replace — `light` or `full`
for releases, Conventional Commits or `[PROJ-123]` prefixes for messages — and
conventions that span several skills, like where the tracker key belongs, live
once in `.supermodo/rules/vcs.md` so they cannot drift apart. Safety rails are
not in those files and cannot be edited away: nothing is pushed without your
yes, a release still refuses a dirty tree.
