---
name: refactor
description: Deep functional refactoring of TypeScript code for purity, testability, and modularity. Use when the user says /refactor, asks to clean up or restructure code, mentions large files, god functions, mixed concerns, poor testability, or when code grew unwieldy after feature iterations. Also triggers on "this file is too big", "split this", "make this more functional", "extract", "decompose", or any mention of code smells like let, try/catch in business logic, for loops, or files over 300 lines. If the user describes messy, tangled, or overgrown code that needs structural improvement, this is the right skill — even without the word "refactor."
---

# Refactor

> **Requires:** the sibling `protocols` skill (shared protocol masters); uses `skills.config.json` when present. Missing protocols → tell the user to install the full supermodo package.

A systematic, phase-gated refactoring process that transforms accumulated code into small, pure, well-tested functional modules. The skill analyzes before touching code, plans before executing, tests before changing, and verifies after each step.

## Invocation

```
/refactor <path>          # file, directory, module, or "project"
/refactor src/queries/    # all files in a directory
/refactor .               # current working directory
```

When scope is large, analyze the full scope, build a dependency-ordered plan, and chunk work into verifiable steps.

## Core Principles

These shape every decision. Understand the reasoning — they enable judgment calls in edge cases.

### Never Assume
When uncertain about intent, impact, or correctness — ask the user. Never silently delete exports (they may exist for future use), never silently tighten external API types, never assume a function is "dead" just because you can't find callers in this repo. Ask on the transport set by `questions.transport`/`perSkill.refactor` (`AskUserQuestion` only when `"tool"`; default is plain chat — see `../protocols/references/questions.md`) for any decision that could be wrong.

### Pure Core, Impure Shell
Separate I/O from logic. Transform functions are pure (output depends only on input). I/O lives at the edges — in thin orchestrators wiring pure functions together. This makes code testable without mocks and composable with pipe/chain.

### Small Units
Functions ≤25 lines. Files ≥300 lines signal mixed concerns (exception: files large because the domain is large — many enum values, schema fields — where each internal unit is small and focused). Analyze before splitting.

### DRY with Codebase Awareness
Before creating a utility function, search the codebase for existing functions with similar purpose. If one exists in a package, propose reusing or merging it — show both side by side, ask the user. Generic utilities belong in the appropriate package with comprehensive unit tests, not in the consuming app.

### Behavior Preservation
Refactoring never changes what the code does — only how it's structured. Capture every behavioral contract in tests before structural changes begin.

### Runtime Performance First
Refactored code must be as efficient or more efficient. When choosing between patterns, always prefer the faster option:
- `for-of` is faster than `.map()/.flatMap()` for large datasets? Use `for-of`.
- Object mutation is faster than spread in a hot path? Note it in the plan with reasoning.
- Single-pass is better than multiple chained operations? Combine them.

Functional style is the goal, but never at the cost of runtime performance. When a functional pattern introduces measurable overhead (intermediate arrays, repeated allocations), document the tradeoff in the plan and choose the performant option.

---

## Phase 1: Analysis

Read the target and build a complete picture before proposing changes.

### What to Read
1. The target file(s)
2. Every file importing from the target (dependents) — grep for import paths
3. Every file the target imports from (dependencies)
4. Existing test files for the target
5. The package's `mod.ts` to understand the public API surface

### Smell Detection

Scan for these patterns and quantify each:

| Smell | What to Count |
|-------|---------------|
| Large files | Lines per file (signal at ≥300) |
| Large functions | Lines per function (threshold: >25) |
| `let` declarations | Every `let` that could be `const` or eliminated via map/reduce |
| `try/catch` in logic | try/catch outside I/O boundary wrappers |
| Imperative loops | `for`/`while` that should be map/filter/reduce/forEach — but keep `for-of` when it's faster |
| Mixed concerns | Functions combining I/O and transformation |
| Impure functions | Side effects that could be eliminated |
| Loose types | `any`, `unknown`, generic `string` for domain concepts |
| Circular deps | Mutual imports between files |
| `_`-prefixed variables | Unused variables disguised with underscore — delete them entirely |
| Silent error swallowing | `catch` blocks that return empty arrays/null, hiding real failures |
| Inconsistent error handling | Mix of Result returns, thrown exceptions, and silent swallowing in the same module |
| Inconsistent logging | Mix of logger patterns, missing context, or logging baked into core logic instead of hooks/callbacks |
| Repeated construction | Same object shape built N+ times with only a few fields varying (candidate for factory/declarative spec) |

### Usage Tracing

For every exported function in the target, grep the entire codebase for actual callers. This reveals:
- **Dead exports**: functions with zero callers outside their own file. Do NOT silently delete — flag them and ask the user. They may exist for future use, external consumers, or CLI entry points not visible in the codebase.
- **Test-only usage**: functions imported only by test files — potential candidates for internalization.
- **Single-caller functions**: exported but called from exactly one place — may not need to be public.

Present the usage map in the analysis.

### Bug & Anomaly Hunting

Beyond structural smells, actively look for semantic issues:
- **Stale closures**: variables captured at construction time that should be captured at invocation time (e.g., `Date.now()` in a factory vs returned closure)
- **Stale accumulators**: mutable state (counters, metrics, buffers) initialized at construction but never reset between invocations — data bleeds across calls
- **Uncaught exceptions in wrappers**: functions that promise to return `Result<T, E>` but don't catch throws from the wrapped operation — exceptions bypass the Result contract
- **Silent data loss**: catch blocks that return `[]` or `null`, masking schema changes, connection failures, or corrupt data
- **Scope confusion**: module-level `let` with lazy initialization that could be stale or cause race conditions
- **N+1 query patterns**: same database query called redundantly in a loop, or called independently by multiple sibling functions when a single call could be shared
- **Performance hotspots**: O(n) lookups (`.find()`, `.filter()`) inside loops or called frequently over large datasets — should use Map/Set for O(1) access
- **Off-by-one**: window calculations, retry counters, array slicing
- **Duplicated state machines**: same state transition logic implemented in multiple places, prone to divergence

If you find a potential bug, flag it clearly in the analysis with evidence. Do not fix it silently — ask the user whether to address it during refactoring.

### Error Handling & Logging Audit

Catalog every error handling and logging pattern in the target:
- Which functions return `Result<T, E>` vs throw vs silently swallow?
- Which use the project's logger vs console vs nothing?
- Are error types consistent (discriminated unions) or ad-hoc (generic `Error`)?
- Is logging baked into core logic, or separated via hooks/callbacks?

The plan should propose a coherent, consistent pattern for the entire module.

### Dependency Order (multi-file scope)

Build the import graph. Work bottom-up: leaf files (no internal dependents) first, root orchestrators last. When refactoring a file, its dependencies are already clean.

### Skip Recommendation

If a file is large but well-structured — each function small, pure, and focused — recommend skipping. Explain why. The user can override.

---

## Phase 2: Plan & Approval

**Write the plan down before asking about it.** A refactor plan is the single
most consequential thing this skill shows the user: it proposes moving code
they did not ask you to touch, and approving it as a wall of chat bullets is
approving it blind. Per `../protocols/references/reports.md` ("Show what you
are asking about"), the plan is written to the run's report with
`status: needs-input` and the approval question in `questions`, BEFORE the
question is put. Phase 5 completes that same file; it is one report per run,
not two.

**Where it is written, and who asks, depends on how this skill was invoked:**

| | standalone | inside `flow` (stage 6) |
| --- | --- | --- |
| write the plan to | `.skills/supermodo/refactor/<YYYYMMDD-HHMMSS>.md` | `.skills/supermodo/runs/<run-id>/06-refactor.md` |
| render it | yes — `node <skills>/reports/scripts/render.ts --report <that path>`, and NAME the page in the question | **no** — the orchestrator renders the one run page |
| ask the user | directly, under the named page | **no** — return `status: needs-input` with the question and stop; the orchestrator routes it and continues this subagent with the answer |

A flow stage runs as a subagent and **cannot talk to the user at all**, so
asking directly there is not a stylistic slip: the question reaches nobody,
the orchestrator never receives its stage report, and a mandatory pipeline
stalls at stage 6 with the tests gate already spent. See "Flow integration"
below — this is the same `needs-input` routing every other stage uses, applied
to the approval gate.

Then wait for explicit approval before touching code.

### Plan Format

The three blocks below open the plan, in this order. They are not
illustrations of the prose — they ARE the plan, and the prose underneath
carries what a diagram cannot (why, risk, alternatives).

````markdown
## Refactoring Plan: <target>

### Assessment
```supermodo:bars
{"title":"Scope","unit":"files","series":[
  {"label":"to refactor","value":N,"state":"warn"},
  {"label":"to skip","value":N},
  {"label":"new files proposed","value":N,"state":"ok"},
  {"label":"dead exports to delete","value":N,"state":"bad"}]}
```

- Files to skip: N (with reasons — a file deliberately left alone is a
  decision, not an omission)
- Dead exports found: N (list with caller counts — pending user decision)
- Potential bugs found: N (list with evidence)

### What moves where
```supermodo:tree
{"title":"Proposed structure","root":{"label":"packages/data/src","children":[
  {"label":"types.ts","state":"ok","meta":"new — 6 types from orchestrator.ts:12-88",
   "children":[{"label":"OrderId, Watermark, …","meta":"branded"}]},
  {"label":"validators.ts","state":"ok","meta":"new — from orchestrator.ts:90-210, try/catch removed"},
  {"label":"orchestrator.ts","state":"warn","meta":"810 ln → ~120 ln, I/O wiring only"},
  {"label":"legacy-shim.ts","state":"bad","meta":"deleted — 0 callers"}]}}
```

Every file the refactor touches appears exactly once, with `state` saying
which of the four things happens to it — `ok` created, `warn` changed, `bad`
deleted, no state left alone — and `meta` carrying the evidence: the source
range it comes from, the before → after size, the caller count that justifies
a deletion. A reader checks this in seconds; they do not check nineteen
paragraphs. Nothing appears here that the analysis did not establish: a line
range you did not read is not written down.

### Execution Order (bottom-up)
```supermodo:graph
{"title":"Dependency order — leaves first","nodes":[
  {"id":"types","label":"1. types.ts","kind":"ok"},
  {"id":"valid","label":"2. validators.ts","kind":"ok"},
  {"id":"orch","label":"4. orchestrator.ts","kind":"warn"}],
 "edges":[{"from":"valid","to":"types"},{"from":"orch","to":"valid"}]}
```

The order IS the dependency graph, so draw it as one — numbered so the
sequence survives in the text. Any cycle found in Phase 1 is an edge with
`"kind": "cycle"`; it must be broken before the files it touches are
refactored, and the plan says how.

### Per-File Changes
For each file, under the tree:
- Current state (size, smell count)
- Proposed extractions (what moves where, before/after for key changes)
- New files with proposed paths

### Repeated Patterns
- Construction patterns to replace with factories or declarative specs
- Identify the template, show the proposed factory/spec, count affected sites

### Error Handling Strategy
- Proposed consistent pattern for the module (Result-based, with specific error types)
- Which existing patterns change and how
- Logging approach (separated from core logic via hooks/callbacks where possible)

### Performance Considerations
For each structural change that could affect runtime:
- Note whether it's hot-path code (called frequently, large datasets)
- If proposing immutable patterns (object spreads), note allocation cost vs mutation
- If replacing for-of with map/flatMap, note intermediate array creation
- Recommend the faster option with reasoning

### Utilities to Extract
- Functions to move to packages (with target package)
- Existing similar utilities found (with file paths and line numbers)
````

When pragmatism vs strictness is ambiguous — especially around external API types, third-party library patterns, or shared utility changes — ask the user (transport per `questions.transport`) rather than assuming.

**If the user declines**, keep the plan body exactly as written and update the
frontmatter: `status` → `skipped`, `questions` emptied, the reason in
`summary`. A rejected plan is worth keeping — it records what was proposed and
why it was not wanted, which is what stops the next run proposing it again —
but leaving it at `needs-input` with an open question would strand it in the
archive's "Needs you" tab, still asking a question the user has answered.

---

## Phase 3: Safety Net

Write tests BEFORE refactoring begins to capture existing behavior.

### Strategy: Lightweight Before, Comprehensive During

The pre-refactoring tests are a **safety net**, not the final test suite. The heavy testing investment goes into the extracted functions during Phase 4.

### Before Refactoring: Behavioral Contract Tests
- Test every **exported** function's input→output contract
- Happy path + key error cases for each
- Test observable behavior and return shapes, not internal implementation
- For Result-returning functions: verify Ok shape on success, Err on expected failures
- Keep tests fast — mock I/O at boundaries

These tests verify that refactoring doesn't break the public API contract. They don't need to cover every internal code path — that code is about to be restructured.

### Process
1. Create test files following project conventions (`*.test.ts`)
2. Write behavioral contract tests for each exported function
3. Run tests — all must pass before Phase 4 begins
4. If a test reveals an existing bug: flag it to the user, ask whether to preserve current behavior (default) or fix it — a fix is a separate test-first step outside the refactor, reported separately (see "What NOT to Do")

---

## Phase 4: Incremental Execution

Work through the plan one file at a time, in dependency order.

### 4a. Extract & Transform

Move functions to new homes. Convert imperative patterns to functional:

- **`let` → `const`**: Eliminate mutation via map/reduce/accumulated values
- **`for`/`while` → map/filter/reduce/forEach**: Declarative iteration — but keep `for-of` when it's faster for the dataset size
- **`try/catch` in business logic → Result chains**: pipe/chain/map composition. try/catch stays only at I/O boundaries in packages — wrapping external APIs and returning `Result<T, SpecificError>`
- **Large functions → composed small functions**: Break into named steps, compose with pipe
- **Silent error swallowing → explicit Result handling**: Replace `catch { return [] }` with proper `Result<T, E>` returns that make failures visible
- **Repeated construction → factory functions or declarative specs**: When the same object shape is built 5+ times with only a few fields varying, extract a factory function or a declarative field spec that generates the objects

### 4b. Organize by Concern

When splitting a file, create a directory structured by layer:

```
feature/
  mod.ts              # re-composes and exports the public API
  types.ts            # domain types, branded types, error unions
  queries.ts          # I/O: database/API calls (impure shell)
  transforms.ts       # pure: data transformations
  validators.ts       # pure: validation logic
```

Adapt to actual concerns present. Not every split needs all layers.

### 4c. Component Library Reuse (frontend)

When refactoring `.tsx` files, list the project's component library directory recursively to discover available components. If inline JSX replicates what a library component already provides, replace it with an import. If a reusable UI element doesn't exist in the library yet, create it there following the existing conventions — never leave components inline in route/page files.

### 4d. DRY Check

Before creating any utility function:
1. Search the codebase for functions with similar purpose
2. If similar exists: show both implementations, propose merge or reuse, ask the user (transport per `questions.transport`)
3. If the function is generic, place it in the right package with unit tests

### 4e. Type Tightening

- Replace `any`/`unknown` with proper types
- Branded types for domain concepts (e.g. `UserId`, `Email`, `DateString`)
- Discriminated union error types for `Result<T, E>`
- `ReadonlyArray<T>` and `Readonly<T>` everywhere
- **External API types**: be pragmatic. If unsure whether a field is reliably present, ask the user (transport per `questions.transport`) rather than assuming strict types

### 4f. Comprehensive Unit Tests for Extracted Code

This is where the heavy testing investment goes. Every extracted function gets a thorough test suite:
- **Pure functions**: various inputs, edge cases, type boundaries, empty inputs, large inputs
- **I/O wrappers**: Result shape (Ok on success, specific Err variants on failure)
- **Factory functions**: verify all generated shapes match expected output
- **Composed pipelines**: end-to-end behavior through the composition

These tests are the permanent regression suite — they "seal the bottle."

### 4g. Update Consumers

- Delete the original file — no barrel re-exports
- Update every import site to new file paths
- Verify no broken imports via type-checker

### 4h. Verify After Each Step

Run the full test suite (contract tests + new unit tests) after each extraction. All tests pass before moving to the next file.

If a test breaks because it tested implementation details (mocked internals, asserted call order), rewrite it to test behavior instead — this is an improvement, not a regression.

### Handling Circular Dependencies

When analysis reveals circular imports:
1. Identify the shared types/interfaces causing the cycle
2. Extract them into a `types.ts` both modules import from
3. Break the cycle — neither file should import from the other

---

## Phase 5: Verification & Summary

After all files are refactored:

1. Run complete test suite
2. Run linter and type-checker
3. Present metrics summary:

````markdown
## Refactor Summary: <target>

```supermodo:bars
{"title":"Purity and coverage","unit":"%","series":[
  {"label":"pure functions — before","value":N,"max":100,"state":"bad"},
  {"label":"pure functions — after","value":N,"max":100,"state":"ok"},
  {"label":"test coverage — before","value":N,"max":100},
  {"label":"test coverage — after","value":N,"max":100,"state":"ok"}]}
```

| Metric              | Before | After  |
|---------------------|--------|--------|
| Files               | N      | N      |
| Avg function size   | N ln   | N ln   |
| Max function size   | N ln   | N ln   |
| Pure functions      | N%     | N%     |
| Test coverage       | N%     | N%     |
| let declarations    | N      | 0      |
| try/catch (non-I/O) | N      | 0      |
| Dead exports        | N      | 0      |
| Silent catch blocks | N      | 0      |

All N tests passing. No behavior changes.
````

The percentage rows lead as a bars block and stay in the table below it — the
chart is what a reader sees, the table is what they check
(`../protocols/references/reports.md`, "Report bodies"). Counts that go to
zero (`let`, silent catches, dead exports) stay table-only: a bar chart of
four bars against zero says less than the row does.

When the refactor changed the module structure — a cycle broken, a `types.ts`
extracted, a dependency inverted — draw the after-state as a
`supermodo:graph` under the summary, with `kind: "cycle"` on any edge still
closing a loop. That is the one result of a structural refactor that prose
genuinely cannot carry.

**Persist it:** the summary is appended to the report Phase 2 already wrote —
same file, same page, `status` now `ok` (or `failed`), `questions` cleared,
`task` set when the refactor was scoped to one triad, and `summary` naming
what actually moved. One report per run: the page the user approved becomes
the page recording what happened to it. Never a second file.

If the plan's tree and the outcome disagree — something you proposed to move
stayed, something you did not propose got deleted — say so under the summary.
An approved plan that quietly changed shape during execution is the one thing
this report exists to make impossible.

**Then publish it** per `../protocols/references/reports.md`: invoke
`node <skills>/reports/scripts/render.ts --report <that path>` and NAME the
page in your final message. Standalone runs only — inside a `flow` run the
orchestrator renders the run page and stages render nothing.

An assessment living only in chat
dies with the session.

---

## Flow integration

When invoked by the `flow` orchestrator, refactor is **stage 6** (clean the
working feature) running as a subagent with its own context, after the tests
gate has passed:

- **Scope is the flow's working feature**, not the whole project. Refactor the
  code the run touched (read the earlier stage reports in
  `.skills/supermodo/runs/<run-id>/` to scope it) — a flow refactor is not an
  invitation to restructure unrelated modules.
- **Write the stage report** per `../protocols/references/reports.md` to
  `.skills/supermodo/runs/<run-id>/06-refactor.md` — `skill: refactor`,
  `status` (`ok` | `failed` | `needs-input` | `skipped`), `summary` (the
  before/after metrics), `drift_notes`, `decisions`, `questions` (only on
  `needs-input`).
- **Never mutate documentation** — emit drift notes only; the stage-7
  librarian pass persists anything the refactor implies for the docs.
- **A verify gate follows (stage 6b, mandatory):** flow reruns the complete
  stage-5 gate — tests + lint/type-check + coverage against the configured
  target — after refactor. Behavior preservation is the whole contract here,
  so leave the working tree in a state that gate can pass; a red gate loops
  back into fix before the run proceeds.
- **Questions mid-flow** go in the report's `questions` frontmatter with
  `status: needs-input` instead of AskUserQuestion; the orchestrator routes
  them and continues this subagent with the answers. In flow, prefer surfacing
  a risky change as a question over guessing — the standalone "never assume,
  ask" rule holds, just through the report channel.

## What NOT to Do

- Never rewrite a whole file in one shot — extract incrementally, verify after each step
- Never create barrel re-export files — update all consumers directly
- Never introduce a utility without searching for existing similar ones
- Never change behavior during refactoring — flag bugs and ask the user. If
  they choose "fix", the fix is a SEPARATE step outside the refactor: write
  the failing test, fix, commit boundary of its own — and the final report
  then says "behavior preserved except the N user-approved fixes (listed)",
  never a blanket "no behavior changes"
- Never assume — not about dead exports, not about type strictness, not about whether code is unused. When in doubt, ask.
- Never sacrifice runtime performance for "cleaner" structure — always choose the faster option
- Never prefix unused variables with `_` — delete them entirely. If a variable is unused after extraction, remove it completely.
- Never silently swallow errors — `catch { return [] }` hides real failures. Convert to explicit Result returns.
- Never leave inconsistent error handling — one module, one pattern.
