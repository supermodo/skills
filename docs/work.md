# work — the lead implementer

Picks up the next task, builds the right team, drives it to completion, and
gets it independently verified by the other provider. Project constraints
come from your docs, not from the skill.

## When to use

- Resume roadmap work, start or continue a task, "implement the next item".
- As `flow` stage 2 (where the interview is skipped — the grilled triad from
  stage 1 is executed as locked).

## How a run goes

1. **Detect current state.** Read the docs router, resolve the active work
   and the next incomplete task by its immutable task ID — never by position
   or title. Name a task to override.
2. **Load the context chain.** The active-work doc, the task triad
   (`spec.md` / `plan.md` / `tasks.md`), every linked reference contract and
   ADR, and the agent roster if configured. A plan is never treated as
   evidence that behavior exists.
3. **Interview.** Questions are triaged: discoverable facts answered from
   code/docs, technical tradeoffs pre-fought with the adversary model,
   product/scope choices brought to you.
4. **Activate teammates.** With an agent roster configured (`agents.dir` in
   the config), work proposes a team (roles + assigned files) and waits for
   your confirmation. Without one, it works single-agent but applies each
   relevant role's checklist inline.
5. **Execute** under your project's conventions, running the configured test
   commands at each tier (fast suite after every change, unit + lint at
   completion). Zero tolerance for failures at every tier. Prefers
   [tdd](tdd.md) to drive each behavior.
6. **Adversarial verification.** The implementing provider never verifies
   its own work: the opposite provider (Claude impl → Codex; Codex impl →
   Claude) reviews the diff read-only against the spec and must return a
   structured APPROVED/REVISE verdict with evidence. On REVISE, work fixes
   and resumes the same reviewer session — up to five rounds, then you
   decide. If the opposite CLI is unavailable, it stops and asks — never a
   silently single-model result.
7. **Documentation.** Standalone: offers the librarian closeout. In flow:
   emits drift notes only — doc mutation stays with librarian.

It never commits — the working tree is handed to you clean.

## Worktree per task (`--worktree`)

`work [task-focus] [--worktree | --no-worktree]`. By default work runs in
your main checkout. Pass `--worktree` (or set `workspace.worktree: true` in
the config) and work creates **one dedicated git worktree per task** — not
per subprocess — before it spawns any teammate: it asks you for the path and
branch (suggesting `worktrees/<task-slug>` off the project root on a new
branch `<task-slug>`), runs `git worktree add` off your `dev` branch, and
every teammate shares that one worktree. Your main checkout stays untouched
while the task is built in isolation. `--no-worktree` forces the main tree
for a single run regardless of config. Cleanup (removing the worktree and
deleting the branch once merged) is suggested by [release](release.md), never
done automatically.

Requires: `protocols`, a valid `skills.config.json` ([config.md](config.md)).
