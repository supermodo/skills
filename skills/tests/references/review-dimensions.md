# Specialist Review Briefs

Briefs for the audit fleet. Paste the relevant section into a reviewer prompt,
together with: the scope file list (test files + the source files they cover),
the coverage map, the findings JSON schema from SKILL.md, and the instruction to
return ONLY the JSON array.

Each brief tells the agent to read before judging. An auditor that has not read
the spec or the source produces plausible noise; the verification pass will kill
it, but that wastes a round trip — read first.

The **source of intent** is always the project's own docs, resolved through the
router (`docs.entry` from config, default `docs/README.md`) and its
`reference/` contracts and `decisions/` ADRs — never this skill's assumptions.

---

## §1 Spec-alignment auditor (prefix `SA-`)

You audit whether tests assert **intended** behavior, not merely current
behavior. A test that locks in a bug is worse than no test: it makes the bug
load-bearing.

**Source of intent, in priority order:** the routed contracts under
`reference/`, the governing ADRs in `decisions/`, then `CONVENTIONS.md` and any
domain notes the router points to. Read the sections relevant to your scope
before opening a single test file.

For each test file in scope:

1. **Map it to its spec section.** Which contract/ADR governs this module?
2. **Check the assumptions.** Do fixture values and expected outputs match the
   documented contract? Watch for tests that encode a value the spec never
   promised, or that conflate two documented concepts the spec keeps distinct.
3. **Flag tests asserting incidental implementation details** — private
   ordering, internal intermediate shapes, exact log strings — that would break
   on a valid refactor while catching no real regression.
4. **Flag spec'd behavior with zero tests.** Walk the contract's normative
   statements ("must", "never", invariants) and list each one no test
   exercises. These are your highest-value findings.
5. **Flag contradictions.** Two test files encoding conflicting assumptions
   about the same function means at least one is wrong — cite both.

Severity guide: spec violation encoded in a passing test = CRITICAL; normative
spec clause untested = HIGH; implementation-detail coupling = MEDIUM.

---

## §2 Assertion-strength auditor (prefix `AS-`)

You hunt tests that would still pass if the code were subtly wrong. For every
suspect, state the exact wrong implementation that would slip through — that
statement goes in `why_it_matters` and is what the verifier will check.

Patterns:

- **Success asserted without asserting the payload.** The test checks that a
  call succeeded but never asserts the returned value — the function can return
  success with a wrong value forever. Assert on the value, not just the status.
- **Mock echo.** The mock returns X, the test asserts X. That tests the mock.
  Real signal: would the assertion fail if the unit under test ignored or
  mangled the mock's data?
- **Self-fulfilling expectations.** Expected value computed by the same helper
  or formula as the code under test. A shared bug passes. Expected values for
  nontrivial math must be hard-coded from an independent source (hand
  calculation, upstream docs, a reference implementation).
- **Shape-only assertions.** Asserting length, key presence, or "is array" but
  not content. A length-3 assertion passes with three wrong rows.
- **Missing negative tests.** Only the happy path asserted. Invalid input must
  fail in the documented way — assert the error kind/message, not just "it
  errored".
- **Boundary-free numeric assertions.** `value > 0` where the spec implies an
  exact result. Tolerance-based comparisons with a sloppy epsilon that would
  absorb a real error.
- **Catch-all error swallowing in tests.** try/catch (or `.catch`) around the
  act phase that converts failures into silent passes.

Severity guide: weak assertion on domain-critical logic or core invariants =
CRITICAL/HIGH; weak assertion on utilities = MEDIUM; style-level = LOW.

---

## §3 Corner-case hunter (prefix `CC-`)

You enumerate boundaries per exported function (the public module surface) of
each scope package, then check whether a test exercises each one. Report the
gaps — with the concrete input that goes untested and what wrong behavior could
hide there.

**Generic boundaries** (every function): empty collection / single element /
many; `null`/`undefined`/absent on optional params; min/max numeric values;
zero and negative where the domain allows only positive; duplicate entries in
input; unsorted input where order matters; unicode/whitespace in string keys;
very large inputs where limits or pagination apply.

**Domain boundaries.** Beyond the generic list, enumerate the boundaries that
are specific to THIS project's domain, taken from its documented contracts (see
the domain-lens section below), and check each against scope.

Only report gaps for boundaries that are _reachable_ in the function's domain —
a boundary the type system already excludes is not a finding.

Severity guide: untested boundary on domain-critical logic = HIGH; on plumbing
= MEDIUM; theoretical-but-reachable = LOW.

---

## §4 Coverage-balance auditor (prefix `CB-`)

You judge whether coverage sits where risk sits — not the headline percentage.
Using the coverage map plus the routed contracts:

- Flag modules where coverage clusters in trivial code (config parsing, simple
  mappers, getters) while the risky logic the docs call critical sits thinly
  covered or untested.
- Flag high-percentage packages whose critical path is nonetheless a gap: a
  package at 90% with its core algorithm untested outranks one at 70% that is
  evenly covered.
- Report the specific critical functions that need coverage first, with the
  contract clause that makes them critical.

Severity guide: critical-path gap in domain-critical logic = HIGH; skewed
coverage on plumbing = MEDIUM.

---

## Domain lens — derive it, never hardcode it

Domain-critical logic deserves a domain-specific review lens, but WHAT is
critical is a property of the project, not of this skill. Derive the lens from
the project's own docs every run:

1. Read the router and its `reference/` contracts and `decisions/` ADRs. The
   invariants stated there ("must never", "always", numeric tolerances,
   ordering guarantees, lifecycle rules) ARE the domain lens.
2. For each such invariant, ask the assertion-strength and corner-case
   questions above with that invariant as the target: is there a test that
   would fail if this invariant were violated by a plausible bug?
3. If the config names an agent roster (`agents.dir`), a project-supplied
   domain reviewer there supersedes this derived lens — use it as the fifth
   dimension. With no roster, apply this derived domain lens as the fifth
   dimension yourself.

The principle: silent, plausible-looking wrong output in the project's core
domain is the most expensive failure a green suite can hide. The audit exists
to get from green to trustworthy, and "trustworthy" is defined by the project's
documented contracts — not by any framing baked into this skill.
