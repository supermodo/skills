---
bump: minor
section: Added
scope: ["docs/reports.md", "scripts/check.ts", "skills/flow/SKILL.md", "skills/protocols/references/reports.md", "skills/protocols/references/worklist.md", "skills/reports/scripts/lib/page.ts", "skills/reports/scripts/lib/scan.ts", "skills/reports/scripts/render.ts", "skills/work/SKILL.md"]
---

The Board tab is a snapshot, and it used to age in silence — close a task, add
a backlog entry or set a priority, and it went on showing the picture from
before. It now says so above the board whenever the work documents have changed
since it was computed, and names the command to recompute it; `/supermodo:flow`
and `/supermodo:work` close the same way, with one line pointing at
`/supermodo:next`. Nothing recomputes a board behind your back: a board that
appeared unasked would put its triage questions on screen unasked too.
