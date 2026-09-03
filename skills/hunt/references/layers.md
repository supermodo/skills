# Layer reference files — what each finder checks

One finder reads ONE of these and checks only its patterns. Dispatch table and
layer flags live in `../SKILL.md`.

| File | Patterns | Focus |
|------|----------|-------|
| `semantic.md` | Stale closures, stale accumulators, divergent representations, config-behavior mismatch, off-by-one, predicates, dead code | Logic correctness |
| `async.md` | Missing await, race conditions, uncaught exceptions in wrappers, promise leaks, timer leaks | Concurrency |
| `error-handling.md` | Silent swallowing, pattern catalog, consistency, error type granularity, logging audit | Error patterns |
| `structure.md` | Repeated construction, exact/near duplication, circular deps, dead exports, unused variables | Code organization |
| `data-integrity.md` | Domain invariants, temporal, entity resolution, completeness, floating point, SQL bugs, N+1 queries | Domain data |
| `type-safety.md` | any leakage, name collisions, loose types, assertion safety, schema drift | Type system |
| `perf.md` | O(n) hotspots, recomputation, allocations, memory, iteration tradeoffs, SQL performance | Runtime speed |
| `security.md` | OWASP injection, access control, data exposure, misconfiguration, dependencies | Security |
| `frontend.md` | React state, hydration, component patterns, accessibility | UI code |
| `browser.md` | Console, network, visual, Lighthouse, performance, memory, interactions | Runtime testing |
