# Changelog

All notable changes to the supermodo skills package. Format follows
[Keep a Changelog](https://keepachangelog.com); versioning is semver.

**Alpha (0.x):** anything may change between minors — **MINOR** = new
capability OR breaking change (config schema, docs convention, protocol
contracts), **PATCH** = fixes and wording. `1.0.0` will mean the config
schema (`configVersion`), the docs convention, and the protocol contracts
are stable — from then on breaking those is a MAJOR with a migration path.

## [0.5.0] - 2026-08-01

### Added
- New `reports` skill — everything supermodo writes is published as
  self-contained web pages. Each flow run becomes one page (a sticky stage
  rail with the two mandatory gates marked, the full stage report beside it),
  opened right after stage 1 and re-rendered as stages land; a live run says
  so quietly with a dot that beats once per refresh, flashes whatever changed
  since you last looked, and keeps your open stage and scroll position across
  every refresh. Standalone reports get their own page, and an archive index
  collects everything under four tabs — Runs, Reports, Releases, and **Needs
  you** (whatever failed, is waiting on an answer, or has a gate that never
  went green). The front page is the **Board**: the worklist from your last
  `/supermodo:next`, suggestions first, every open item expandable to its
  description, dates and task list. Reports can embed bar charts, trees,
  dependency graphs and the board itself as declarative blocks drawn natively,
  with Mermaid as an escape hatch. Pages are light by default with a
  remembered dark toggle, work offline, and never affect a run when a render
  fails — the markdown stays the source of truth.
- New `next` skill renders the **worklist board**: every open work triad and
  live backlog entry grouped by priority, annotated with effort, execution
  state, dependencies and whether triage is still owed by you — followed by at
  most three suggestions (the priority lead, a context lead that must name its
  evidence and may never jump a priority gap, and the highest-ranked item
  waiting on a decision from you). `--triage` sets priorities through three
  closed questions asked once; `--repair` reports convention debt. Its rules
  live in a new `worklist.md` protocol master: the P0–P3 scale and its intake
  matrix, priority inheritance from active dependents, execution-state
  ranking, a deterministic total order, and effort bands printed with their
  evidence. The docs convention gains the metadata it reads — optional
  `Priority:` and `Created:` lines in `spec.md`, an indented `priority:` in
  backlog entries, and an `## Open questions` checklist with immutable
  question IDs.
- New `bug-council` skill — the last resort for ONE stubborn bug the
  ordinary attempt already lost to. A blind council of independent seats
  (Codex, Claude, Kimi, native subagents) investigates from distinct lenses
  without seeing each other's reports, competing hypotheses are falsified by
  experiment rather than by vote, one designated implementer writes the
  smallest causal patch, and a fresh verifier that wrote no code attacks it.
  Depth (quick / standard / deep) is chosen automatically.
  **Explicit invocation only:** it is deliberately slow and expensive, so no
  skill ever chains into it — `hunt` still routes findings to `tdd --debug`,
  `flow` never convenes it, and both merely suggest it (as does `tdd --debug`
  after a failed cycle) when a bug is intermittent, keeps returning, or has
  already survived a fix attempt. One bug per run.
- Worktree-per-task: `work` and `flow` accept `--worktree` / `--no-worktree`,
  and the new `workspace.worktree` config field sets the project default.
  When on, each task runs in one dedicated git worktree on its own branch
  off `dev` — shared by every subagent, never one per subprocess. The
  bootstrap wizard asks whether to enable it, and `release` suggests
  removing the worktree and deleting the branch once merged.

### Changed
- `flow`, `librarian` and `work` no longer restate their own next-job
  rituals — all three read the worklist master instead. `flow` with no
  `--job` now shows the board's suggestions, `flow --job next` and
  `librarian --backlog next` resolve through the same rules, and `work` picks
  up the priority lead rather than a bespoke ordering. Selection semantics
  moved out of `docs-convention.md`, which now defines only the grammar they
  read.
- Reports gain an optional `task:` field linking a standalone report to a work
  item, and `state.json` records whether a run is still in flight. A new
  `reports` config section controls the web pages: `html` (default `true`)
  turns rendering off entirely, and `open` chooses whether every skill opens
  its page, only flow runs do, or none do — a browser is never opened without
  a terminal, in CI, or over SSH without a display. `next` now persists every
  board it computes, so the worklist has a history and the newest board
  becomes the front page of the archive; the page draws what `next` resolved
  and never re-derives priorities itself.

### Fixed
- Skills now honor `questions.transport: "chat"`. Previously `hunt`,
  `refactor`, `sync-configs`, and `tdd` hardcoded the `AskUserQuestion` tool
  in their own instructions, overriding the configured transport and always
  asking via the tool. Every mention is now gated on
  `questions.transport` / `perSkill.<slug>`, and a new `check.ts` lint fails
  the build on any ungated `AskUserQuestion` in skill prose.

## [0.4.0] - 2026-07-22

### Added
- Multi-host agent rosters: `agents.dir` is now the single canonical
  roster and the new `agents.hosts` field (e.g. `["claude", "codex"]`)
  tells `sync-configs` which hosts' native agent dirs to mirror it to,
  one-way. Switch between Claude Code and Codex without touching the
  config; the bootstrap interview asks once which hosts you use.
- Program/initiative nesting in `docs/work/`: group related triads under a
  program folder (`work/<program>/` with a frontmattered `README.md`
  overview plus `NN-<slug>/` initiative triads, two levels max).
  Validation, router nav, deterministic next, dependencies, backlog
  graduation, and archiving all understand both flat and program shapes;
  existing flat layouts are unchanged.

## [0.3.0] - 2026-07-22

### Changed
- `commit` now always writes the changelog fragment and prints the exact
  command plan before its single consent question — every run delivers
  message, fragment, plan, and one ask.
- `release` writes the version bump and changelog entry into the working
  tree automatically; only the git sequence is consent-gated. Declining
  leaves a pre-bumped tree the next run releases as declared.
- `config` bootstrap interview hardened: strict one-question-per-message
  wizard, closed menu for every missing command tier, immediate agent-role
  proposals, no questions outside the schema. SKILL.md is ~35% slimmer with
  phase detail moved to an on-demand playbook (`references/procedures.md`).

### Added
- Trigger + behavior eval set for the `config` skill
  (`skills/config/evals/`).

## [0.2.0] - 2026-07-22

### Added
- One-command project start: `config` bootstraps an empty folder instantly
  with defaults (`--yes` works in any project), guides you to close missing
  quality gates (coverage, mutation, lint) with always-current setup
  guidance derived from your installed tools and live docs, and hands off
  to `commit` — which now works in fresh folders too (offers `git init`).
- Changelog fragments (changesets-style): `commit` writes a small
  user-facing fragment per commit in `changes/` (default ON — opt out with
  `--no-changelog` or `changelog.fragments: false`); `release` builds the
  changelog entry from fragments near-verbatim and deletes them in the
  release commit. New optional `changelog` config section (`fragments`, `dir`).
- Grill settled table: technical points both models agree on arrive as one
  reviewable table — you answer only real conflicts and business decisions,
  which always get individual confirmation.

### Changed
- `release` now runs the configured test/lint quality gates in preflight; a
  red gate blocks the release.

## [0.1.1] - 2026-07-21

### Changed
- Documentation restructured: new `docs/` folder with a full page per skill
  plus guides (installation & updating, getting started, the documentation
  model); README slimmed to the essential first-use happy path with links
  into `docs/`.

## [0.1.0] - 2026-07-21

### Added
- Initial release: 13 skills — `config`, `protocols`, `flow`, `grill`,
  `librarian`, `work`, `tests`, `hunt`, `tdd`, `refactor`, `commit`,
  `release`, `sync-configs` — installable as the Claude Code plugin
  `supermodo` or via `npx skills add supermodo/skills`.
- `config` and `protocols` as core dependencies of every skill; `protocols`
  doubles as package help and install doctor.
- The strict docs convention, `skills.config.json` contract, twin-model
  grilling, per-stage `flow` pipeline, and the shared protocol masters.
- `config` first-run bootstrap as a one-step-at-a-time wizard (`Step N of
  M` + context + default), with an agent-team step that can propose a
  project-grounded roster, and a full-answer recap before the dry-run.
- `release` skill: versioned releases with git-flow discipline —
  deterministic preflight, commit-driven bump suggestion, drafted
  changelog, gated squash/tag/publish; `light` and `full` modes.
- `confirmations` config section: consent-gate policy (`ask` default |
  `auto`, global or per skill).
