---
name: work
description: "Lead implementer: use the docs router to load the active task and its context chain, pick or receive the next incomplete task, implement it under project conventions, then cross-provider adversarially verify the diff. Use to resume roadmap work, start or continue a task, implement the next item, or as flow stage 2. In flow mode the interview is skipped and doc mutation is left to librarian."
---

# work — lead implementer

> **Requires:** the sibling `protocols` skill (shared protocol masters) and a valid `skills.config.json` (create with the `config` skill). Missing either → halt with that exact pointer; never guess.

> **Docs names come from config.** Every `docs/…` path below is the DEFAULT. Resolve folder and file names from `skills.config.json` → `docs.layout` (defaults when unset) before reading or writing — a path typed from memory writes a second tree beside the real one. See `../protocols/references/docs-convention.md`.

> **Project rules.** Read `.supermodo/rules/work.md` if present, plus any
> `.supermodo/rules/INDEX.md` rows naming `work` — that file IS this project's
> work process and replaces the defaults below wherever they overlap. Contract:
> `../protocols/references/rules.md`. Never in that file, so never switchable off:
> never mutating git, and the implementing provider never verifying its own work.

Pick up the next task, build the right team, drive it to completion, and get
it independently verified. Start at the docs router; project constraints come
from docs, not from this file.

**Invocation:** `work [task-focus] [--worktree | --no-worktree]`. The flags
opt this run into (or out of) worktree-per-task isolation, overriding config
`workspace.worktree`; neither flag → follow the config default (off when
unset). See **Step 3.5** and the worktree-mode contract in
`../protocols/references/handoff.md`.

Read `../protocols/references/docs-convention.md`, `../protocols/references/worklist.md`,
`../protocols/references/questions.md`,
`../protocols/references/models.md` (seats, approval, staffing, independence),
`../protocols/references/cross-model.md`, `../protocols/references/adversarial-review.md`,
`../protocols/references/handoff.md`, `../protocols/references/reports.md`. The
reviewer seats live in `sequence.json` beside this file (variants `standard`,
`same-lineage`, `deep`). Validate config FIRST per
the config contract — halt on missing/invalid config, naming the field, point
at `config`. **Never mutate git** (no commit/merge/rebase/push).

> **Cross-tool note (Claude Code ↔ Codex).** Written in Claude Code idioms.
> Under Codex, translate: `$ARGUMENTS` = the invocation argument; the `Agent`
> tool with `subagent_type = <file>` = dispatch the matching agent from the
> config `agents.dir` roster (a role file declares `job: <class>` and never
> a model; roles are never mirrored into a host's native agents dir); "use AskUserQuestion" = ask
> in chat. If a role has no host-native agent file, read that role's
> definition and apply its checklist inline.

## Step 1 — detect current state

Read the router (`docs.entry`, default `docs/README.md`) before following any
doc path. Resolve the active program/initiative and the next incomplete task
from the live documents; never infer current work from `archive/`. If the
user names a task focus, use it as the override; otherwise take the worklist
priority lead per `../protocols/references/worklist.md` — never a bespoke
ordering — and, within the chosen triad, its next unchecked task.

## Step 2 — load context chain (in order, skip nothing)

1. The active-work doc the router resolves — current initiative, status,
   dependencies.
2. The task triad — `spec.md`, `plan.md`, `tasks.md`; find the next
   incomplete task (pending `- [ ]` or in-progress `- [/]`, per the
   convention's task states) by its immutable `<!-- task:slug -->` ID,
   never by position or title.
3. Every linked `reference/` contract and `decisions/` ADR relevant to the
   task.
4. The agent roster from config `agents.dir` (if present) — read each agent
   file's description to know which roles apply to this task's domain.

A plan or spec is never evidence that behavior exists. Do not read archive
material unless a live doc names a specific provenance need.

## Step 3 — interview (plan phase)

Per `../protocols/references/questions.md`: triage first — discoverable facts answered
from code/docs (never reach the user); technical tradeoffs consult the
adversary model, surfacing only on unresolved conflict; product/scope/
preference ALWAYS reach the user. Transport = chat by default
(`questions.transport`); class-c always goes to the user. Cover approach and
tradeoffs, ambiguities, edge cases, scope (narrow/expand), and dependencies
on other tasks.

**Flow mode exception:** when invoked by `flow` (stage 2), grill already ran
the interview at stage 1 — SKIP this step and execute the locked triad.

## Step 3.5 — worktree (only when enabled)

Resolve worktree mode: `--worktree`/`--no-worktree` wins, else config
`workspace.worktree` (default off). When ON, do this ONCE here, before
spawning any teammate, per the worktree-mode contract in
`../protocols/references/handoff.md`: ask the user the path + branch
(suggest `worktrees/<task-slug>` off the project root, new branch
`<task-slug>`; initiative slug flattens to `<program>-<NN-slug>`), then
`git worktree add -b <branch> <path> <dev-base>` (`dev-base` =
`release.branches.dev`, default `dev`), gitignore the worktree dir, and make
that path the designated tree for the rest of the run. Creation failure →
halt and report; never silently fall back to the main tree. When OFF, the
designated tree is the main working tree (this step is a no-op).

## Step 4 — activate teammates

Discover the roster from config `agents.dir`; read each agent file's
description to pick the roles relevant to this task (implementers, reviewers,
test/quality, infra). Propose the team (roles + assigned files) to the user
and wait for confirmation. Spawn them as subagents/teammates working in the
run's **designated tree** — the main tree, or the task worktree from Step 3.5
when worktree mode is on (pass its absolute path in every spawn prompt; one
shared worktree per task, never one per subprocess) — and monitor them per
the liveness protocol
(`../protocols/references/handoff.md`, "Liveness"): periodic progress
checks, stalled teammate = stop + one fresh retry, second stall = that
assignment fails loud, never hangs the run.

**If no roster is configured, subagents are unavailable, or the user
declines:** work as a single agent, but apply each relevant role's checklist
inline before considering the task done.

## Step 5 — execute

- **Project code constraints come from docs**, not hardcoded here: read the
  conventions prose the config points at (`docs.conventions`, e.g.
  `docs/CONVENTIONS.md`). Honor it exactly.
- **Tiered testing via config `commands`** (argv arrays; first use of each
  command in a session requires explicit user approval):
  - after every change → `commands.test` (fast targeted suite);
  - at task completion → `commands.testUnit` + `commands.lint`;
  - integration-sensitive work → `commands.testAll`.
  A command absent from config → that tier is skipped; say so, never invent a
  command. **Zero tolerance for failures** at every tier: fix before
  proceeding, before marking done, before status updates.
- Write tests alongside implementation, not after — prefer the `tdd` skill
  (development mode: red-green-refactor) to drive each behavior.

## Step 6 — adversarially verify

When the task is complete, the implementer never verifies its own work. The
reviewer is a seat the broker resolves from the user's approved assignments
(`../protocols/references/models.md`); this skill never names a model and never
composes a CLI call. `<skills>` = the installed supermodo skills folder;
`<host>` = `claude` or `codex`.

1. **Plan the seats at step 0, not here** — the very first thing `work` does
   after loading context is
   `node <skills>/protocols/scripts/broker.ts plan --skill work --project-root <root> --host <host> --host-pin <your exact model id> [--variant <v>]`
   so an unstaffed reviewer is learned at minute 0, never after the
   implementation. `proposal` non-null → ONE approval table, closed menu
   **approve all / change rows by number / decline** (default decline), persist
   via `node <skills>/config/scripts/models.ts approve <proposalFile> --project-root <root>`,
   plan again. `staffed: false` → **staff it / run a fully staffed variant /
   abort**; never start with a hole, never downgrade. Unattended → `needs-input`.
2. **The orchestrator runs the tests** (`commands.test`, `commands.testUnit`,
   `commands.lint`) and writes command · exit status · output · the reviewed
   commit/tree hash to a file. The reviewer never executes anything.
3. **Brief the reviewer**: the brief is `roles/reviewer.md` (this skill's folder). Then
   `node <skills>/protocols/scripts/broker.ts dispatch --plan <planFile> --seat review --brief <file> --schema <skills>/protocols/schemas/review-verdict.schema.json`.
   A `deep` variant fans `review` out over the roster's reviewers and adds a
   fresh-session `verify` seat that checks each finding against the code.
4. **Dispose of every finding** — accept and change, or rebut with a specific
   codebase reference; bare disagreement is invalid. A finding the reviewer
   cannot tie to `file:line` + a quote is `uncertain`, never blocking. The
   reviewer REPORTS; it never rewrites.
5. **On REVISE**, fix, re-run the tests, and dispatch the same seat with
   `--resume` and a DELTA brief (diff since the reviewed snapshot + per-finding
   dispositions + round number). Cap: **five rounds**, then the user decides
   with both positions verbatim. Low/informational findings never restart a
   round. Persist each verdict as it forms.
6. **Run-time failure** (`status: failed` — rate limit, identity mismatch,
   stall, retired pin): stop the task here, keep the tree and the verdict
   files, report seat / requested pin / cause / "verification absent", and
   offer fix and retry / abort. `unreviewed` output is no verdict, never
   approval. Nothing is ever substituted — the implementer never grades
   itself, and a `same-lineage` variant's verdict is reported as "reviewed,
   not independent".
7. The report carries the seating table, the independence level reached
   (`cross-lineage` / `same-lineage` / `none`), requested vs effective model
   per seat, and the ledger (`broker.ts ledger --project-root <root> --run <id>`).

## Step 7 — documentation

- **Flow mode:** do NOT mutate docs (single-owner rule). Emit `drift_notes`
  and `decisions` in the stage report frontmatter (`../protocols/references/reports.md` /
  `../protocols/references/handoff.md`); the stage-7 librarian pass persists them. Return
  a compressed summary (≤ ~10 lines).
- **Standalone mode:** after verification passes, you MAY invoke `librarian`
  (no args) for full closeout — reconcile code/docs, promote knowledge,
  archive, regenerate nav. Re-run the matching test tier if librarian changed
  any behavior-governing artifact.

Hand the clean working tree to the user. Never commit, merge, rebase, or
push — the user performs all git operations.

## Persist and publish

Standalone runs write this report to
`.skills/supermodo/work/<YYYYMMDD-HHMMSS>.md` per
`../protocols/references/reports.md` — a result living only in chat dies with
the session. Then publish it:

```
node <skills>/reports/scripts/render.ts --root <project-root> --report <that path>
```

and NAME the page in your final message. Inside a `flow` run this does not
apply: the stage report is the artifact and the orchestrator renders the one
run page.

Sections, same order every run: **What was built** · **Tasks closed** (which
`tasks.md` IDs moved, and to what state) · **Verification** (which tiers ran,
which model verified, what it said) · **Drift observed** · **Decisions taken**
· **Left for the user**.

**Close the final chat message of a STANDALONE run with the board pointer**,
one line, last:

```
Board is stale (docs changed) — run `/supermodo:next`.
```

A standalone run moves task states in `tasks.md`, and usually runs a librarian
closeout on top, so the board the user last saw is a snapshot of the state
before this run. It is a POINTER (`../protocols/references/worklist.md`): no
question, no consent gate, nothing auto-run — a board fires its own triage gate
and must never do so unasked.

In flow mode this line is the orchestrator's, not the stage's: work mutates no
docs there, and the run reports once at the end.

**`task` is never omitted here.** Work always runs against a triad — that is
what makes it work rather than a patch — so the report carries the triad slug
and the archive index links it to the item on the board. A `work` report with
no `task` is a bug in the run, not a stylistic choice. When several tasks
closed, a `supermodo:bars` of `done` / `in-progress` / `remaining` for that
triad shows how far the item has moved; when only one did, the sentence is
better than the chart.

Frontmatter: `status` is `needs-input` whenever the run stopped on a question
(with it in `questions`), `failed` when verification did not pass, `ok`
only when the tree is clean and the tiers are green.
