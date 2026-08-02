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

**You are asked when the work is created, not later.** Every path that brings
an item into existence asks these three questions on the spot — a new task,
a backlog entry, and every piece of work found during the one-time
[`--absorb`](librarian.md) sweep of your existing documentation. That is the
moment you have the context to answer in seconds; a month later, against
thirty items at once, the same questions are an interview. `--triage` is the
repair path for what got through, not the normal way priorities are set.

Graduating a backlog entry into a task carries its priority across unchanged
— you already answered, and being asked twice is how a frozen value drifts.

## When the board asks before showing itself

`P2 — unset` is a placeholder so the row can be drawn. It is not a guess at
the answer: an unclassified item could be anything from P0 to P3, and until
you answer three questions nobody knows which.

That is why one unclassified item is enough to stop the board. It could be the
P0 — and a board that quietly sorts it into the middle as P2 is not showing
you a lower priority, it is showing you an unanswered question wearing one.
Thirty of them, and the whole order is guesswork rather than just its head.

Blocked items count too, which is less obvious. Something blocked can still be
a P0, and a P0 lifts whatever is blocking it — so an unclassified blocked item
can change which *workable* item you should do first, without ever appearing
near the top itself. Only paused and abandoned work is safely left unranked:
it lifts nothing.

So `next` stops first, and offers three choices, when any live item has no
priority, or when unranked items are half or more of the list:

1. **triage now** — every untriaged item, at most three questions each
2. **triage what could change the answer** — everything still live, blocked
   included; paused and abandoned items keep their placeholder
3. **skip** — the board immediately, marked unreliable

Skip is a real answer, not a nudge to be worn down: you may be looking for one
specific item and want no interview. What it does not do is hide the cost —
the board renders under a warning, on the page and in chat.

The one place skip is not offered is `flow --job next`, where the board's pick
becomes an eight-stage pipeline instead of a suggestion you can ignore. There,
an unranked live item is either triaged or the pick is confirmed with you
before anything runs.

**Answers you give are stored before the run ends.** The confirmed priorities
go straight to `librarian`, which writes them into the files, and `next`
re-reads those files to confirm they landed. If any did not, it says so and
names them — so you know the questions are coming back. Triage that ends as
chat text is triage you will be asked to repeat.

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
