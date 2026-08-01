# Async & Concurrency Bugs

Bugs from asynchronous execution, timing, and shared state. These often manifest intermittently, making them hard to reproduce.

## Missing Await
- `async` function called without `await` — result is a dangling promise
- `Promise.all` passed non-promise values (silently wraps, might indicate forgotten await)

**How to check**: Find call sites of async functions. Verify each has `await` or is deliberately fire-and-forget with a comment explaining why.

## Unhandled Promise Rejections
- `.then()` chains without `.catch()`
- `await` inside try/catch where the catch doesn't handle the rejection properly
- `Promise.all` where one rejection kills all — should it be `Promise.allSettled`?

## Race Conditions
- Module-level `let` with lazy async initialization — two concurrent first-access calls trigger double init
- Shared mutable state accessed from multiple async operations without coordination
- Read-modify-write patterns on shared state without atomicity

## Uncaught Exceptions in Wrappers
Functions that promise to return `Result<T, E>` but don't catch throws from the wrapped operation:
- The wrapper catches the Result error case but not the thrown exception case
- This violates "every function that can fail must return Result"

**How to check**: Find every function returning `Result` or `Promise<Result>`. Verify that ALL failure modes (both `err()` returns AND thrown exceptions from callees) are handled.

## Event/Timer Leaks
- `setInterval` / `setTimeout` without corresponding cleanup
- Event listeners added but never removed on teardown
- Subscriptions to observables/streams without unsubscribe

## Sequential When Parallel
- Independent async operations called with `await` one after another when `Promise.all` would be correct
- Sibling functions that each independently await the same data (could be shared)
