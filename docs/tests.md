# tests — fix, audit, coverage

Test coordinator for a configured project. All framework, command, and
domain specifics come from `skills.config.json` and your docs — nothing
about a stack is hardcoded.

## Modes

| Invocation | Mode |
|---|---|
| `/supermodo:tests` | **Fix** — get everything passing. Already green → report, offer the audit |
| `/supermodo:tests audit [scope]` | **Audit** — specialist fleet + mutation probes + two-model verified findings |
| `/supermodo:tests coverage` | **Coverage** — drive to the configured target with a balance check |

`scope` for audit: package names, `all`, or empty (= changed since the last
audit).

## Fix mode

Builds a failure inventory (types, tests, lint, format), then fixes root
causes in dependency order — one type error can fail dozens of downstream
tests, so compile errors go first, then unit tests leaf-packages-first, then
integration/E2E, lint last. Zero tolerance: a failing test is never skipped,
commented out, or loosened to pass — either the code is wrong or the test
is, and the report says which and why. You're only asked for real decisions
(test-vs-code ambiguity after the governing contract has been read,
cross-package behavioral changes).

## Audit mode

The question it answers: **would these tests fail if the code were wrong?**

- A parallel fleet of specialist reviewers covers spec-alignment,
  assertion-strength, corner-cases, coverage-balance, and a domain lens
  derived from your docs (or your own roster's reviewers when configured).
- **Mutation probes** give ground truth where configured: deliberately
  broken code that no test catches upgrades a weakness finding to confirmed
  with proof.
- **Every finding is adversarially verified by two models** — host-model
  skeptics plus an opposite-provider cross-check. Refuted findings are
  dropped to an appendix, disputes shown with both arguments verbatim. If
  the adversary CLI is unavailable it stops and asks — single-model results
  are always labeled.

The verified report ranks findings by severity; you choose which buckets to
implement (missing tests first — most protection — then weak assertions).

## Coverage mode

Generates the coverage map, lists untested public surface, error paths, and
boundaries per package below target — but runs a **balance check first**: if
coverage clusters in trivial code while domain-critical logic sits untested,
critical-path gaps outrank the percentage. The number is a proxy, not the
goal.

## As flow's gate (stage 5)

A mandatory gate over the tiers you actually configured: a test command is
the hard minimum; lint and coverage gate only when configured; unconfigured
tiers are named as explicit residual risk, never silently pretended. Green =
every configured tier passes.

Requires: `protocols`, a valid `skills.config.json` ([config.md](config.md)).
