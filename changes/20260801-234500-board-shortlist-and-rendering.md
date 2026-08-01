---
bump: patch
section: Fixed
scope: ["skills/protocols/references/worklist.md", "skills/protocols/references/reports.md", "skills/next/SKILL.md", "skills/reports/scripts/lib/blocks.ts", "skills/reports/scripts/lib/page.ts", "docs/next.md", "docs/reports.md", "README.md"]
---

`next` now answers "what should I work on" with a shortlist of three to five
real items to choose from. It used to fill three fixed roles — priority lead,
context lead, human unblocker — and print an empty card whenever a role had no
candidate, so a board with thirty open items could still say "nothing
qualifies". Roles are now labels earned in board order rather than reserved
slots, and a placeholder can no longer reach the page.

The board page also shows what it was hiding. Items carry their kind
(`work:` / `backlog:`), `unblocks` names the items it unblocks instead of
counting them, and progress bars, dependency pills and task lists survive
several near-miss shapes rather than vanishing — anything still unusable is
reported in a warning box instead of being dropped in silence. Report pages
are boxed to one centred measure so text no longer aligns with the header
instead of the body, and every code block has a copy button.
