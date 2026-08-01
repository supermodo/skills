---
bump: patch
section: Fixed
scope: ["skills/next/SKILL.md", "skills/protocols/references/reports.md", "skills/commit/SKILL.md", "skills/hunt/SKILL.md", "skills/refactor/SKILL.md", "skills/tests/SKILL.md", "skills/release/SKILL.md", "skills/tdd/SKILL.md", "skills/work/SKILL.md", "skills/librarian/SKILL.md", "skills/bug-council/SKILL.md", "skills/sync-configs/SKILL.md"]
---

Skills now actually publish the web page they write. `next` in particular
would compute a board, hand the priorities to `librarian` and never mention
the page — its own instructions said it "writes nothing", which is true of
documentation but not of its run report, and the reports protocol was missing
from what it reads. Every skill that produces a report now renders it and
names the page in its final message, and the protocol states the duty once,
including the rule that stages inside a `flow` run render nothing so that
eight stages never become eight browser tabs. `tdd`, `work`, `librarian`,
`bug-council` and `sync-configs` also persist their standalone runs for the
first time — previously those results existed only in the conversation and
died with the session.
