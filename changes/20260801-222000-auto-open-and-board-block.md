---
bump: patch
section: Fixed
scope: ["skills/reports/scripts/render.ts", "skills/protocols/references/reports.md", "skills/next/SKILL.md"]
---

Report pages now actually open. The renderer refused to launch a browser
whenever it could not see a terminal, which is every time a skill runs it — so
the default `open: "auto"` never opened anything and only printed a `file://`
link. Being run by an agent is no longer mistaken for being headless; CI and
displayless machines still just print the link. The board also renders as the
board again: `next` was writing its worklist as markdown tables instead of the
block the page is built from, so the Board tab showed a wall of text. The
block's full shape is now written out in the reports protocol, and `next` is
told to open its report with it.
