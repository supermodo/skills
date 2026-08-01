---
name: tests
description: >
  Fixes failing tests and lint/type errors, audits test-suite quality with a
  fleet of specialist reviewers, or drives coverage — for any project configured
  with a supermodo skills.config.json. Modes: `tests` (default) fixes every
  failure tier by tier (unit, integration, E2E, lint); `tests audit [scope]`
  spawns parallel specialist reviewers (spec-alignment, assertion-strength,
  corner-cases, coverage-balance, and a domain lens derived from the project's
  docs), runs mutation probes where configured, and adversarially verifies every
  finding with a second model before reporting; `tests coverage` drives coverage
  to the configured target with a balance check. Use whenever the user mentions
  failing tests, lint errors, "make tests pass", green build, flaky tests, test
  quality, weak or missing tests, corner cases, coverage, mutation testing, or
  asks whether the tests actually protect the core logic — even without "/tests".
allowed-tools: >
  Read, Edit, Write, Grep, Glob, Bash, Agent, AskUserQuestion, TaskCreate,
  TaskList, TaskUpdate, TaskGet, SendMessage
---

# tests — fix, audit, coverage

> **Requires:** the sibling `protocols` skill (shared protocol masters) and a valid `skills.config.json` (create with the `config` skill). Missing either → halt with that exact pointer; never guess.

Test coordinator for a supermodo-configured project. All framework, command, and
domain specifics come from `skills.config.json` and the project's docs — nothing
about a stack is hardcoded here.

> **Cross-tool note (Claude Code ↔ Codex).** Written in Claude Code idioms. Under
> Codex, translate: `AskUserQuestion` → ask in chat; `Agent`/`subagent_type` →
> your native delegation; `TaskCreate`/`TaskList`/`TaskUpdate` → your own task
> tracking. Audit verification uses the OTHER provider as the adversary — under
> Claude the adversary is `codex exec`, under Codex it is `claude -p` (see
> `../protocols/references/cross-model.md`). Invert accordingly so the second model is
> genuinely different.

## 0. Preflight — config first

Read and validate `skills.config.json` per `../protocols/references/config.md` BEFORE acting
(run the `config` skill's `../config/scripts/config-check.ts` or apply its rules). Missing/invalid config
→ halt naming the field, point at `config`. Wrong `configVersion` → halt per the
version rule.

**Commands come only from `commands.*`** (argv arrays, executed without a shell;
first use of each in a session shown to the user and explicitly approved per
`../protocols/references/config.md`). Resolve the tiers you need:

| Tier          | Config key          | Used by            |
| ------------- | ------------------- | ------------------ |
| fast tests    | `commands.test`     | discovery, fix     |
| unit suite    | `commands.testUnit` | full gate, coverage|
| full suite    | `commands.testAll`  | integration/E2E    |
| format/lint/types | `commands.lint` | all modes          |
| coverage      | `commands.coverage` | audit, coverage    |
| mutation      | `commands.mutation` | audit probes only  |

**No configured command for a tier → that tier is reported UNAVAILABLE, never
silently skipped.** E.g. no `commands.coverage` → coverage mode and the coverage
gate halt telling the user to configure it; no `commands.mutation` → mutation
probes are omitted and the audit says so. Coverage target = `coverage.target`
(default 80).

## Mode selection

| Invocation            | Mode                                                                 |
| --------------------- | -------------------------------------------------------------------- |
| `tests`               | **Fix** — get everything passing. Already green → report, offer audit|
| `tests audit [scope]` | **Audit** — specialist fleet + probes + two-model verified findings  |
| `tests coverage`      | **Coverage** — drive to `coverage.target` with a balance check       |

`scope` for audit: package/module names, `all`, or empty (empty = changed since
last audit — see Audit step 0).

## Shared mechanics (all modes)

**Discover test tasks at runtime — never trust a frozen list.** Projects add and
drop packages; a hardcoded table rots. Use the configured commands, and where a
per-package task convention exists in the project, discover it from the project's
own manifest/docs rather than assuming names.

**Capture full output.** Never `| head` or `| tail` a test run — failures past
the cut vanish and you fix a partial picture. Pipe to files, then grep:

```bash
D=$(mktemp -d)
<commands.lint> > "$D/lint.log" 2>&1; LINT=$?
<commands.test> > "$D/test.log" 2>&1; TEST=$?
if [ "$LINT" -eq 0 ] && [ "$TEST" -eq 0 ]; then echo "all green"; else
  echo "RED: lint=$LINT test=$TEST"; grep -nE '(FAIL|error|ERROR)' "$D"/*.log
fi
```

**Exit codes are the verdict, never grep.** A run is green only when every
command exited 0; grep only locates the failures for reading. `<commands.X>`
stands for the configured argv executed verbatim — each array element is one
argument; never re-join elements into a shell string (the config contract's
no-shell rule).

Use a generous Bash timeout (up to 600000 ms) for large suites.

**Zero tolerance.** A failing test is never skipped, commented out, or loosened
to pass. Either the code is wrong (fix it) or the test is wrong (fix it and say
why).

---

## Fix mode

1. **Discovery.** Run the parallel lint + test block. Build a failure inventory:
   category (`type` | `test` | `lint` | `format`), package, file, error. Group
   related failures into tasks (TaskCreate) ordered by dependency.
2. **Triage for cascades.** One type error or broken import can fail dozens of
   downstream tests. Fix root causes in dependency order: type/compile errors →
   unit tests (leaf packages before consumers before apps) → integration → E2E →
   lint/format last (a configured formatter auto-fixes most).
3. **Targeted verification.** After fixing a package, re-run only that package's
   scope. Full suite only at the end.
4. **Ask only real decisions** (per `../protocols/references/questions.md` triage; transport
   from `questions.transport`/`perSkill.tests`, "tool" honored on Claude Code):
   - **Test vs code ambiguity** — only after reading the governing contract via
     the docs router; it usually answers which is wrong.
   - **Cross-package behavioral change** — a fix alters a signature/semantics
     other packages depend on.

   Everything else (flaky root-causing, fixture updates, obviously wrong
   assertions): act, then report what you did and why.
5. **Full gate.** `commands.testUnit` + `commands.lint` in parallel; if
   integration/E2E were among the failures, also `commands.testAll`. New
   failures → back to step 2.

Zero failures on discovery: say so plainly and offer the audit — the fleet earns
its cost only when the user wants it.

---

## Audit mode

The question: **would these tests fail if the code were wrong?** Reviewers give
informed opinions; mutation probes give ground truth; the verification pass keeps
false positives away from the user.

### 0. Scope
- Args name packages → audit those.
- `all` → every package with tests.
- Empty → incremental: resolve the newest prior audit via the docs router, take
  its date, `git log --since=<date> --name-only --pretty=format:` → map changed
  files to owning packages. No prior audit → ask the user to pick packages or
  `all`.

### 1. Coverage map
Run `commands.coverage` (halt if unconfigured). Extract per-package and per-file
percentages for the scope — feeds the coverage-balance dimension and picks
mutation targets.

### 2. Specialist fleet — one message, all reviewers in parallel

Monitor the fleet per the liveness protocol
(`../protocols/references/handoff.md`, "Liveness"): periodic progress
checks; a stalled reviewer is stopped and retried once, a second stall
drops that dimension with the gap named in the audit report.
Dimensions (briefs in `references/review-dimensions.md`): **spec-alignment**
(`SA-`), **assertion-strength** (`AS-`), **corner-cases** (`CC-`),
**coverage-balance** (`CB-`), plus a **domain lens** (`DL-`) derived from the
project's routed contracts — the docs define what is domain-critical, not this
skill.

**Roster:** if `agents.dir` names a project roster, use its reviewers (a
project-supplied domain reviewer supersedes the derived `DL-` lens). **No roster
→ single-agent fallback:** apply each dimension brief sequentially in one agent
(or the main context), one dimension at a time. Every prompt includes: the scope
(test + source files), the coverage map, the findings schema
(`references/verification.md`), and "return ONLY the JSON array".

### 3. Merge and dedupe
Combine all findings; dedupe by (package, file, theme) keeping the
highest-severity duplicate. Plain reasoning, no agent needed.

### 4. Adversarial verification — two models, every finding
Preflight the adversary provider BEFORE spawning the fleet
(`../protocols/references/cross-model.md`): if the CLI is missing/outdated/unauthenticated —
at preflight or mid-run — STOP and ask the user (fix and retry / continue
single-model / abort). **Never downgrade to single-model silently**; single-model
results are labeled as such.

Then verify per `references/verification.md`: host-model skeptics (one per
finding, every severity) + opposite-provider cross-check over all merged
findings, merged via the matrix. `CONFIRMED` kept, `REFUTED` dropped to a refuted
appendix, `OVERSTATED` downgraded, `DISPUTED` kept with both arguments verbatim.
Persist verdicts to disk as they arrive.

### 5. Mutation probes — ground truth (only if `commands.mutation`)
When mutation is unconfigured, skip and state "mutation probes unavailable (no
commands.mutation)". Otherwise pick the top 3–5 functions where a finding alleges
weakness AND the docs mark the code domain-critical, and follow the probe
protocol in `references/verification.md` exactly — **strictly serial, clean
git status between probes, crash-recoverable restore** (pending-restore
breadcrumb + git-backed recovery per the protocol — a crash mid-probe is
detected and undone on the next start, never left corrupting the tree). A
survived mutant upgrades
the related finding to CONFIRMED with proof; a caught mutant is evidence of
strength — report that too.

### 6. Report
Write verified findings to the standalone audit location
(`.skills/supermodo/tests/<YYYYMMDD-HHMMSS>.md`, containment-checked per
`../protocols/references/reports.md`), ranked by severity, with mutation results (caught +
survived), coverage snapshot, and explicitly-clean dimensions. Present the
summary, then ask which buckets to implement (missing tests / weak-test fixes /
nothing yet).

### 7. Implement (if asked)
Missing tests first (most protection), then strengthen weak assertions. Targeted
per-package verification as in Fix mode, full `commands.testUnit` +
`commands.lint` gate at the end.

---

## Coverage mode

1. Generate the coverage map (Audit step 1).
2. For each package below `coverage.target`: list untested exported functions
   (public surface first), untested error paths, untested boundaries.
3. **Balance check before writing anything:** if coverage clusters in trivial
   code while domain-critical logic sits untested, critical-path gaps outrank the
   percentage — cover those first, even in packages already above target.
4. Write tests, re-run coverage, present a before/after table per package. Ask
   before grinding a package from just-under to just-over target with low-value
   tests — the number is a proxy, not the goal.

---

## Flow integration (stage 5)

When invoked as flow stage 5, this is a **mandatory gate over the tiers the
project has configured** — the gate never demands commands the project doesn't
have, and never silently pretends it ran ones it couldn't:

- **Hard minimum: a test command** — `commands.testUnit`, or `commands.test`
  when no unit tier exists. Neither configured → the gate FAILS (flow cannot
  verify anything; point at `config`).
- `commands.lint` gates only when configured; coverage vs `coverage.target`
  gates only when `commands.coverage` is configured. **Coverage measurement**
  = the tool's overall summary percentage (line/total); if the tool prints
  several numbers, state in the report which one governed.
- An unconfigured tier is NOT a failure — it is named in the stage report as
  explicit residual risk ("no lint tier configured", "coverage unmeasured"),
  so the run's evidence stays honest.
- GREEN = every CONFIGURED tier passes (and coverage meets target when
  measured). A configured tier that fails OR cannot run = red — never a
  silent pass.

Emit a stage report per `../protocols/references/reports.md`
(`05-tests.md`): `status: ok` only on green; `failed` on red; `needs-input` for a
genuine test-vs-code decision. Record doc drift in `drift_notes`, mid-stage
choices in `decisions` (librarian persists them at stage 7); never mutate docs
directly.

## Constraints (all modes)

- Follow the project's own code conventions (from `CONVENTIONS.md` via the
  router) — this skill imposes none of its own.
- Never commit, merge, rebase, or push — the user handles git (per package
  policy).
