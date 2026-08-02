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
priority moves to the new task unchanged.

It fills blanks and nothing else: an item that already has a valid priority is
left alone and the conflict reported, because priorities are yours and are
frozen once set. Malformed or unresolvable entries are rejected individually
and named, never guessed at.

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
