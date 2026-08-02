---
bump: minor
section: Added
scope: ["skills/protocols/references/reports.md", "skills/protocols/references/worklist.md", "skills/next/SKILL.md", "skills/librarian/SKILL.md", "skills/commit/SKILL.md", "skills/refactor/SKILL.md", "skills/hunt/SKILL.md", "skills/tests/SKILL.md", "skills/tdd/SKILL.md", "skills/bug-council/SKILL.md", "skills/work/SKILL.md", "skills/release/SKILL.md", "skills/sync-configs/SKILL.md", "skills/reports/scripts/lib/scan.ts", "skills/reports/scripts/lib/blocks.ts", "skills/reports/scripts/lib/page.ts", "scripts/check.ts"]
---

The board no longer shows you an order it cannot vouch for. An unranked item
is unknown, not a quiet P2 — it could be the P0 — so `next` now asks the three
priority questions before showing a board that would be guesswork, and you can
triage everything, only what could change the answer, or skip and get the
board under a plain warning. Answers reach disk in the same run through the
new `librarian --priorities`, and if a write fails the run says so and hands
back the lines to retry rather than asking you again next week. Priorities are
now asked wherever work is created, including the one-time `--absorb` sweep of
existing docs, so a first board no longer arrives entirely unranked.

Reports lead with the picture: findings by severity, coverage per package,
mutants caught against survived, purity before and after, and a tree of what a
refactor proposes to move — drawn in the page, still readable as text. Plans
you are asked to approve are written and opened before the question, so you
can check a nineteen-file refactor in seconds instead of trusting a wall of
bullets.

Runs that produce nothing worth keeping no longer produce a page: a backlog
insert and an ordinary commit leave the entry and the commit as their record
and stay out of your browser — but a commit that fails after staging still
reports, because then there is no commit to be the record. Malformed reports
are now caught instead of rendering as healthy rows.
