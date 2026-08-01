# flow — the pipeline orchestrator

Runs the full supermodo development pipeline end-to-end for one task. `flow`
is a thin conductor, not a worker: each stage is a full skill running in its
own fresh context, and stages talk through report files on disk in
`.skills/supermodo/runs/<id>/` — never through one giant chat. That keeps the
main conversation tiny on even a long feature, and makes every run
inspectable afterwards.

## The eight stages

```
1 librarian --task   grill the task, lock the triad (spec/plan/tasks)
2 work               implement
3 hunt               bug audit                     (optional)
4 tdd --debug        fix what hunt found            (if bugs)
5 tests              configured tiers green         (MANDATORY gate;
                     coverage/lint gate when configured)
6 refactor           clean the working feature
6b verify            rerun the full stage-5 gate    (MANDATORY gate)
7 librarian          persist drift notes, decisions, ADRs
8 commit             message; commits on your yes (or configured auto)
```

Skipped optional stages are recorded as residual risk; a run that skips a
mandatory gate cannot claim success.

## Invocation

```
/supermodo:flow [--from <stage>] [--job <source>] [--worktree | --no-worktree]
```

All flags optional; plain `flow` = full pipeline, job chosen interactively.

### `--job` — where the task comes from

| Value | Meaning |
|---|---|
| `work:<task-slug>` | An existing triad in `docs/work/` — stage 1 validates it and grills only the gaps |
| `backlog:<slug>` | A `BACKLOG.md` entry — stage 1 graduates it into a full task |
| `next` | The worklist priority lead — the top of the board (see [next](next.md)) |
| free text | A completely new job — full grilled intake |

**No `--job` → flow suggests.** It gathers read-only evidence (branch, recent
commits, uncommitted diff paths) and proposes the task that continues what
you're already doing, naming its evidence, with the deterministic
first-in-line pick offered alongside. You always choose; nothing auto-picks.

### `--from` — where the run starts

Start a fresh run at any later stage: `work`, `hunt`, `tests`, `refactor`,
`librarian`, `commit` (`tdd` only when pointed at an existing hunt report or
a named bug). Rules:

- An entry past stage 1 requires an existing triad (`--job work:<slug>`).
- Every mandatory gate at or downstream of the entry still runs.
- **Two grades of success:** *pipeline success* may only be claimed when a
  verification gate (5 or 6b) actually ran green in this run. Entering after
  the gates (`--from librarian`, `--from commit`) reports at most *segment
  success* — "stages green, code NOT verified by this run". A late entry is
  never a shortcut to a verified-looking result.

### `--worktree` — isolate the whole task

By default flow runs in your main checkout. `--worktree` (or config
`workspace.worktree: true`) makes flow create **one dedicated git worktree
per task** at the baseline step, before stage 1: it asks you for path and
branch (suggesting `worktrees/<task-slug>` off the project root on a new
branch `<task-slug>`), runs `git worktree add` off `dev`, and every stage
runs inside that one shared worktree — never one per subagent. The commit
lands on the task branch; you merge it into `dev`, and [release](release.md)
suggests removing the worktree and deleting the branch once merged.
`--no-worktree` forces the main tree for a single run regardless of config.

## Examples

Start fresh, let flow propose the job:

```
/supermodo:flow
→ 1. `work:invoice-rounding` — P1, in progress (priority lead)
  2. `backlog:csv-export` — P2, completes the export feature you're touching in packages/data
  3. Pick from the board   4. A completely new job
```

Run a specific backlog entry end-to-end:

```
/supermodo:flow --job backlog:csv-export
```

Feature already implemented by hand — enter at the tests gate and let flow
harden, refactor, document, and commit it:

```
/supermodo:flow --from tests --job work:csv-export
```

Audit what you wrote today, then fix what's found:

```
/supermodo:flow --from hunt --job work:csv-export
```

## What flow guarantees

- **Fail-closed preflight:** valid config with a docs section and a test
  command, all stage skills installed, host capabilities checked — or it
  halts naming exactly what's missing.
- **A baseline before anything runs** (git status/diff, config and triad
  hashes), so the final commit covers exactly the run's own changes.
- **Questions reach you properly:** a stage that needs input doesn't die —
  its questions are triaged (facts answered from code/docs, tradeoffs
  pre-fought between the models, product choices brought to you) and the
  stage continues with the answers.
- **Stop/resume:** run state and hashes are validated on resume; anything
  changed externally re-runs the affected stages rather than continuing
  blind.
- **An honest final report:** per-stage outcomes, residual risks, disputes
  verbatim, and the commit decision.
- **A run page you can watch:** flow opens the run's web page right after
  stage 1 and re-renders it as each stage lands, so a long run is visible
  without watching the terminal ([reports.md](reports.md)).

Requires: `protocols`, a valid `skills.config.json` ([config.md](config.md)).
