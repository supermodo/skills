---
rule: flow
description: Eight stages plus the plan-review and verify gates, grill through commit, with hunt and tdd optional
default: true
template: standard
summary: >
  Eight stages: intake, a plan-review gate, work, hunt (optional), tdd fixes,
  the tests gate, refactor, a post-refactor verify gate, docs alignment, commit.
  Each stage runs in its own subagent; handoff travels through report files.
  The plan-review, tests and verify gates are mandatory and never move; on
  REVISE, intake revises the plan, five rounds max, then you decide.
  Before the run starts, any stage whose process you have not yet approved is
  resolved in one batch, so no subagent stops mid-pipeline to ask.
---

## Stage sequence

1. `librarian --task` — create or refine the work triad (main context).
1b. plan review — the `plan-review` seat checks the triad read-only.
    REVISE loops back into 1, five rounds max, then you decide.
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
