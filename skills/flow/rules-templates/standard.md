---
rule: flow
description: Eight stages, grill through commit, with hunt and tdd optional
template: standard
summary: >
  Eight stages: intake, work, hunt (optional), tdd fixes, the tests gate,
  refactor, a post-refactor verify gate, docs alignment, commit.
  Each stage runs in its own subagent; handoff travels through report files.
  The tests gate and the post-refactor verify gate are mandatory and never move.
  Before the run starts, any stage whose process you have not yet approved is
  resolved in one batch, so no subagent stops mid-pipeline to ask.
---

## Stage sequence

1. `librarian --task` — create or refine the work triad (main context).
2. `work` — implement the locked triad.
3. `hunt` — bug audit. Optional; ask run/skip.
4. `tdd --debug` — fix what hunt confirmed. Runs only if stage 3 found bugs.
5. `tests` — the gate. Red stops the run.
6. `refactor` — clean the working feature.
6b. verify — re-run the complete stage-5 gate. Red loops back into fix.
7. `librarian` — full docs alignment.
8. `commit` — message from the flow baseline diff, then ask-to-commit.

Reorder, drop or add stages here. A stage named must be an installed skill.

## Optional stages

`hunt` is asked run/skip. A skipped optional stage is recorded as explicit
residual risk in the run report — never silently dropped.
