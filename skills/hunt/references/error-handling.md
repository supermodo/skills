# Error Handling & Logging

Inconsistent error handling is a bug factory. When a module uses 3 different patterns, developers copy whichever they see first — and the silent-swallow variant spreads.

## Error Pattern Catalog

For each function in the target, note which pattern it uses:
- Returns `Result<T, E>` with typed error → **correct**
- Returns `Result<T, Error>` with generic Error → **acceptable but could be tighter**
- `try/catch` at I/O boundary returning Result → **correct for boundary wrappers**
- `catch { return [] }` or `catch { return null }` or `catch { return 0 }` → **silent swallowing — BUG**
- `throw` statement → **violation unless at I/O boundary in a package**
- No error handling (can fail but doesn't handle) → **BUG**

## Silent Error Swallowing
The most dangerous pattern. Catch blocks that return empty/default values:
- `catch { return [] }` — caller can't distinguish "no data" from "database down"
- `catch { return 0 }` — caller can't distinguish "zero items" from "query failed"
- `catch { return null }` — null propagates silently through the call chain

**Grep patterns**:
```
catch.*return \[\]
catch.*return null
catch.*return 0
catch\s*\{
```

## Consistency Check
- Does the module use ONE error pattern or a mix?
- If mixed: which functions deviate and why?
- Propose a unified approach

## Error Type Granularity
- Generic `Error` where discriminated unions would help callers branch on failure mode
- Same error type for fundamentally different failures (network timeout vs schema mismatch vs missing data)

## Logging Audit
- Which functions log errors? Which fail silently?
- Is the logger from `@pkg/logger` or ad-hoc (`console.*`)?
- Are error logs structured with context (operation name, IDs)?
- Is the same event logged twice via different mechanisms?
- Are logger calls wrapped in try/catch (suggesting the logger itself is unreliable)?
- Is logging baked into core logic, or separated via hooks/callbacks?
