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

## Guardrails

- Never hand-edits generated files or navigation sections.
- Never reads archive prose except for a named provenance need.
- Never mutates git.

Requires: `protocols`, a valid `skills.config.json` ([config.md](config.md)).
