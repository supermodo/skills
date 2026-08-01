# Performance

Bugs that don't cause incorrect behavior — they cause slow behavior. On a system processing large datasets (tens of thousands of items, long histories), performance bugs turn 5-second operations into 5-minute ones.

## O(n) Lookups in Loops
The single most common performance bug:
- `.find()` inside a loop — O(n²) when a Map gives O(n)
- `.filter()` inside a loop — same problem
- `.includes()` on arrays inside loops — use a Set
- `.indexOf()` inside loops — same as includes

**How to check**: `.find(` or `.filter(` near `for` / `.map(` / `.forEach(`

## Unnecessary Recomputation
- Pure computation repeated with same inputs — candidate for memoization
- Derived values recalculated every call instead of cached
- Same database result fetched independently by sibling functions

## Duplicated Computation Across Functions
Same formula or algorithm implemented inline in multiple functions. This is a performance concern beyond code smell — different implementations can diverge subtly, causing inconsistent behavior under load.

**What to look for**: The same mathematical pattern in 2+ functions with minor variations:
- Backoff/delay calculations (exponential growth + jitter + cap)
- Hash/checksum computations
- Rate/threshold calculations
- Conversion/normalization formulas

**How to check**: Grep for `Math.pow`, `Math.min`, `Math.max`, `Math.random`, `Math.floor`. If the same formula pattern appears in multiple functions, compare them — are the caps different? Does one have jitter and the other doesn't? These subtle differences cause inconsistent retry behavior, inconsistent rate limiting, etc.

**Fix**: Extract to a single shared function with configurable parameters.

## Unnecessary Allocations in Hot Paths
- Object spread (`{ ...state, field: newValue }`) inside tight loops
- `.map().filter()` chains — intermediate array. Consider single `.reduce()` or `for-of`
- Template literals in hot loops — each creates a new string
- `[...old, new]` to append — O(n) copy each time

**When to care**: Only in hot paths (per-item, per-row, per-request). Cold paths (once at startup): readability > performance.

## Memory Issues
- Arrays/Maps that grow unboundedly (no eviction, no max size)
- Closures capturing large objects that outlive usefulness
- Cached query results without TTL or size limit
- Loading entire files when only a few columns are needed
- Parsing full JSON blobs to extract one field

## Iteration Tradeoffs
- `for-of` is faster than `.map()/.filter()` for 1000+ items in hot paths (no intermediate array)
- `.map().flat()` → `.flatMap()` (one pass instead of two)
- Multiple `.some()`/`.every()` on same array — combine into one pass

## SQL Performance
- WHERE on non-indexed columns
- SELECT without LIMIT on large tables
- Subqueries that could be JOINs
- LIKE '%pattern%' (can't use index)
- String operations in WHERE clauses

## Cross-Layer Performance Note
Even in a --perf focused scan, flag obvious non-performance bugs (stale closures, silent swallowing) as **informational** notes. A performance audit shouldn't be blind to critical correctness issues sitting right in the code. Mark them as "out of scope but noted" rather than ignoring them.
