# tdd — test-driven development & test-first debugging

Two modes, one discipline: tests lead, production code follows.

| Invocation | Mode |
|---|---|
| `/supermodo:tdd` | **Development** — red-green-refactor while building a feature |
| `/supermodo:tdd --debug` | **Debugging** — hypothesis-testing for an existing bug |

## Development mode

Classic TDD, strictly played (also used by [work](work.md) during
implementation):

1. **Red** — write ONE test for the smallest next behavior and watch it fail
   for the right reason. A test you never saw fail proves nothing.
2. **Green** — write the minimum production code that passes it.
3. **Refactor** — clean what you just touched with green as the safety net.
4. **Repeat.** Never production code without a failing test demanding it.

Rules that bite: one failing test at a time; test behavior through public
surfaces, not implementation details; assertions strong enough to fail on
subtly wrong code; edge cases get their own red-green cycles; leaving any
test red at the end of a session is a failed session.

## Debugging mode (`--debug`)

Most debugging goes: see bug, guess cause, patch, hope. This mode treats
tests as **diagnostic instruments** instead:

1. **Hypothesize** — reproduce the bug reliably, then list ALL plausible
   causes (breadth over depth; the "unlikely" hypothesis is often correct).
2. **Test** — write a test per hypothesis that fails if it's the cause.
   These tests are regression-grade: behavior-named, placed in the canonical
   test files, kept forever.
3. **Execute** — run new tests + the existing suite; the failures are the
   evidence.
4. **Triage** — failing tests → fix; no failures but bug persists → back to
   step 1 with what you've eliminated.
5. **Fix** the root cause, minimally. A hard **zero-trace gate** follows: no
   `BUG-N` references anywhere in code or tests, comments explain design
   decisions, not debugging history.
6. **Sweep** — search the whole codebase for the same pattern; each similar
   instance gets the full treatment, and duplicate implementations found
   along the way are consolidated (with your consent for public API
   changes).
7. **Close out** — update the source audit document (e.g. a hunt report)
   with per-finding status, resolve open questions with you, tear down
   anything left running, and pass a full verification checklist before
   declaring the bug fixed.

Use `--debug` whenever a bug's root cause is unclear or fixes keep not
sticking — the restarts aren't failure, they're the process converging.

In `flow`, tdd runs as stage 4, fixing exactly the confirmed findings from
the [hunt](hunt.md) stage.

Requires: `protocols`; uses `skills.config.json` when present.
