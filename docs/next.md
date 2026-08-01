# next — the worklist board

Shows everything that could be worked on, grouped by priority, then suggests
a shortlist of three to five things to do. It reads; it never changes your documentation and
never touches git.

## When to use

- "What should I work on?" / "What's next?"
- "What's blocked?" / "What needs my input?"
- Before a `flow` run, to choose the job deliberately instead of accepting a
  suggestion.

## Invocation

```
/supermodo:next                  # the board + a shortlist of 3-5 to pick from
/supermodo:next --suggest        # suggestions only
/supermodo:next --triage         # set priorities on items that lack one
/supermodo:next --repair         # report convention debt to librarian
```

## The board

```
Worklist — 11 items · 2 repairs owed

P0
  payment-timeout-fix        in-progress   L — 7 tasks, db migration    unblocks 2
P1
  api-client-retry     P3→P1 not-started   M — 4 tasks                  required by payment-timeout-fix
  auth/02-refresh-flow       needs-input   M — 5 tasks                  1 open question
```

Each line: what it is · its priority (`→` when inherited from something it
blocks) · where it stands · how big it looks, with the evidence for that
guess · what it depends on or unblocks.

## How priority is decided

You own the scale — `P0` to `P3`. The toolkit proposes a default from at
most three questions asked once, when the work is created:

- **What drives it?** defect / commitment-blocker / capability / improvement
- **Is it released?** (defects) released / unreleased / unknown
- **What happens?** (defects) catastrophic / workflow-breaking / bounded /
  cosmetic

A released, workflow-breaking defect is a P1; the same defect unreleased is a
P2. Exposure modifies the consequence — it never replaces it, so a released
typo never outranks an unreleased data-loss bug.

You confirm the proposal, it is written into the work's `spec.md`
(`Priority: P1 — released-workflow-breaking: …`), and it is never
recalculated behind your back. Work with no priority set shows as
`P2 — unset` and the board keeps working.

Something that blocks a P0 inherits P0 while it blocks it — shown as
`P3 → P0`, never written to disk.

## The suggestions

1. **Priority lead** — the top of the board.
2. **Context lead** — what matches your branch, recent commits and
   uncommitted changes, with the evidence named. It can break a tie; it can
   never jump a priority gap.
3. **Human unblocker** — the highest-ranked thing waiting on a decision from
   you, phrased as the decision.

Blocked, paused and broken items are never suggested. Nothing auto-picks:
pick one and it hands you the `flow` command to run it.

## Full rules

`skills/protocols/references/worklist.md` — priority, inheritance, execution
state, ordering, effort bands, the suggestion rules.

## In the browser

Every invocation also writes its board to `.skills/supermodo/next/` and renders
it, so the newest board is the front page of the HTML archive — suggestions,
priority groups, and each item expandable to its description and task list.
See [reports.md](reports.md).
