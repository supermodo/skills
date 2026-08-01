# refactor — deep functional refactoring

Transforms accumulated code into small, pure, well-tested functional
modules. Analyzes before touching code, plans before executing, tests before
changing, verifies after each step.

## When to use

Files that grew unwieldy, god functions, mixed concerns, poor testability —
"this file is too big", "split this", "make this more functional".

## Invocation

```
/supermodo:refactor <path>          # file, directory, module, or "project"
/supermodo:refactor src/queries/
/supermodo:refactor .
```

## Principles

- **Pure core, impure shell** — I/O at the edges in thin orchestrators;
  transforms pure and testable without mocks.
- **Behavior preservation** — refactoring never changes what code does.
  Every behavioral contract is captured in tests *before* structural changes
  begin; bugs found along the way are flagged and asked about, never fixed
  silently inside the refactor.
- **Runtime performance first** — functional style never at the cost of
  speed; when a pattern introduces measurable overhead, the faster option
  wins and the tradeoff is documented.
- **Never assume** — dead-looking exports, type tightening, unclear intent:
  it asks rather than guessing.
- **DRY with codebase awareness** — before creating a utility it searches
  for an existing one and proposes reuse or merge.

## The phases

1. **Analysis** — reads the target, its dependents and dependencies; counts
   smells (large functions, `let`, try/catch in logic, imperative loops,
   silent error swallowing, repeated construction…); traces real usage of
   every export; hunts semantic anomalies (stale closures, N+1 queries,
   off-by-one). Well-structured large files get a skip recommendation.
2. **Plan & approval** — a full plan (execution order, per-file changes,
   error-handling strategy, performance notes) that waits for your explicit
   approval before any code is touched.
3. **Safety net** — behavioral contract tests for every exported function,
   green before restructuring starts.
4. **Incremental execution** — one file at a time in dependency order:
   extract and convert to functional patterns, organize by concern, tighten
   types, write comprehensive unit tests for extracted code, update all
   consumers directly (no barrel re-exports), verify after each step.
5. **Verification & summary** — full suite + lint + type-check, then a
   before/after metrics table (function sizes, purity, coverage, smells
   eliminated), persisted under `.skills/supermodo/refactor/`.

In `flow`, refactor is stage 6, scoped to the run's working feature, and is
always followed by the mandatory stage-6b verify gate that re-runs the full
test gate.

Requires: `protocols`; uses `skills.config.json` when present.
