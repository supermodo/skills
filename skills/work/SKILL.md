---
name: work
description: "Lead implementer: use the docs router to load the active task and its context chain, pick or receive the next incomplete task, implement it under project conventions, then cross-provider adversarially verify the diff. Use to resume roadmap work, start or continue a task, implement the next item, or as flow stage 2. In flow mode the interview is skipped and doc mutation is left to librarian."
---

# work — lead implementer

> **Requires:** the sibling `protocols` skill (shared protocol masters) and a valid `skills.config.json` (create with the `config` skill). Missing either → halt with that exact pointer; never guess.

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
`../protocols/references/cross-model.md`, `../protocols/references/adversarial-review.md`,
`../protocols/references/handoff.md`, `../protocols/references/reports.md`. Validate config FIRST per
the config contract — halt on missing/invalid config, naming the field, point
at `config`. **Never mutate git** (no commit/merge/rebase/push).

> **Cross-tool note (Claude Code ↔ Codex).** Written in Claude Code idioms.
> Under Codex, translate: `$ARGUMENTS` = the invocation argument; the `Agent`
> tool with `subagent_type = <file>` = dispatch the matching agent from the
> config `agents.dir` roster (same roles mirrored per host, e.g.
> `.codex/agents/*` alongside `.claude/agents/*`); "use AskUserQuestion" = ask
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

When the task is complete, the implementing provider must NOT verify its own
work. Per `../protocols/references/cross-model.md` + `../protocols/references/adversarial-review.md`:

- Launch the OPPOSITE provider as a **read-only** reviewer (Claude impl →
  Codex; Codex impl → Claude). Never substitute a same-provider agent. If the
  opposite CLI is absent/unauthenticated/can't run the proof, stop and ask
  the user (fix+retry / continue single-model / abort) — never fake a second
  opinion.
- Give it the spec, the current diff, the applicable convention constraints,
  and the exact tier commands. Permit source reads + test runs; forbid edits,
  commits, implementation.
- Require a structured `APPROVED` / `REVISE` verdict with findings, evidence,
  commands run, residual risks. Burden of proof is on the diff; "no material
  objection found" is a valid, logged outcome.
- On `REVISE`, fix and resume the SAME reviewer session with the new diff.
  Loop until agreement or the **five-round cap**; when disagreement hinges on
  product intent, present both positions verbatim and the user decides.
  Persist each verdict to disk as it forms.

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
