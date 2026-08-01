# Type Safety

TypeScript's type system prevents bugs at compile time — but only if you use it. These patterns bypass the safety net.

## `any` / `unknown` Leakage
- Explicit `: any` annotations
- `as unknown as T` unsafe double-cast
- Generic `Error` type where a discriminated union would be more specific
- Functions returning `Promise<any>` instead of typed results

**Grep**: `: any`, `as any`, `as unknown as`, `: unknown`

## Type Name Collisions
Same type name defined in multiple files with different shapes. Importing from the wrong file gets the wrong type silently.

**How to check**: Grep for `interface <TypeName>` and `type <TypeName>` across the codebase. If the same name appears in 2+ files, compare shapes.

## Loose Parameter Types
- `string` where a branded type would enforce domain semantics (e.g. `UserId`, `Email`, `DateString`)
- `number` where it could be more specific (price, volume, count)
- Optional vs nullable confusion: `field?: T` (might not exist) vs `field: T | null` (exists but empty)

## Assertion Safety
- `as SomeType` without prior Zod validation — trusting external data shape
- Database row casts (`as ReadonlyArray<SomeRow>`) — runtime untyped
- API response casts — provider data might not match expected shape

**How to check**: Every `as` keyword. Is there a Zod parse or runtime check before the assertion?

## Schema Drift
- Code assumes columns/fields that might not exist in older data files
- Migrations that add columns — does code handle pre-migration rows?
- Hardcoded column names that should come from schema definitions
