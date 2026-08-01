# Semantic Bugs

Logic errors that produce incorrect behavior. These are the hardest bugs to find because the code runs without errors — it just does the wrong thing.

## Stale Closures
Variables captured at the wrong time:
- `Date.now()` or time-sensitive values captured in a factory/constructor instead of inside the returned function
- Callbacks referencing outer-scope variables that change between creation and execution
- Event handlers registered once but referencing state that changes

**How to check**: Find functions that return functions. Examine what the inner function closes over. If any captured value is time-dependent or mutable, it should be captured at invocation, not construction.

## Stale Accumulators
Mutable state initialized once but used across multiple invocations:
- `let metrics = {...}` initialized at construction, never reset between calls
- Arrays that accumulate but are never cleared
- Counters that increment but never reset

**How to check**: `let` declarations inside factory functions but outside the returned function.

## Divergent Representations
Two fields tracking the same truth that can drift apart:
- A `count` field AND an array whose `.length` should equal that count, but they're updated independently
- A "status" field AND a set of timestamps that imply a status — updated at different times
- Cached derived values not invalidated when source data changes

**How to check**: Find pairs of fields that represent the same information. Trace all mutation points — are they always updated together?

## Config-Behavior Mismatch
Options defined in types/schemas but silently ignored in implementation:
- Config field accepted in constructor but never read in the logic
- Default values in schema that differ from hardcoded values in code
- Feature flags or options that the code path never branches on

**How to check**: For each config/options type, grep for every field name in the implementation. If a field has zero references outside the type definition and default assignment, it's silently ignored.

## Off-by-One & Boundary
- Inclusive vs exclusive date ranges (`>=` vs `>`, `<` vs `<=`)
- Array slicing: `slice(0, n)` includes n items, `slice(0, n-1)` includes n-1
- Retry counters: does "3 retries" mean 3 attempts or 4?
- Pagination: first page is 0 or 1? Does offset+limit overshoot?

## Predicate Errors
- `!isErr(result)` vs `isOk(result)` — semantically different if Result has a third state
- Negated conditions that read wrong: `if (!items.some(x => !x.valid))`
- Short-circuit evaluation with side effects: `&&`/`||` chains where order matters

## Dead Code
- Functions defined but never called
- Variables assigned but never read (`_`-prefixed = delete, not prefix)
- `if` branches that can never execute
- Code after unconditional `return`/`throw`
