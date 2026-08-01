---
name: tdd
description: "Test-driven work in two modes. Default: real Test-Driven Development — red-green-refactor, one failing test at a time, used while implementing features (and by the work skill). With --debug: test-first debugging — generate all plausible root-cause hypotheses, write tests to validate each before touching production code, fix based on which tests fail, then sweep the codebase for the same pattern. Use for 'tdd', 'test-driven', 'write the test first', implementing with tests leading — and with --debug whenever the user reports a bug, unexpected behavior, or failed fix attempts and the root cause is unclear."
---

# tdd — Test-Driven Development & Test-First Debugging

> **Requires:** the sibling `protocols` skill (shared protocol masters); uses `skills.config.json` when present. Missing protocols → tell the user to install the full supermodo package.

Two modes, one discipline: tests lead, production code follows.

**Command preflight.** With `skills.config.json` present, validate it per
`../protocols/references/config.md` and run tests ONLY via the configured
tiers (`../protocols/references/tooling.md`): `commands.test` (fallback
`commands.testUnit`) inside the red-green loop — the fast tier, after
every change — `commands.testUnit` as the completion gate,
`commands.testAll` for full-suite checks, `commands.coverage` against
`coverage.target` for coverage gates. A needed tier that is missing → say
so and point at `config --edit commands`; and when a configured project
has NEITHER `test` nor `testUnit`, HALT before touching production code —
a test-first workflow with no way to run tests is impossible, not
degradable. Never invent a command. No config → infer the project's own
test runner from its manifests and state which command you chose.

| Invocation    | Mode |
|---------------|------|
| `tdd`         | **Development** — red-green-refactor while building a feature |
| `tdd --debug` | **Debugging** — hypothesis-testing for an existing bug (below) |

> Supersedes the older `tdd-debug` skill name (its methodology is the
> `--debug` mode here, unchanged).

---

## Development mode (default)

Classic TDD, strictly played. Used standalone or by `work` during
implementation.

1. **Red.** Pick the smallest next behavior from the task at hand. Write ONE
   test that specifies it. Run it and WATCH IT FAIL — for the right reason
   (the behavior is missing), not a typo/import error. A test you never saw
   fail proves nothing.
2. **Green.** Write the MINIMUM production code that makes that test pass.
   No speculative generality, no drive-by fixes. Run the test; run the
   affected suite.
3. **Refactor.** With green as a safety net, clean what you just touched —
   names, duplication, structure. Suite stays green throughout.
4. **Repeat** until the behavior list is exhausted. Never write production
   code without a failing test demanding it; never let a broken test linger.

Rules that bite:
- One failing test at a time — a wall of red is noise, not pressure.
- Test behavior through public surfaces, not implementation details; a
  refactor (step 3) must not break tests.
- Assertions must be strong enough to fail on subtly wrong code — assert
  values and effects, not just "doesn't throw".
- Edge cases (empty/null, boundaries, error paths) get their own red-green
  cycles, not afterthought asserts.
- Zero tolerance: leaving any test red at the end of a session is a failed
  session.

When a bug surfaces mid-development with an unclear cause, switch to
`--debug` mode below, fix it, then resume the cycle.

---

## Debugging mode (`--debug`)

## Why This Workflow

Most debugging goes: see bug, guess cause, patch, hope. That fixes symptoms, not causes — and the same class of bug reappears elsewhere next week.

This workflow treats tests as **diagnostic instruments**, not just verification. By writing tests for every plausible hypothesis before touching production code, you accomplish two things: you discover exactly what's wrong (the failing test confirms the hypothesis), and you leave behind regression coverage that prevents the bug from returning. The codebase sweep at the end catches the systemic version — because if the pattern was wrong here, it's probably wrong elsewhere too.

## The Cycle

```
1. HYPOTHESIZE ──► 2. TEST ──► 3. EXECUTE ──► 4. TRIAGE
      ▲                                          │
      │          ┌────────────────────────────────┤
      │          │                                │
      │   no failures,               tests failing
      │   bug persists                     │
      │          │                         ▼
      └──────────┘                    5. FIX ──► re-run (3)
                                           │
                                     all pass
                                           │
                                           ▼
                                      6. SWEEP
                                      │       │
                              similar issues  clean
                                   │            │
                                   ▼            ▼
                              restart (1)  7. AUDIT DOC ──► 8. QUESTIONS ──► 9. TEARDOWN ──► Done
```

**The loop-backs are the point.** When no test fails but the bug persists (Step 4), your hypotheses were incomplete — you go back and think harder with new information. When the sweep (Step 6) finds similar patterns, each gets the full treatment. These restarts aren't failure, they're the process working: each cycle eliminates possibilities and deepens understanding.

## Step 1: Hypothesize

Generate ALL plausible causes before touching anything. Breadth over depth — cast a wide net so the tests can narrow it down.

**First: Reproduce consistently.** Before hypothesizing, confirm you can trigger the bug reliably. What are the exact steps? Does it happen every time? If it's intermittent, under what conditions? If you can't reproduce it, gather more data — don't guess. A bug you can't trigger is a bug you can't verify you've fixed.

**Then generate hypotheses:**
- Read error messages, stack traces, and the bug report carefully — don't skim
- Examine the code paths involved in the bug
- Think across layers: input validation, data transformation, state management, side effects, timing, environment
- Consider edge cases: empty/null inputs, boundary values, concurrent access, encoding, timezone differences
- Check recent changes: `git log`, `git diff` — what changed that could cause this?

**Output a numbered list of hypotheses.** Each states:
1. What might be wrong
2. Where in the code it would manifest
3. Why it could produce the observed behavior

Don't filter for likelihood — the "unlikely" hypothesis is often correct. The tests will sort it out. Aim for completeness.

**After your hypothesis list: gather targeted evidence.** Now that you've thought broadly, add diagnostic instrumentation at component boundaries if the system has multiple layers (e.g., pipeline → database → API → UI). Log what enters and exits each component. This narrows down WHERE the bug manifests without narrowing your thinking prematurely. The key is: hypothesize broadly first, then gather evidence to focus.

**Restarting here from Step 4?** Previous hypotheses were wrong or incomplete. Look at what you've eliminated. Consider interactions between components (not just individual ones). Question assumptions you took for granted last time.

## Step 2: Test

Write tests that would fail if each hypothesis is correct. These are diagnostic instruments — each one either confirms or eliminates a hypothesis. But they're also more than that: these tests will outlive the debugging session and become **permanent regression coverage** that protects the codebase going forward.

**What to do:**
- For each hypothesis: write at least one test that would expose the bug if that hypothesis holds
- Add edge case tests around the bug's domain (boundary values, empty inputs, error paths)
- Use **unit tests** for isolated logic and **E2E tests** for integration/UI/full-path behavior
- Assert on the **correct** behavior — the test should fail against the current buggy code if the hypothesis is right

**Test quality — write for the future, not just today:**
- **Minimal**: Each test validates one hypothesis or edge case. If the name contains "and", split it.
- **Clear**: The name describes the **behavior** being tested, not the bug being fixed. A developer reading this test in 6 months should understand what it protects without knowing the debugging history.
- **Real code**: Use real code paths and realistic data. Avoid mocks unless external dependencies force it — mocks can mask the very bugs you're looking for.
- **Regression-grade**: These tests stay in the codebase permanently. Write them as if someone else will maintain them.

**Test naming** — describe behavior, never reference bug IDs:
```
GOOD:
"captures startTime at invocation, not construction"
"resets metrics between invocations"
"catches thrown exceptions from wrapped function"
"includes inactive assignments for historical attribution"

BAD:
"BUG-2: stale startTime closure"
"BUG-38: readAssignments only reads active assignments"
```

**Test file placement:**
- Tests go in `__tests__/<source-filename>.test.ts`, matching the source file name
- If a test file already exists for that source file, ADD your tests to it — group under the appropriate `describe` block for the function being tested
- NEVER create bug-numbered test files like `bugs-38-42.test.ts` or `resilience-bugs.test.ts` — these are debugging artifacts, not maintainable test infrastructure
- If no test file exists yet, create one following the naming convention

**Do not write the fix yet.** Tests must compile and be runnable against the current (buggy) code. The purpose here is to let the tests tell you what's wrong, not to anticipate the fix.

## Step 3: Execute

Run everything — both the new diagnostic tests AND the full existing test suite for the affected package or application.

**What to do:**
- Run the new tests first to see which hypotheses are confirmed (these fail)
- Run the complete package/app test suite to catch related breakage
- Record all failures with their messages — these are your evidence

**Verify WHY each test fails.** When a test fails, check that it fails for the right reason — the hypothesis being confirmed — not because of a typo, missing import, or setup error. A test that errors out on line 1 tells you nothing about the hypothesis. Fix the test error and re-run until it either fails correctly (hypothesis confirmed) or passes cleanly (hypothesis eliminated).

**Why run existing tests too:** The bug might already be partially covered by existing tests that are now failing. Or existing tests may reveal related issues you haven't hypothesized about. Both kinds of signal matter.

## Step 4: Triage

Three possible outcomes. Each has exactly one correct next step — no judgment calls here.

### No failures + bug is gone → Step 6 (Sweep)
Tests pass and the bug no longer reproduces. This can happen with environment-dependent issues or if it was fixed elsewhere. Still proceed to the Sweep — you want to check for similar patterns even if this instance resolved itself.

### No failures + bug persists → Restart at Step 1
Your hypotheses missed the real cause. Before restarting, reflect:
- Did you test the right layer? (Maybe integration, not unit)
- Did test data actually trigger the condition?
- Are there unquestioned assumptions? (Config, environment, timing, data shape)

Each restart eliminates wrong hypotheses. This is progress — you now know what the bug is NOT.

### Tests are failing → Step 5 (Fix)
Evidence found. The failing tests point to which hypotheses are correct. If multiple unrelated tests fail, start with the most fundamental failure — it may cascade to others.

## Step 5: Fix

Fix the root cause revealed by the failing tests.

- Address the root cause, not the symptom
- Make the minimal change needed to pass the failing tests
- Don't refactor or "improve" nearby code — stay focused on the fix
- **NEVER write `BUG-N` in code.** Not in comments, not in JSDoc, not in variable names, not "temporarily." Track which bug you're fixing in your own reasoning — the code itself must never reference it. If a comment is needed, explain the design decision: "Promise-based singleton — avoids race condition on concurrent init", NOT "BUG-8 fix: Promise-based singleton." This applies to EVERY line you write, from the very first edit. Do not write BUG references with the intention of cleaning them up later — they will be missed.
- **New utilities go into existing files** if the file is under ~300 lines and the utility logically belongs there. Only create a new file if it would be a separate concern or the existing file is already large. Never name a file after the bug it fixes.
- **Reuse existing components.** When fixing `.tsx` files, list the project's component library directory recursively to discover available UI components. Never re-implement inline what the library already provides. When creating new UI elements, build them as generic reusable components in the library — never inline in route/page files.
- After fixing: **return to Step 3** and re-run ALL tests

**After re-running:**
- All pass → proceed to **Harden** (below), then **Step 6** (Sweep)
- New failures appeared → your fix broke something. Analyze within this step, don't restart the whole cycle
- Original failures remain → fix didn't address the root cause. Rethink and try again within this step

**If 3+ fix attempts have failed:** Stop patching. Three failed fixes in a row usually means the design itself is wrong, not just the implementation. The repeated failures are revealing coupling, shared state, or architectural assumptions that no single fix can address. Step back and question whether the current approach is fundamentally sound before attempting fix #4. Discuss with the user.

### Harden for Regression

This is a **hard gate** — you cannot proceed to the sweep until every item passes. This is not optional cleanup.

**Step H1: Automated trace check (MANDATORY)**
Run this grep on every file you changed:
```bash
grep -rn 'BUG-\|BUG [0-9]\|bug-\|bug fix\|fix:' <list-of-changed-files>
```
The gate targets **debugging traces YOU introduced this session** — judge every match. A match inside legitimate pre-existing or user-facing content (docs prose saying "bug fix", a parser fixture that genuinely contains `fix:`, conventional-commit examples) is exempt: leave it and note why. Every non-exempt match must be replaced with a design-rationale comment or deleted. Repeat until only exempt matches remain.

**Step H2: Test cleanup**
- Test descriptions must describe behavior, not bugs: "captures startTime at invocation" not "BUG-2: stale startTime"
- Tests are in `__tests__/<source-name>.test.ts`, added to existing test files when present
- No bug-numbered test files exist — merge into canonical files, delete the originals
- Group tests by function under `describe` blocks

**Step H3: Code cleanup**
- Verify new utility functions are in the right file (existing file if <300 lines and logically related, new file only if separate concern)
- If you created a new exported function, check: should it be in the package's `mod.ts`? Export if it's a generic utility others will use. If not obvious, ask the user.

**Step H4: Fresh-eyes test**
Read through every changed file as if you're seeing it for the first time. The code should read as if a thoughtful developer wrote it from scratch — no trace of a debugging session, no "fix" comments, no numbered references. A new developer tomorrow should understand every comment without knowing what bugs existed.

## Step 6: Sweep

Bug is fixed, all tests pass. Now find the systemic version.

**What to do:**
- Identify the **pattern** that caused the bug (e.g., "unchecked null return from this API", "missing await on async call", "off-by-one in date range comparison")
- Search the **entire codebase** for other instances of the same pattern — not just the target file
- Grep for the function names, anti-patterns, or similar logic
- Check related modules that handle similar data or follow similar flows

### Deduplication During Sweep

If you created a new canonical function (e.g., `calculateBackoffDelay`) and the sweep finds duplicate implementations in other files, **fix all of them now** — same package and cross-package. **Consent gate first for public surface:** deleting or rewriting an EXPORTED function that other packages (or anything outside this repo) may consume is an API change — list the duplicates and every consumer found, and get the user's explicit yes before executing (in flow: a `needs-input` question). Private, same-package duplicates need no gate. Then:

1. Grep the entire codebase for the duplicate function name AND for the pattern it implements (e.g., `Math.pow.*Math.min.*Math.random` for backoff)
2. For each duplicate found:
   - Delete the duplicate function entirely
   - Update every consumer of that duplicate to import directly from the canonical package — never create re-export wrappers or barrel indirection
   - Example: if `@pkg/data/download/utils.ts` had `withRetry` and you consolidated into `@pkg/utils`, the consumer in `trades.ts` imports `withRetry` from `@pkg/utils` directly — NOT from `@pkg/data`
3. Merge the old function's tests into the canonical test file (keep unique edge cases, eliminate duplicates)
4. Run the full test suite across ALL affected packages
5. Verify zero copies remain: `grep -rn '<function-name>' --include='*.ts'` should show only the canonical source and its test

**Found similar issues (not duplicates)?** Each gets the full treatment — restart from **Step 1** for that instance. Don't blindly apply the same fix, because the context may differ enough that a copy-paste fix would be wrong. Let the tests confirm.

**Codebase is clean?** Proceed to Step 7.

## Step 7: Update the Source Audit Document

**This step applies when the bugs came from a findings/audit document** — a hunt report, audit file, findings list, or review doc (e.g., a `.skills/supermodo/hunt/` report, an audit the user pointed you at). If the bug came from a direct user report with no source document, skip to Step 8.

The audit doc is the record of what was found; after this session it must also record what was done. Update it now, while every change is fresh — not "later." **Ownership rule:** audit reports under `.skills/supermodo/` are run artifacts — update them directly. An audit living under `docs/` is documentation and tdd never edits it in any mode: write the complete per-finding outcomes (status, changes, tests, deviations) into your own report under `.skills/supermodo/`, then hand the doc update to librarian — standalone, invoke librarian (or leave the outcomes flagged for its next pass); in flow, put them in the stage report (`drift_notes`/`decisions`) for the stage-7 librarian.

For EVERY finding you touched this session, update its entry in the doc with:

1. **Status** — one of: `FIXED`, `WON'T FIX` (with reason), `FALSE POSITIVE` (with evidence), `DEFERRED` (with why)
2. **What changed** — the files modified and a one-line description of the fix
3. **Tests added** — the test file(s) and what behavior they now protect
4. **Deviations** — if the actual root cause differed from what the finding described, correct the record

Also update any summary/counts section in the doc (e.g., "12 findings, 3 open") so totals match reality.

**Note:** bug IDs and finding numbers are BANNED in code (Step 5), but the audit doc is the opposite — it IS the audit trail. Reference finding IDs freely there.

## Step 8: Resolve Open Questions (before final verification)

Before running the final Verification Checklist, review the whole session for open questions — ambiguous design choices, uncertain exports, behaviors you guessed at, deferred decisions ("if not obvious, ask the user"), or sweep findings you weren't sure how to treat.

- **If any open questions remain:** present them ALL in one batch, on the transport set by `questions.transport`/`perSkill.tdd` (`AskUserQuestion` only when `"tool"`; default is plain chat — see `../protocols/references/questions.md`). Then apply the user's answers — fix the remaining issues — and re-run the affected tests.
- **If none remain:** proceed directly to the Verification Checklist.

Only after every open question is answered and every resulting fix is applied do you run the final verification round (the checklist below).

## Step 9: Teardown

After verification passes and the bug is declared fixed, leave a clean terminal:

- Kill every background shell you started (watchers, dev servers, `run_in_background` commands) — check with the task/shell listing tools and stop each one
- Stop any subagents or teammates still running (TaskStop / SendMessage shutdown as appropriate)
- Remove temporary scratch files created during debugging (diagnostic scripts, log dumps) — regression tests stay, debris goes

Nothing you spawned should still be running when you report done.

## Flow integration

When invoked by the `flow` orchestrator, tdd runs in `--debug` mode as **stage 4** (fix the bugs
hunt found, test-first) running as a subagent with its own context. It runs
only when stage 3 (`hunt`) confirmed bugs.

- **Read the prior stage report** for the bug list: load
  `.skills/supermodo/runs/<run-id>/03-hunt.md` (and the confirmed-findings
  JSONL shards it points at). Those confirmed findings ARE the hypotheses to
  drive Steps 1–5 — the audit already did the finding, tdd does the fixing.
- **Write the stage report** per `../protocols/references/reports.md` to
  `.skills/supermodo/runs/<run-id>/04-tdd.md` — YAML frontmatter with
  `skill: tdd`, `status` (`ok` | `failed` | `needs-input` | `skipped`),
  `summary` (which findings fixed / deferred + test count), `drift_notes`,
  `decisions`, and `questions` (only when `status: needs-input`).
- **Never mutate documentation.** Step 7 ("Update the Source Audit Document")
  is a doc write — in flow, DON'T do it inline; emit the per-finding status
  (FIXED / WON'T FIX / FALSE POSITIVE / DEFERRED) as `decisions` in the stage
  report instead, and the stage-7 librarian pass records them. The zero-trace
  code gate (no `BUG-N` in code) and the codebase sweep still apply in full.
- **Questions mid-flow** go in the report's `questions` frontmatter with
  `status: needs-input` rather than via AskUserQuestion (Step 8); the
  orchestrator routes them and continues this subagent with the answers.

## Complementary Skills

**Escalation to `bug-council`.** `tdd --debug` is the normal tool for a known
bug and handles nearly all of them. When a `--debug` cycle has genuinely
failed — every hypothesis tested and refuted, or a fix shipped and the
symptom returned — SUGGEST the `bug-council` skill in one line and wait for
the user's yes. Never invoke it automatically: it is deliberately slow and
token-expensive, reserved for one stubborn bug that ordinary attempts have
already lost to.

This workflow references techniques from related skills where they apply:
- **systematic-debugging** — Use its root-cause investigation and evidence-gathering techniques during Step 1 for forming stronger hypotheses
- **test-driven-development** — Apply its Red-Green discipline during Steps 2 and 5 for writing proper failing tests and minimal fixes
- **verification-before-completion** — Verify the fix actually resolves the original bug report before declaring done

## Persist and publish

Standalone runs write this report to
`.skills/supermodo/tdd/<YYYYMMDD-HHMMSS>.md` per
`../protocols/references/reports.md` — a result living only in chat dies with
the session. Then publish it:

```
node <skills>/reports/scripts/render.ts --report <that path>
```

and NAME the page in your final message. Inside a `flow` run this does not
apply: the stage report is the artifact and the orchestrator renders the one
run page.

## Verification Checklist

Before declaring the bug fixed, verify all of these. Items marked **(RUN)** require executing a command — do not check them by reading code.

**Tests:**
- [ ] Every hypothesis has at least one test
- [ ] Watched each failing test fail for the expected reason (not typos or setup errors)
- [ ] All tests pass (new + existing) **(RUN)**
- [ ] Test output is clean (no warnings, no errors, no skips)
- [ ] Tests use real code paths (mocks only where unavoidable)
- [ ] Edge cases and error paths are covered
- [ ] Tests are in `__tests__/<source-name>.test.ts`, added to existing files when present — no bug-numbered files
- [ ] Test names describe behavior, not bug IDs

**Code quality:**
- [ ] Wrote minimal code to pass the failing tests — no extras
- [ ] New utilities placed in existing files (if <300 lines) or correctly named new files — no orphans
- [ ] New exports added to mod.ts if they're generic utilities needed by other packages

**Zero trace (HARD GATE):**
- [ ] `grep -rn 'BUG-\|BUG [0-9]' <changed-files>` returns zero results **(RUN)**
- [ ] `grep -rn 'bug fix\|fix:' <changed-files>` returns zero results **(RUN)**
- [ ] Comments explain design decisions, not debugging history

**Sweep:**
- [ ] Codebase sweep completed (Step 6)
- [ ] All duplicates deleted — `grep -rn '<function-name>' --include='*.ts'` shows only canonical source and its test **(RUN)**
- [ ] Consumers import directly from canonical package, no re-export wrappers

**Audit doc (Step 7, when bugs came from a findings/audit document):**
- [ ] Every finding touched this session has status, changed files, and tests recorded — directly in the audit doc when it lives under `.skills/supermodo/`; via your report + librarian handoff when it lives under `docs/` (Step 7's ownership rule)
- [ ] Summary/counts match reality (same channel as above)
- [ ] Findings whose root cause differed from the doc's description are corrected (same channel)

**Open questions (Step 8):**
- [ ] All open questions asked on the configured transport (per `questions.transport`) and answered — none silently deferred
- [ ] Fixes from the answers applied and their tests re-run **(RUN)**

**Teardown (Step 9, after checklist passes):**
- [ ] No background shells, subagents, or teammates still running **(RUN)**
- [ ] Debugging scratch files removed (regression tests kept)

Can't check all boxes? Something was skipped. Go back and fix it.

## Red Flags — Stop and Follow the Process

If you catch yourself thinking any of these, you're about to skip the workflow:

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "I see the problem, let me fix it" (seeing a symptom ≠ understanding root cause)
- "Too simple to need all these steps"
- "I'll write tests after confirming the fix works"
- "I don't fully understand but this might work"
- "One more fix attempt" (when you've already tried 2+)
- "Let me add multiple changes and run tests" (one variable at a time)

All of these mean: **stop, return to Step 1.** The process exists because these instincts lead to incomplete fixes.

## What to Avoid

| Temptation | Why it breaks the workflow |
|---|---|
| Skip Step 1, jump to fixing | You'll fix a symptom, not the cause. The bug returns. |
| Write one test for "the obvious cause" | If you're wrong, the entire cycle gives you nothing. Broad coverage finds the real cause faster. |
| Fix before running tests (Step 3) | You can't know which hypothesis was correct, and you can't validate the fix against a known-failing baseline. |
| Skip the sweep (Step 6) | The same pattern exists elsewhere. You'll be debugging it again next week. |
| Blanket-fix during sweep without testing | Each instance may differ. What fixed it here might be wrong there. |
| Give up after one restart | Each cycle eliminates hypotheses. Persistence here is the correct approach — the process converges. |
| Leave throwaway tests | Every test should be regression-grade. If a test won't make sense next month, rename or comment it now. |
