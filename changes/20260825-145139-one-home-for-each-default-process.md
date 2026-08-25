---
bump: minor
section: Changed
scope: ["scripts/check.ts", "skills/bug-council/rules-templates/deep.md", "skills/commit/SKILL.md", "skills/commit/rules-templates/conventional.md", "skills/commit/rules-templates/issue-prefixed.md", "skills/flow/rules-templates/standard.md", "skills/librarian/SKILL.md", "skills/librarian/rules-templates/", "skills/protocols/references/rules.md", "skills/release/SKILL.md", "skills/release/rules-templates/light.md", "skills/work/rules-templates/standard.md"]
---

Skills no longer keep a second copy of their own default process. A skill used
to describe its sequence in its own instructions AND ship that same sequence as
a starting point — two copies that drift the first time either is edited, with
nobody told. Now a skill states only what it guarantees, and the process itself
lives in one file: yours, or the starting point it came from. When you have not
written one, the shipped default is what runs, and each skill marks exactly one
starting point as that default.

In practice this means `librarian` names what a lifecycle pass must be true of —
work verified against code before it is archived, generated files never
hand-edited, decision records immutable once accepted — while when the pass runs
and what earns a decision record are yours to set. `commit` takes its type
vocabulary from config rather than restating it, and where the message shape is
decided moved to the same place.
