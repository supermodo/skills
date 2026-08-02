---
name: next
description: "Shows the worklist board — everything that could be worked on, grouped by priority, annotated with effort, execution state, dependencies and whether triage is still owed by the human — followed by a shortlist of three to five things worth doing now. Use whenever the user asks what to work on next, wants an overview of open work, asks to see the board, the backlog by priority, or what is blocked, what needs their input, or what is worth doing now. Also `--triage` to set priorities on items that lack one and `--repair` to report convention debt to librarian. Triggers on 'what should I work on', 'what's next', 'show the board', 'what's blocked', 'what needs me', 'prioritize the backlog'."
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
| `next` | render the full board, then a shortlist of 3–5 things to do now |
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
   only. The gate does not depend on this — it is computed from the items
   alone — but the board and shortlist behind it do.
4. Compute the provisional board and shortlist in full — then **apply the
   triage gate** (the master's "The triage gate") before showing either.
   Untriaged = no VALID priority line, missing or malformed.

   **An untriaged priority is unknown, not P2.** Gate when **any ACTIVE item
   is untriaged** — unknown spans P0–P3, so any one of them could be the true
   lead — or when untriaged items are half or more of a board of four or
   more. Two traps to avoid:

   - Never test whether an untriaged item reached the *provisional* shortlist:
     that assumes the P2 default it is supposed to be questioning, so a hidden
     P0 sorts below the known P1s, never surfaces, and is exactly the item the
     gate exists to catch.
   - Never narrow this to *doable* items. A blocked item is still active and
     still transmits: an untriaged blocked P0 lifts its blocker, which may be
     doable and sitting in P2. Only paused, archived, dropped and invalid
     items are safely excluded — they transmit nothing.

   Then ask the three-option menu — triage all / triage the untriaged active
   items / skip. A user who skips gets the board immediately, marked
   unreliable (`caveat`). A user who triages goes through `--triage` below,
   including its librarian handoff, and THEN sees the board recomputed from
   the stored priorities.

   The gate fires **once per run** — answering it always ends in a board, so
   declining every question cannot put the same menu back on screen.
5. Print the board, then the shortlist (3–5 real, doable items — never an
   empty slot, never "nothing qualifies" while doable work exists), then the
   repairs list.
6. Offer the handoff — for the item the user picks:
   `/supermodo:flow --job work:<triad-path>` (existing triad) or
   `/supermodo:flow --job backlog:<slug>` (backlog entry). Offer only;
   nothing auto-picks and nothing auto-runs.
7. **Persist and publish** (see Report below) — write the report, invoke the
   renderer, and tell the user where the board page is.

## `--triage`

For each item lacking a valid `Priority:` line, ask the master's ≤3 closed
intake questions (closed-menu kind per the questions protocol), pre-filling
exposure from the configured main branch's local ref and stating it as an
assumption to confirm. Batch the items; one item per message.

Then **store the answers before the run ends** — the master's "Answers are
stored, or they were not collected". This skill writes no DOCUMENTATION, so
storing means invoking the single documentation owner, not printing lines for
someone to copy:

```
/supermodo:librarian --priorities
work:csv-export — P2 — capability: exports are the top support request
backlog:rate-limit-headers — P3 — improvement: nice-to-have for API consumers
```

The lines go IN the invocation, one per line: identity, an em dash, then the
priority VALUE only — `P<0-3> — <classification>: <justification>`. No
`Priority:` prefix; that belongs to the destination file and librarian adds
it. Librarian is a fresh
context: it cannot see the interview, so anything not in that list is not
written. Invoke it; do not describe it. Then re-read the touched `spec.md` /
`BACKLOG.md` files and confirm each line is actually there — confirmation is
reading the file, not the absence of an error.

Report three groups, explicitly: priorities now **stored**, items the user
**deferred**, and priorities **not stored** — named.

**If any answer failed to store** (librarian unavailable, a line rejected, a
partial write), follow the master's failure path: render the board anyway,
set `caveat` on it, and report `status: failed`.

**`failed`, not `needs-input`, and `questions` stays EMPTY.** The user answered
every question that was asked; the machinery failed to write the answer down.
Nothing is waiting on them, so `needs-input` would be false under the status
invariant in `reports.md` and would park a settled question in the archive's
"Needs you" tab. What went wrong is operational, and `failed` is what says so.

**Then write the confirmed lines into the report body, verbatim, in handoff
format** — `<identity> — <priority value>`, one per line, under a heading that
says what they are. That block is the whole value of a failed store: it makes
the run retryable by pasting it into `/supermodo:librarian --priorities`,
instead of putting the user back through the interview. Losing answers the
user already gave is the one outcome this path exists to prevent.

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
`.skills/supermodo/next/<YYYYMMDD-HHMMSS>.md`.

**The body of that report OPENS with a `supermodo:board` block** — the exact
shape is in `reports.md` under "supermodo:board"; read it and follow it
literally. The block carries the whole resolved board: suggestions, priority
groups, and per item its description, effort, execution state, dependencies,
progress and task list with per-task state.

**Set `caveat` by re-evaluating the gate, not by remembering how the run
went.** Immediately before rendering, test the gate condition against the
board you are about to write: any untriaged ACTIVE item, or untriaged items at
half or more of four-plus. Still true → set `caveat`. Do not ask again — the
gate asks once — and do not reason from which branch the user took.

That matters because the gate can be answered and still leave the order
unknown: the user triages but defers three items, or answers everything and
the store fails, or triages only what reaches the shortlist. In each case they
have just been through an interview and now most reasonably believe the board
reflects it. Checking the condition catches all of them; recalling "did they
skip?" catches one.

One sentence naming the numbers (`"31 of 34 items have no stored priority —
this order is a guess."`). Omit it entirely when the condition is false: a
banner on every board is a banner nobody reads.

**Identity always carries its kind** — `work:<slug>` for a triad,
`backlog:<slug>` for a backlog entry. A bare slug tells the reader nothing
about what they are looking at, and is what `flow --job` needs anyway.

**`unblocks` names the items** it unblocks, never a count.

**Every item carries its own `command`** — the next action for THAT item, so
the board answers "how do I start this" for all 34 rows, not just the
shortlist. `/supermodo:flow --job backlog:<slug>` to start a backlog entry,
`/supermodo:flow --job work:<slug>` to continue a triad,
`/supermodo:next --triage <slug>` when it has no priority yet.

**Preserve the task grouping.** If `tasks.md` divides its checklist under
headings, every task carries that heading as its `group` — the board shows
the same decomposition the author wrote. Never flatten a grouped checklist.

**Supply `modified`** for triads — the last commit date touching the triad
directory (`git log -1 --format=%ad --date=short -- <path>`, read-only). It
orders the board and tells the user what they were last living in.

**An item with any task done is `in-progress`,** never `not-started` — see
the execution-state table in the worklist master.

**The shortlist holds 3–5 REAL items** — no placeholder entries, no "nothing
qualifies" while doable work exists. Roles are labels earned in board order,
per the worklist master.

**Every open item carries its `tasks` array** — the whole checklist with each
task's state, read from `tasks.md`. The accordion exists to show them; an item
without them renders as an empty drawer. Same for `command` on every
suggestion: it is what the user copies.

**Never render the board as markdown tables.** A table renders as a wall of
text and the Board tab loses everything — the block IS the board. Prose that
is not the board (a triage transcript, the lines owed to `librarian`) goes
BELOW the block as ordinary markdown.

`--triage` and `--repair` persist the same way, block included — a triage run
still knows the whole board, and "what did I owe last week" is a real
question.

Then invoke the renderer with NO target, so it refreshes everything and opens
the **archive index** — whose front page is the Board:

```
node <skills>/reports/scripts/render.ts
```

Open the index, never the individual report page: the board belongs in its
tab, next to the runs and to what needs the user. Name the opened path in the
final message. The newest `next/<ts>.md` IS the Board tab, and the renderer
opens it per `reports.open` (default `auto`).

The renderer only draws what this skill resolves: ordering, priority
inheritance and suggestion choice stay here and in the worklist master, never
in the page.
