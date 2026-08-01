---
bump: patch
section: Fixed
scope: ["skills/protocols/references/worklist.md", "skills/protocols/references/reports.md", "skills/next/SKILL.md", "skills/reports/scripts/lib/blocks.ts", "skills/reports/scripts/lib/page.ts", "skills/reports/scripts/lib/inline.ts", "skills/reports/scripts/lib/markdown.ts"]
---

Work that has begun no longer reads as untouched: an item with some tasks done
is `in-progress`, where before only a `/` marker counted — so a triad at 20 of
21 tasks was labelled `not-started` and sorted below untouched backlog entries.
Ordering inside a priority bucket now uses real signals in turn — what unblocks
others, what is nearest done, what has a triad at all, what you touched most
recently — instead of falling through to alphabetical. The shortlist reaches
past the top of the board too, reserving up to two places for a quick win or a
blocker that strict ordering would bury.

Every item now carries the command to act on it, so the board answers "how do I
start this" for every row rather than only the shortlist. Task lists keep the
grouping their `tasks.md` gives them — a seventy-task triad shows the author's
own headings with per-group progress instead of one flat list — and titles
render their code spans and paths properly. Priority groups are always open,
accordions announce themselves, and states that say nothing (`not-started`,
`backlog`) no longer print a label.
