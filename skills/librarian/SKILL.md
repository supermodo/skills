---
name: librarian
description: "Sole owner of documentation mutations: run the lifecycle pass to close out completed work, reconcile docs and agent definitions with code, promote verified contracts, record ADRs, archive finished tasks, regenerate navigation, and repair links. Also manages the backlog, runs new-task intake, and (with --absorb) performs the one-time sweep that classifies and absorbs pre-existing documentation into the convention. Use for docs maintenance, task closeout, documentation or instruction drift, backlog operations, `--task` intake, `--absorb` onboarding of existing docs, or a flow stage-7 alignment pass."
---

# librarian — the single documentation owner

> **Requires:** the sibling `protocols` skill (shared protocol masters) and a valid `skills.config.json` (create with the `config` skill). Missing either → halt with that exact pointer; never guess.

Sole owner of documentation mutations. Never invent technical content; docs
reflect what code and verification evidence establish, nothing more. Every
run starts at the docs router (`docs.entry` from config, default
`docs/README.md`). Never infer current work from `docs/archive/`.

Read `../protocols/references/docs-convention.md` (the layout + rules you enforce),
`../protocols/references/reports.md` (drift/decision inputs), `../protocols/references/questions.md`,
and `../protocols/references/grilling.md` (for `--task` intake). Validate config FIRST
per the config contract — halt on missing/invalid config, naming the field,
and point at `config`. Never mutate git (no add/commit/merge/rebase/push).

## Config & scripts

- Read `skills.config.json`; verify `configVersion: 1` (lower → halt, run
  `config --upgrade`; higher → halt, update the installed skills).
- Docs router = `docs.entry` (default `docs/README.md`).
- Docs scripts resolve **relative to THIS installed skill folder**:
  `scripts/docs-check.ts`, `scripts/docs-generate.ts` (plain Node, zero
  deps) — invoked
  `node <skill-dir>/scripts/docs-check.ts <project-root> <docs.entry> [docs.conventions]`
  (always pass the configured `docs.entry` as the second argument — both
  scripts derive the docs directory from it — and `docs.conventions` as the
  third when set).
  Only when `commands.docsCheck` / `commands.docsGenerate` are set in config
  do those argv arrays override the bundled scripts (a project override, not
  a config-supplied path to the bundle). First use of a configured command
  in a session requires explicit user approval.

## Modes

- **no args** — full lifecycle pass (below). `work` (standalone closeout) and
  `flow` stage 7 invoke this.
- **`--backlog <op>`** — operate ONLY on `docs/work/BACKLOG.md` (below).
- **`--task [description]`** — new-task intake (below): grill → create the
  triad.
- **`--priorities`** — write confirmed triage answers into the items they
  belong to (below). Nothing else.
- **`--absorb`** — one-time, explicit-only sweep of pre-existing
  documentation outside the convention (below). Never runs implicitly.

Never combine a backlog op, `--task`, `--priorities`, or `--absorb` with the
full lifecycle pass implicitly.

## `--task` intake

Turn a request into a `docs/work/` triad via the grilling protocol —
flat (`work/<task-slug>/`) by default, or inside a program
(`work/<program>/NN-<slug>/`, next free `NN`) when the user names one or
the task clearly belongs to an existing program (confirm, never guess).
Three sources feed it:

- **free text** — full intake (the steps below);
- **`--backlog graduate <slug>`** — this same flow, seeded from that
  backlog entry;
- **an existing `docs/work/` triad** (flat or program initiative) — no
  creation: validate it
  against the convention, grill ONLY the gaps found (missing acceptance
  evidence, stale plan, tasks without IDs), and refine in place.

1. Confirm the ask. Until grill resolves and the user signs off, hold the
   proposal in session state — **create/edit NO documentation file yet**.
2. Run the grilling protocol (invoke `grill`, or follow
   `../protocols/references/grilling.md` directly): twin-agent adversarial interview —
   independent plans, disprove rounds, class-scoped question routing, custom
   answers re-fought once. If the opposite provider is unavailable, degrade
   honestly (labeled single-model), never fake a second opinion.
3. On user sign-off, create the triad from the convention:
   - `spec.md` — goal, non-goals, scope, acceptance evidence, plus the work
     metadata from the docs convention: `Created: YYYY-MM-DD`, a `Priority:`
     line from the worklist intake questions
     (`../protocols/references/worklist.md` — ask them here, they are part
     of intake), and a `## Open questions` checklist with immutable
     `<!-- question:slug -->` IDs for anything the grill left owed by the
     user.
   - `plan.md` — approach, steps, risks, alternatives considered.
   - `tasks.md` — checklist with **immutable inline task IDs**
     (`- [ ] Do X <!-- task:do-x -->`), kebab-case, unique, never reused.
   Durable decisions → new ADRs; both positions of each resolved question
   logged.
4. If it graduated from a backlog entry, replace that entry with a dated
   graduation pointer to the new triad (never erase history), and carry its
   stored priority across — it was already answered and confirmed by the user,
   and re-asking is how a frozen value drifts. Ask the intake questions only
   when the entry carried none.

   **Carry the VALUE, re-emit the field name.** The two files spell the field
   differently — `  priority: P1 — …` indented under a backlog entry,
   `Priority: P1 — …` at the top level of `spec.md`. Copying the source line
   verbatim lands a lowercase, indented key in `spec.md`, which the worklist
   reads as no valid priority at all and renders as provisional `P2 — unset`.
   The backlog entry is being replaced by a pointer in this same step, so the
   confirmed P0 is then gone from both files. Take everything after the colon
   and write `Priority: <that value>`.
5. Run docs-generate, then docs-check. Report.

Do not implement the plan, edit production code, or start `work`.

## `--backlog` operations (on `docs/work/BACKLOG.md`)

- `list [term]` — show matching live and struck-through entries.
- `add <slug> <text>` — entry in the convention's exact grammar
  (`- **<slug>** (YYYY-MM-DD): <text>` — see Dependencies in the docs
  convention) under the best existing section; keep the user's wording, add
  constraints as indented lines. Dependencies use the exact form
  `depends: <slug>[, <slug>…]` on its own indented line (the only
  machine-parsed constraint). Run the worklist intake questions
  (`../protocols/references/worklist.md`) and record the confirmed
  `priority:` as a second indented line; the user may decline, leaving the
  entry provisional.
- `edit <slug> <text>` — change only the named entry.
- `drop|remove <slug> <reason>` — strike through with a dated reason
  (`remove` is a compat alias); never erase history.
- `reap` — delete only already-dropped entries after confirming their
  disposition is recorded elsewhere or intentionally abandoned.
- `graduate <slug>` — run `--task` intake seeded from that entry.
- `next` — alias for the `next` skill: hand over to it and let it run in full
  (its own board, its own triage gate, its own report and page). This op is a
  redirect, not a librarian operation: none of the `--backlog` rules above
  apply to it, and it is NOT covered by "backlog ops write no report" —
  suppressing `next`'s report because it was reached through this alias would
  lose the board. Librarian defines no selection rules of its own; selection
  stays with the user.

## `--priorities` — record confirmed triage answers

The receiving door for `next --triage`. That skill runs the interview and
owns the semantics; it cannot write documentation, so the confirmed lines
arrive here. This mode exists so triage answers reach disk in the same run
they were given — a priority the user confirmed and nobody stored will be
asked for again, which is the one outcome triage must never produce.

**Input arrives in the invocation itself** — one pair per line, nothing else:

```
work:csv-export — P2 — capability: exports are the top support request
backlog:rate-limit-headers — P3 — improvement: nice-to-have for API consumers
```

Identity (`work:<slug>`, `work:<program>/NN-<slug>` or `backlog:<slug>`), an
em dash, then the priority VALUE — `P<0-3> — <classification>: <justification>`
and nothing more. The value carries no field name: the `Priority:` /
`  priority:` prefix belongs to the destination file and step 3 adds it, so a
line arriving with one already attached has it stripped, never doubled.

You did not see the interview that produced these and must not reconstruct it:
what is in the list is what gets written, and if the list is empty or absent,
say so and write nothing rather than going looking for answers elsewhere.

1. Resolve each identity to its file: a triad → its `spec.md`; a backlog
   entry → its line in `docs/work/BACKLOG.md`. Unresolvable or ambiguous →
   write nothing for that one and report it; never guess which item was meant.
2. Validate each line against the worklist grammar
   (`../protocols/references/worklist.md`: `P<0-3> — <classification>:
   <justification>`). Malformed → reject that line, report it, keep going.
3. **Look before writing**, then write ONE field. Triage collects items whose
   priority line is missing *or malformed*, so "no valid priority" does not
   mean "no priority line" — appending to a file that already has a broken one
   leaves two, which the grammar forbids and which makes every later reader
   disagree about the real value. Scan the destination for any existing
   priority field first, case-insensitively, and act on what is there:

   | found in the destination | do |
   | --- | --- |
   | nothing | add the field: `Priority:` on its own line in `spec.md`, `  priority:` indented under the entry in `BACKLOG.md` |
   | one MALFORMED field | replace that line in place — same position, correct grammar. This is the repair triage was run for. |
   | one VALID field | write nothing, report the conflict, leave the stored value alone. Priorities are user-owned and frozen at intake; this mode fills blanks and repairs breakage, it never re-triages. |
   | two or more priority fields | write nothing, report it for explicit repair. Which one the user meant is not knowable, and picking one silently discards the other. |

   Never append a second field on any path. `docs-check` runs at step 5, after
   the write — it reports a duplicate, it does not prevent one.
4. Touch no other CONTENT: no lifecycle pass, no archiving, no promotion, no
   other field of any file, no file not named in the list.
5. Run docs-generate, then docs-check. Generated navigation is mechanical
   output, not content — refreshing it is expected here and is the one thing
   step 4 does not forbid. Report per item: written, rejected (with why), or
   already set.

Report the outcome per item so the caller can tell the user exactly which
answers are now stored and which are not.

## `--absorb` — sweep pre-existing documentation (explicit flag only)

One-time onboarding sweep for repos that had documentation before
supermodo. It runs ONLY when invoked with this flag — it is not part of the
lifecycle pass; `config` bootstrap directs the user to run it once after
scaffolding when its scan saw docs outside the target paths.

1. **Discover** candidates read-only, in BOTH places docs hide:
   - OUTSIDE `docs/`: root `ARCHITECTURE.md`/`CONTRIBUTING.md`, `notes/`,
     wiki exports, per-package `README.md`s, …
   - INSIDE `docs/` but outside the convention: any file that is not the
     router, `CONVENTIONS.md`, or under `work/`, `decisions/`,
     `reference/`, `archive/` — e.g. a pre-existing `docs/architecture.md`
     or `docs/setup/` from before supermodo.

   Exclude vendored/generated content (`node_modules`, lockfiles, files
   carrying the `<!-- supermodo:generated -->` marker). The root
   `README.md` is a candidate for LINKING from the router, never for
   moving.
2. **Classify** each candidate from its content: verified contract →
   `docs/reference/`; durable decision → new ADR; planned/ongoing work →
   backlog entry or triad; tool- or ecosystem-facing file that must stay at
   its path (per-package README, CONTRIBUTING, LICENSE-adjacent) → keep in
   place + link from the router; stale or superseded → deletion candidate.

   **Anything classified as work gets the worklist intake questions**
   (`../protocols/references/worklist.md`, "Every item is born with a
   priority") as part of its disposition — asked once, with the file in front
   of the user, before the entry or triad is written. An absorb is usually the
   FIRST supermodo run in a repository that already has years of work in it;
   skipping the questions here is what produces a first board of thirty
   `P2 — unset` rows, which is precisely the state the user is running absorb
   to get out of. Batch them with the file's disposition questions rather than
   as a second pass — one interruption per file, not two. A decline leaves
   that item provisional, which is fine; not asking is not.
3. **Disposition plan — approval-gated, two questions per file** (questions
   protocol; files may be grouped by proposed disposition, but every file
   is listed individually).

   Write the plan and render it BEFORE asking
   (`../protocols/references/reports.md`, "Show what you are asking about") —
   an absorb sweep routinely covers forty files, and forty dispositions read
   as chat bullets get approved unread. Draw it as a `supermodo:tree` of the
   proposed destination, every candidate appearing once under where it is
   going, `state` `ok` moved / `warn` kept in place and linked / `bad`
   deleted, and `meta` carrying the reason and the inbound-dependency count.
   The per-file questions follow it, and the report is where the user checks
   what they are answering about.

   The questions themselves:
   1. **Keep the content?** Is this file relevant enough for its content to
      live in the documentation — and where (reference / ADR / backlog /
      stay-and-link)?
   2. **Delete the original?** Asked only WITH the dependency list: every
      inbound link, code reference (grep), and tooling/CI path that points
      at the file. Unresolved dependents → never delete; propose updating
      the dependents or leaving a pointer stub instead.
4. **Execute** only the approved dispositions (write-temp-then-rename).
   Moves carry content verbatim; anything condensed is labeled a summary
   with a pointer to its source. Nothing is deleted or moved without its
   per-file approval.
5. Run docs-generate, then docs-check. Complete the report started at step 3
   with the per-file outcomes — including every file deliberately left
   untouched — and move its frontmatter off `needs-input`.

   **`questions` is emptied either way**; the questions were answered, and
   that is true regardless of how execution then went. Leaving them parks the
   run in the archive's "Needs you" tab forever.

   **`status` is earned, not assumed.** `ok` ONLY when every approved
   disposition executed and both docs-generate and docs-check came back
   clean. Anything else — a move that failed, a delete that could not
   complete, a red docs-check — is `failed`, naming the exact operation that
   broke and the file it was on.

   This step moves and deletes documentation. A partial absorb leaves the
   docs tree half-migrated, with links pointing at files that are no longer
   there, and it is the single most expensive state this skill can produce.
   Reporting that as `ok` because the run reached the end hides it at exactly
   the moment the user needs to see it — and the archive, which is where they
   would look, would be showing a clean green run.

## Lifecycle pass (no args)

1. Run docs-check; retain the complete issue list as the worklist.
2. Split live docs above 40 KB at responsibility boundaries; leave a short
   landing doc at the stable path and repair links.
3. For completed work: verify behavior against code + evidence, promote
   current contracts to `docs/reference/` and durable choices to new ADRs,
   then move the whole work folder to the archive per the convention's
   flattened naming (`YYYY-MM-<task-slug>`, initiatives
   `YYYY-MM-<program>-<NN-slug>`; a program whose last initiative archives
   sends its README to `YYYY-MM-<program>/` and the empty dir is removed)
   verbatim.
4. Validate ADR supersession metadata. Bodies and original decision metadata
   are immutable after acceptance; only lifecycle fields
   (`proposed | accepted | superseded-by: ADR-NNNN | rejected`) update, and
   only mechanically.
5. Promote verified assumptions only when evidence, verification date, and
   revalidation trigger are recorded. Specs and plans are never evidence;
   `reference/` holds only verified contracts.
6. Run docs-generate, then docs-check. Never hand-edit any file carrying the
   `<!-- supermodo:generated -->` marker or inside the
   `<!-- supermodo:nav:start/end -->` delimiters.
7. Review reference docs whose governed code changed: fix mechanical drift;
   stop and ask the user about substantive conflicts (questions protocol).
8. Reconcile `CLAUDE.md` / `AGENTS.md` and the agent roster (config
   `agents.dir`, e.g. `.claude/agents/` or `.codex/agents/`) with current
   contracts. Treat a misrouted or weak agent definition like a failing
   test: correct its description/behavior in the same pass.

## Flow integration (stage 7)

When invoked as `flow` stage 7, additionally ingest the run's stage reports
(`../protocols/references/reports.md` format): read every `drift_notes` and queued
`decisions` entry from stages 1–6 and persist them here — ADRs for durable
decisions, triad/reference updates for drift. This is the ONLY stage besides
stage 1 where docs mutate; stage agents only reported drift, they never wrote.
Resolve real paths and stay within the project before any `.skills/supermodo/`
read (containment rule).

## Guardrails

- Single documentation owner: never delegate doc mutation to a second owner;
  other skills report drift, librarian resolves it once.
- Librarian is the ONLY writer of `Priority:`, `Created:` and
  `## Open questions`. The `next` skill and every other reader hands its
  proposed lines here; they never write docs themselves.
- Never hand-edit generated files or nav sections.
- Never read archive prose by default — only for a specifically identified
  provenance need.
- Never mutate git.
- Report any technical judgment that cannot be established from current code
  and evidence, rather than inventing it.

## Report

Summarize: task closeout, reconciled instructions/agent definitions,
promoted / split / archived / generated files, docs-check result before and
after, and any user decisions still required. Concise chat reporting per
`output.verbosity` (default concise); generated artifacts always follow the
convention formats.

## Persist and publish

Per `../protocols/references/reports.md` ("What earns a report"), which of
librarian's modes produce one is **not** uniform — the rule is whether the run
produced reasoning that exists nowhere else:

| mode | report |
| --- | --- |
| lifecycle pass (no args) | **yes** — the docs-check delta, what was promoted, archived and split, and the decisions still owed live only here |
| `--task` | **yes** — the grill transcript and the resolved intake answers exist nowhere but this file |
| `--absorb` | **yes** — the per-file dispositions, including every file deliberately left untouched |
| `--backlog add/edit/drop/reap/list` | **no** — write nothing, render nothing |
| `--backlog next` | **not librarian's** — this is an alias; the `next` skill runs and writes its own report exactly as it always does. Librarian adds nothing and suppresses nothing. |
| `--priorities` | **no** — the lines are in the files; the caller reports the outcome |

A backlog operation's entire result is the line it wrote in `BACKLOG.md`:
already permanent, already in git, and it reaches the user on the next board
as an item. A second copy under `.skills/supermodo/` teaches nobody anything,
and a browser tab announcing a one-line insert is an interruption charged
against a five-second task. Say what changed in chat and stop — no file, no
page, no renderer call.

For the modes that DO earn one: write it to
`.skills/supermodo/librarian/<YYYYMMDD-HHMMSS>.md`, set `task:` when the run
was about one work item (`--task` always is), then publish it:

```
node <skills>/reports/scripts/render.ts --report <that path>
```

and NAME the page in your final message. Sections, in this order: **What
changed** · **Docs-check** (issues before vs after as a two-bar
`supermodo:bars`, `state` `bad` → `ok` — a before/after pair is the
comparison a bar chart is for; when both numbers are zero, write the sentence
instead) · **Promoted / archived** · **Decisions owed by the user** (also in the
`questions` frontmatter — that is what surfaces them in the archive index).

Inside a `flow` run none of this applies: the stage report is the artifact and
the orchestrator renders the one run page.
