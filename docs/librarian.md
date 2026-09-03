# librarian — the single documentation owner

Sole owner of documentation mutations: only `librarian` creates, moves, or
edits docs. Every other skill just reports drift ("code says X, doc says Y")
and the librarian resolves it once. Docs reflect what code and verification
evidence establish — nothing is invented. See
[documentation.md](documentation.md) for the layout it enforces.

## Modes

| Invocation | What happens |
|---|---|
| `/supermodo:librarian` | Full **lifecycle pass** (below) |
| `/supermodo:librarian --task [description]` | **Task intake**: grill → create the spec/plan/tasks triad |
| `/supermodo:librarian --backlog <op>` | **Backlog operations** on `docs/work/BACKLOG.md` |
| `/supermodo:librarian --priorities` | Write **confirmed triage answers** into the items they belong to |
| `/supermodo:librarian --promote <report> [ids…]` | Turn **named findings** from a hunt or test audit into work items |
| `/supermodo:librarian --absorb` | One-time **sweep of pre-existing docs** into the convention |

## Lifecycle pass

The maintenance sweep: verify completed work against the code, promote
verified contracts to `docs/reference/`, record durable decisions as ADRs,
archive finished tasks, split oversized docs, regenerate navigation, repair
links, and keep `CLAUDE.md`/`AGENTS.md` agent instructions aligned with
reality. Run it after landing work, or any time the docs feel behind the
code.

## Task intake (`--task`)

Turns a request into a grilled `docs/work/<task-slug>/` triad — this is also
`flow` stage 1. The grilling interview ([grill.md](grill.md)) runs first; no
doc file exists until it resolves and you sign off. The backlog is optional:
for something you want to start now, create the task directly:

```
/supermodo:librarian --task "Export fact tables as CSV"
```

## Backlog operations (`--backlog`)

The backlog is a TO-DO list for the future: capture ideas now, work on them
later, lose nothing in between.

```
/supermodo:librarian --backlog add csv-export "Export fact tables as CSV"
/supermodo:librarian --backlog list [term]
/supermodo:librarian --backlog edit csv-export "New wording"
/supermodo:librarian --backlog drop csv-export "superseded by parquet-export"
/supermodo:librarian --backlog next       # alias for /supermodo:next
/supermodo:librarian --backlog graduate csv-export
```

- `next` is an alias for the [next](next.md) skill — the board plus its
  suggestions. Report only; selection stays with you.
- `graduate` is how an idea becomes work: full task intake seeded from the
  entry; the backlog entry is replaced with a dated pointer to the new triad
  (history preserved, never erased).
- `drop` strikes through with a dated reason; `reap` deletes only
  already-dropped entries after confirming their disposition is recorded.

Backlog operations produce **no report and no browser tab**. The entry itself
is the result — it is in `BACKLOG.md`, in git, and on your board the next time
you run `/supermodo:next`. A page announcing a one-line insert is an
interruption charged against a five-second task.

## Recording priorities (`--priorities`)

You won't type this one. It is where [`next --triage`](next.md) sends the
priorities you confirm, so they reach disk in the same run you answered them
in — `next` reads the board but cannot write documentation, and only the
librarian writes `Priority:`.

Triage is the repair path, though, not the normal route. Every mode that
creates work — `--task`, `--backlog add`, and `--absorb` for every document it
turns into work — asks the three priority questions right there, while you
have the thing in front of you. `--graduate` asks nothing: the entry's
priority moves to the new task unchanged, and if it was ranked by a tool it
arrives still marked as such — a value nobody confirmed does not become a
confirmed one by being moved. `--promote` asks one confirmation per priority
group instead, because a finding's severity was already decided by the agents
that found and attacked it.

It fills blanks and confirms what a tool ranked; it overwrites nothing else.
An item that already carries a priority you chose is left alone and the
conflict reported, because priorities are yours and are frozen once set. An
item marked `derived` is different: the whole point of the interview is that
you take that value over, so the answer is written in place and the marker
deleted — including when you confirm exactly the value you were shown, since
what changed is who owns it. Hand-editing the priority is not confirmation;
only answering is. Malformed or unresolvable entries are rejected individually
and named, never guessed at.

## Promoting findings (`--promote`)

A [`hunt`](hunt.md) or a [`tests audit`](tests.md) produces a report, not a
queue. Nothing from it reaches your board on its own: the report persists, it
renders as a page, and it is still there next month. Promotion happens when
you ask, for the findings you name:

```
/supermodo:librarian --promote .skills/supermodo/hunt/2026-08-03-api.md HNT-260803-004 HNT-260803-011
```

Four things make that safe to run on a report with a hundred findings in it.

**One item, one priority.** A triad is what the board ranks and what the
archive closes, so one folder holding a P0 and ninety-nine P3s is a broken
board: its priority never drops as the urgent part gets fixed, `flow --job
next` will run the whole folder as one task, and nothing waiting on the P0 can
proceed until the last nit is done. You can decline a split; the item is then
written as you asked and carries a `mixed` pill on the board, so the next
reader can see what is inside it.

**Sized to close.** Findings that belong together — one deliverable, one
acceptance criterion, one edit surface, a real internal order — stay together.
A shared priority is not togetherness, so sixty unrelated P2 findings do not
become one P2 triad; they group by the surface they touch, and several items
at the same priority is the normal outcome. You see the proposed grouping,
with the ids in each, before anything is written.

**Few questions.** For an actual bug found by a hunt, none of the priority
interview is repeated: the severity was decided by the agent that found it and
the skeptic that attacked it, it maps straight onto the consequence question,
and exposure comes from checking the file against your main branch — leaving
one confirmation per priority band, four at the very worst. Everything else
gets the ordinary questions once per group: a test audit's severities rank how
weakly the tests protect the code rather than what happens to a user, and a
hunt finding marked as an improvement — a dead export, a missing test — is not
a defect at all, so neither one implies a priority. Never once per finding.
Decline a group and it simply stays in the report, unpromoted.

**Nobody to ask? It still runs, and says so.** A promotion inside an
unattended [`flow`](flow.md) run has no one to confirm anything, so it decides
from the evidence and writes the priority marked as its own — a
`Priority-source: derived` line naming what it assumed, and a `derived` pill
on the board row. The work is startable immediately; what is owed is your
signature, which [`next --triage`](next.md) comes back for.

**The evidence comes with it.** Each promoted item gets a `findings.md`
holding the actual evidence, impact and suggested fix — not a link to the run
artifact, which is gitignored and would resolve to nothing in anyone else's
clone. The report path stays as provenance. Re-running the same promotion
after a failure creates nothing twice: findings already promoted are skipped
and named, and anything found half-written is reported for you to look at,
never overwritten.

## Absorbing pre-existing docs (`--absorb`)

The one-time onboarding sweep for repos that had documentation before
supermodo. It finds doc files outside the convention — anywhere in the repo,
including non-convention files already inside `docs/` — classifies each
(verified contract, decision, work item, stay-and-link, stale), and walks you
through a per-file plan with two questions:

1. **Keep the content?** Where should it live (reference / ADR / backlog /
   stay-and-link)?
2. **Delete the original?** Asked only alongside the full list of places
   that still depend on the file — unresolved dependents are never deleted.

Per-file approval, nothing silent. It never runs implicitly.

**You see the plan before you answer it.** A sweep routinely covers forty
files, and forty dispositions as chat bullets get approved unread — so the
proposal is written and opened as a page first: a tree of where everything is
going, each file once, coloured by what happens to it, with the reason and the
inbound-dependency count beside it.

Anything classified as **work** gets its priority asked right there, folded
into that file's questions. An absorb is usually the first supermodo run in a
repo with years of history in it; skipping the question here is what produces
a first board of thirty unranked rows — the exact state you ran absorb to get
out of.

## Guardrails

- Never hand-edits generated files or navigation sections.
- Never reads archive prose except for a named provenance need.
- Never mutates git.

Requires: `protocols`, a valid `skills.config.json` ([config.md](config.md)).
