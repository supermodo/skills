# Code Structure

Structural issues that breed bugs over time. These aren't bugs today, but they're where the next bug will come from.

## Repeated Construction Patterns
The same object shape built 5+ times with only a few fields varying. This is one of the most impactful findings because it affects every file that touches the pattern.

**What to look for**: Object literals with 8+ fields where the same field set appears multiple times, differing only in 2-3 values. Common in:
- Issue/error/event construction (same metadata fields, different message/code)
- Database row mapping (same field set, different source columns)
- Configuration objects (same structure, different values per variant)

**Propose**: Factory function or declarative spec array that generates the objects. Count affected sites — this quantifies the impact.

**Example**:
```typescript
// BEFORE: 33 sites × 14 fields each = ~500 lines
issues.push({ dimension: 'x', scope: 'y', severity: 'critical', code: 'ABC', ... })

// AFTER: factory + 33 sites × 3-4 fields each = ~150 lines
const issue = createIssue('x', 'y', { severity: 'critical', code: 'ABC', ... })
```

## Exact Duplication
Same function body in multiple files. **Grep**: function names appearing in multiple files. Same utility (escape, format, validate) implemented independently.

## Near-Duplication
Same pattern with minor variations. Common: same SQL query shape with different table names, same validation logic with different field names, same error handling wrapper with different error types.

## Inline Algorithm Duplication
The same computation embedded inside different functions — NOT duplicated function bodies, but duplicated LOGIC. This is often harder to spot because the surrounding code differs.

**What to look for**: Mathematical formulas, delay calculations, threshold computations, status derivation logic that appear in 2+ functions with slight variations. One function might cap at 60s, another at 30s. One adds jitter, another doesn't.

**How to check**: Grep for mathematical operations (`Math.pow`, `Math.min`, `Math.random`) and check if the same formula shape appears in multiple places. Also check: do sibling functions (same prefix, same module) implement overlapping logic internally?

**Why it matters beyond style**: Inline duplication diverges silently. When someone fixes the formula in function A, they don't know function B has a copy. The two implementations drift apart, causing inconsistent behavior.

## Circular Dependencies
A imports from B, B imports from A. Often caused by shared types — fix is extracting types to a third file.

**How to check**: For each import, check if the imported file imports back from the current file.

## Dead Exports
Functions exported but never imported anywhere. Use Phase 2 usage tracing results. **Flag as question, never assume deletion** — they may exist for future use or external consumers.

## Unused Variables
- Variables assigned but never read
- `_`-prefixed variables — delete entirely, not prefix
- Function parameters never used in the body

**Grep**: `_[a-zA-Z]` for underscore-prefixed vars.
