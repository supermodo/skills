# hunt — systematic bug hunting

Finds semantic bugs, async issues, data-integrity problems, security
vulnerabilities, performance hotspots, and UI/browser issues — producing a
prioritized report with evidence and fix suggestions. **Report-only** — it
never changes code (pair it with [tdd --debug](tdd.md) to fix what it finds).

## When to use

"Find bugs", "audit this", "check for issues", "are there race conditions",
validating quality before a release — any request to systematically find
problems rather than fix a known one.

## Invocation

```
/supermodo:hunt <path>                # focused: auto-detect relevant layers
/supermodo:hunt <path> --<layer>      # focused: one layer only
/supermodo:hunt --<layer>             # project-wide sweep for one layer
/supermodo:hunt .                     # full project: all layers
/supermodo:hunt --diff [base]         # only files changed vs base (default: merge-base with main)
```

### Layer flags

| Flag | Hunts for |
|---|---|
| `--bugs` | Logic errors, async/race issues, error handling, structure, divergent sibling implementations |
| `--data` | Domain invariants, temporal logic, entity resolution, floating point, SQL bugs, type safety |
| `--perf` | Hotspots, recomputation, allocations, N+1 queries |
| `--security` | OWASP injection, access control, data exposure, misconfiguration |
| `--frontend` | React state, hydration, component patterns, accessibility (code-level) |
| `--browser` | Console, network, visual, performance, memory (runtime — needs your dev server up) |

No flag → layers are auto-detected from the code type.

## How it stays honest

- **Find blind, judge informed.** Finders never read `docs/` — a finder that
  knows "this is documented as intentional" stops reporting real bugs hiding
  behind stale docs. The verify phase reads everything and must cite
  evidence to kill or resolve a finding.
- **Two models.** Codex finders run alongside the Claude finders on the
  highest-value layers; findings that both models hit independently are
  marked corroborated. Codex unavailable → the report says "single-model
  hunt", never silently.
- **Every finding is adversarially verified.** Skeptics attack each finding
  (not reproducible / impossible / documented-intentional / severity
  inflated); a cross-check by the other provider attacks the same list.
  Disputes are shown with both arguments verbatim, never silently resolved.
- **Open questions are answered live.** Where docs are silent, you're asked
  before the report is written; answers are recorded in your `decisions/`
  convention so the next hunt resolves them automatically.
- **Evidence over opinion.** Every finding carries file:line, evidence,
  impact, and a suggested fix. No evidence = not a finding.

## Output

A verified report plus machine-readable findings (JSONL, split by severity
and disposition so a fix agent loads only the actionable set), written under
`.skills/supermodo/hunt/`. If your project's docs contract wants audits
placed in `docs/`, that placement goes through librarian — hunt never writes
docs itself. After the report, hunt asks before tearing down anything it
left running (finders, dev servers, browser tabs).

Requires: `protocols`; uses `skills.config.json` when present.
