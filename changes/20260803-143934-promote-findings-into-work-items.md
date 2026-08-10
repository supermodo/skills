---
bump: minor
section: Added
scope: [".gitignore", "README.md", "docs/documentation.md", "docs/hunt.md", "docs/librarian.md", "docs/next.md", "docs/protocols.md", "docs/tests.md", "scripts/check.ts", "scripts/fixtures/docs-tree/", "scripts/fixtures/reports-store/next/20260801-154000.md", "skills/bug-council/SKILL.md", "skills/bug-council/references/", "skills/flow/SKILL.md", "skills/hunt/SKILL.md", "skills/librarian/SKILL.md", "skills/librarian/scripts/docs-check.ts", "skills/next/SKILL.md", "skills/protocols/SKILL.md", "skills/protocols/references/docs-convention.md", "skills/protocols/references/promotion.md", "skills/protocols/references/reports.md", "skills/protocols/references/worklist.md", "skills/refactor/SKILL.md", "skills/release/SKILL.md", "skills/reports/scripts/lib/blocks.ts", "skills/sync-configs/SKILL.md", "skills/tdd/SKILL.md", "skills/tests/SKILL.md", "skills/work/SKILL.md"]
---

Findings from a `hunt` or a `tests` audit stay in their report until you ask
for them: `/supermodo:librarian --promote <report> [ids…]` turns the ones you
name into work items, and nothing is ever filed to your backlog automatically.

Because an item is what the board ranks and what the archive closes, promotion
never puts work of different priorities in one folder — a P0 buried among
ninety-nine P3s pins the board head forever and cannot close until the last
nit is done. Findings that only ship together stay together and take the
highest priority among them; everything else groups by the surface it touches,
so several items at one priority is the normal outcome. Where an item does
hold more than one priority, its board row carries a `mixed` pill naming what
is inside.

For an actual bug found by a hunt the priority needs no interview: the
severity two agents already agreed on maps onto the consequence question and
exposure comes from your main branch, leaving one confirmation per priority
band. Improvements — a dead export, a missing test — and every test-audit
finding get the ordinary questions once per group, since neither severity
scale implies a driver.

The board now separates what you ranked from what a tool ranked for you. When
nobody is reachable to answer — a promotion inside an unattended `flow` run —
the priority is still computed and still ranks, but it is written with a
`Priority-source: derived` line naming what was assumed, and its board row
carries a `derived` pill. Those items count as untriaged: `/supermodo:next
--triage` collects them, and confirming one clears the marker. Nothing written
before this reads as derived, so existing work keeps its plain, confirmed
priority.

Promoted work carries its own evidence in a `findings.md`, because run
artifacts under `.skills/` are gitignored and would resolve to nothing in
anyone else's clone; `docs-check` now enforces that every promoted finding has
both its evidence and its task. Promoting a second subset from the same report
later extends the item it belongs to rather than colliding with it, and
re-running a promotion after a failure never creates anything twice.
