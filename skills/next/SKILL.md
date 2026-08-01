---
name: next
description: "Shows the worklist board — everything that could be worked on, grouped by priority, annotated with effort, execution state, dependencies and whether triage is still owed by the human — followed by at most three suggestions. Use whenever the user asks what to work on next, wants an overview of open work, asks to see the board, the backlog by priority, or what is blocked, what needs their input, or what is worth doing now. Also `--triage` to set priorities on items that lack one and `--repair` to report convention debt to librarian. Triggers on 'what should I work on', 'what's next', 'show the board', 'what's blocked', 'what needs me', 'prioritize the backlog'."
---

# next — the worklist board

> **Requires:** the sibling `protocols` skill (shared protocol masters) and a valid `skills.config.json` (create with the `config` skill). Missing either → halt with that exact pointer; never guess.

A THIN renderer. All selection semantics — priority, inheritance, execution
state, ordering, effort bands, board format, suggestion rules — live in
`../protocols/references/worklist.md`. Follow that master exactly; this file
adds only invocation and handoff.

Read `../protocols/references/worklist.md`,
`../protocols/references/docs-convention.md` (the grammar it parses),
`../protocols/references/questions.md` (for `--triage`) and
`../protocols/references/reports.md` (how every run is persisted and
published). Validate config
FIRST per `../protocols/references/config.md` — halt on missing/invalid
config, naming the field, and point at `config`.

**Never mutates documentation** (single documentation owner) and **never
mutates git**. Every change to `docs/` this skill would make is handed to
`librarian`.

That rule governs `docs/` ONLY. Run artifacts are not documentation
(`docs-convention.md` says so explicitly): this skill DOES write its own
report under `.skills/supermodo/next/` and render it, on every invocation
including `--triage` and `--repair`. Skipping that is a failed run.

## Invocation

`next [--suggest | --triage [<identity>] | --repair]`

| form | behavior |
| --- | --- |
| `next` | render the full board, then at most three suggestions |
| `--suggest` | the suggestions only, no board |
| `--triage [<identity>]` | run the intake questions for items with no stored priority — all of them, or just the named one |
| `--repair` | report convention debt; offer to hand it to `librarian` |

## Rendering (`next`, `--suggest`)

1. Start at the docs router (`docs.entry`, default `docs/README.md`); never
   infer current work from `archive/`.
2. Collect items, compute effective priority, execution state, leverage and
   effort per the master.
3. Gather read-only evidence for the context lead: current branch, last ~10
   commit subjects, uncommitted diff paths, session context. Read-only git
   only.
4. Print the board, then the suggestions, then the repairs list.
5. Offer the handoff — for the item the user picks:
   `/supermodo:flow --job work:<triad-path>` (existing triad) or
   `/supermodo:flow --job backlog:<slug>` (backlog entry). Offer only;
   nothing auto-picks and nothing auto-runs.
6. **Persist and publish** (see Report below) — write the report, invoke the
   renderer, and tell the user where the board page is.

## `--triage`

For each item lacking a valid `Priority:` line, ask the master's ≤3 closed
intake questions (closed-menu kind per the questions protocol), pre-filling
exposure from the configured main branch's local ref and stating it as an
assumption to confirm. Batch the items; one item per message.

The confirmed lines are handed to `librarian` to write — this skill writes no
DOCUMENTATION. Report which items now have a priority and which the user
deferred, then persist and publish the run (see Report).

## `--repair`

List the convention debt the master defines (missing `Priority:`, missing
`Created:`, malformed lines, cycles, dangling references) with the file and
line for each, then offer to invoke `librarian` to fix it. Changes nothing in
`docs/`, and still persists and publishes its own run (see Report).

## Report

Concise per `output.verbosity` (default concise). The board and the
suggestion block always keep the master's format — protocol-mandated
formats are never compressed.

**Persist every invocation** per `../protocols/references/reports.md`:
`.skills/supermodo/next/<YYYYMMDD-HHMMSS>.md`, carrying a `supermodo:board`
block with the resolved board — groups, per-item description, effort,
dependencies, task list with states, suggestions, triage debt and repairs.
`--triage` and `--repair` persist the same way; "what did I owe last week" is
a real question.

Then invoke the renderer and TELL THE USER the page exists — a board they are
never pointed at is a board they will not open:

```
node <skills>/reports/scripts/render.ts --report .skills/supermodo/next/<ts>.md
```

The newest of these files IS the Board tab of the HTML archive, and the
renderer opens it per `reports.open` (default `auto`).

The renderer only draws what this skill resolves: ordering, priority
inheritance and suggestion choice stay here and in the worklist master, never
in the page.
