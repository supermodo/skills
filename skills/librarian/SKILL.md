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
- **`--absorb`** — one-time, explicit-only sweep of pre-existing
  documentation outside the convention (below). Never runs implicitly.

Never combine a backlog op, `--task`, or `--absorb` with the full lifecycle
pass implicitly.

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
   graduation pointer to the new triad (never erase history).
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
- `next` — alias for the `next` skill: render the board and its suggestions
  per `../protocols/references/worklist.md`. Librarian defines no selection
  rules of its own. Report only — selection stays with the user.

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
3. **Disposition plan — approval-gated, two questions per file** (questions
   protocol; files may be grouped by proposed disposition, but every file
   is listed individually):
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
5. Run docs-generate, then docs-check. Report per-file outcomes — including
   every file deliberately left untouched.

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

Standalone runs write this report to
`.skills/supermodo/librarian/<YYYYMMDD-HHMMSS>.md` per
`../protocols/references/reports.md` — a result living only in chat dies with
the session. Then publish it:

```
node <skills>/reports/scripts/render.ts --report <that path>
```

and NAME the page in your final message. Inside a `flow` run this does not
apply: the stage report is the artifact and the orchestrator renders the one
run page.
