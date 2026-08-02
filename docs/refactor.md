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
2. **Plan & approval** — a full plan that waits for your explicit approval
   before any code is touched. **You see it before you approve it:** the plan
   is written and opened as a page first, leading with a tree of what moves
   where — every file exactly once, coloured by what happens to it (created,
   changed, deleted, left alone) and annotated with the evidence: the source
   range it comes from, the before → after size, the caller count behind a
   deletion. Then the dependency graph that gives the execution its order,
   and a bar of the scope. The prose underneath carries what a diagram can't:
   error-handling strategy, performance notes, why.

   A nineteen-file plan as chat bullets is a gate that gets a yes because
   reading it properly is harder than trusting it. A tree is checkable in
   seconds. If you decline, the page stays — a record of what was proposed
   and why you didn't want it.
3. **Safety net** — behavioral contract tests for every exported function,
   green before restructuring starts.
4. **Incremental execution** — one file at a time in dependency order:
   extract and convert to functional patterns, organize by concern, tighten
   types, write comprehensive unit tests for extracted code, update all
   consumers directly (no barrel re-exports), verify after each step.
5. **Verification & summary** — full suite + lint + type-check, then the
   before/after metrics (function sizes, purity, coverage, smells
   eliminated) added to the same page you approved in phase 2. One report per
   run: what was proposed and what actually happened sit on one page, and any
   disagreement between them is called out rather than quietly smoothed over.

In `flow`, refactor is stage 6, scoped to the run's working feature, and is
always followed by the mandatory stage-6b verify gate that re-runs the full
test gate.

Requires: `protocols`; uses `skills.config.json` when present.
