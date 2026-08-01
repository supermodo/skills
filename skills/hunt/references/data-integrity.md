# Data Integrity

Bugs specific to data pipelines: temporal consistency, entity resolution,
domain-invariant sanity, and data completeness. The examples below use a
financial/time-series domain to illustrate each class — map them to whatever
invariants your domain guarantees (a value that can't exceed another, a
quantity that can't go negative, a code that can't be reused).

## Domain-Invariant Sanity (financial example)
- Open > High or Low > Close — physically impossible
- Negative volume or negative prices on active trading days
- Zero prices on days with non-zero volume
- Values unchanged for extended periods (stale, not a real plateau)

## Temporal Consistency
- **UTC vs local time confusion**: timestamps without timezone info compared across zones
- **DST gaps**: spring-forward loses an hour (missing data), fall-back duplicates an hour
- **Market calendar**: data present on weekends/holidays
- **Date range boundaries**: inclusive vs exclusive — off-by-one on date ranges
- **Timestamp precision**: mixing millisecond and second precision

## Entity Resolution
- **Identifier reuse**: same symbol/code assigned to different entities over time
- **Key reassignment**: a stable-looking id reassigned during merges/migrations
- **Name changes**: entity renamed but the record not updated

## Data Completeness
- Missing trading days in time series
- Partial loads (some keys missing for a date range)
- NULL vs missing: different semantics (no data vs closed/inactive period)
- Cross-source divergence: same key, different values from different providers

## Floating Point
- Price comparison with `===` (unreliable)
- Cumulative rounding in summations
- Currency precision: use fixed-point or integer cents, not float

## SQL-Specific Data Bugs
- **Bind variable limits**: IN clauses with dynamic lists that can exceed the engine's parameter cap (e.g. SQLite's 999; other engines vary) on large datasets
- **Window function correctness**: PARTITION BY missing columns (e.g., partitioning by one key when a second is also needed), incorrect ORDER BY in LAG/LEAD
- **NULL in aggregations**: COUNT(column) excludes NULLs vs COUNT(*), GROUP BY treating NULL as a distinct group
- **String interpolation in queries**: even from internal sources, fragile if inputs contain quotes — use parameterized queries

## N+1 Query Patterns
- Same query executed in a loop
- Sibling functions independently querying the same data (should share one call)
- Query results not cached when reused within the same operation

**How to check**: Any `await` inside a loop body that touches a database. Also: the same function called 2+ times with identical arguments in the same execution flow.
