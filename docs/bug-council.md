# bug-council — one hard bug, driven to a verified fix

Takes a single known-but-unexplained bug and runs a blind, evidence-driven
council of independent agent seats (Codex, Claude, Kimi, native subagents)
until the causal fix is implemented and independently verified.

Sibling to [hunt](hunt.md), not a duplicate: `hunt` sweeps a codebase for
*unknown* bugs and never touches code; `bug-council` starts from *one* known
failure and ends with a patch someone else has attacked.

## When to use — sparingly, and only when you say so

For the most difficult stains. This is the toolkit's most expensive act —
several independent agent seats, blind investigation, falsification rounds,
experiments, and a separate verification pass — and it buys certainty about
exactly one bug. **You launch it; nothing else does.** No skill chains into
it: `hunt` sends its findings to `tdd --debug`, `flow` never convenes it, and
a twelve-finding hunt report is twelve `tdd --debug` jobs, not twelve
councils. At most, those skills suggest it in one line and wait for your yes.

Reach for it when the ordinary attempt already lost:

- a fix was tried and the bug is still there — the strongest signal
- the failure is intermittent, flaky, or won't reproduce on demand
- several explanations all fit the evidence equally well
- a regression with no obvious culprit commit
- a bug that keeps coming back after being "fixed"
- a symptom crossing service, thread, or process boundaries

Not for: a stack trace pointing at the line, a failing test with a clear
assertion, or any reproducible bug nobody has tried to fix yet — that's
[tdd --debug](tdd.md), which handles nearly everything. To find *unknown*
bugs, use [hunt](hunt.md). One bug per run: two bugs means two runs.

## Invocation

```
/supermodo:bug-council <bug description>      # explicit invocation only
```

Depth is chosen automatically — `quick` (single seat, obvious blast radius),
`standard` (multiple blind seats + falsification), `deep` (adds a rebuttal
round and discriminating experiments). You only pick it yourself when you
state a cost, speed, or provider constraint.

## The rules that make it work

- **Evidence only.** Runtime observations, repository evidence, and
  executable experiments count. Agent confidence, eloquence, and majority
  votes do not.
- **Blind investigation.** No investigator ever sees another's initial
  report; every initial report is preserved unchanged.
- **Separation of duties.** One designated implementer writes the patch; a
  fresh judge that authored no hypothesis adjudicates; a fresh verifier that
  wrote no code attacks the patch.
- **No diagnosis-time edits.** Production code is not touched until the root
  cause is selected, and never by more than one seat in one checkout.
- **Passing tests are not proof.** The patch must be shown to fix the cause,
  not mask the symptom — via a regression test or objective probe that fails
  before and passes after.
- **Honest degradation.** A provider that failed to launch, authenticate, or
  return a valid report is reported as such; the hunt never claims a
  multi-provider council it did not actually run.

## Flow

Infer context → ask only what's missing (transport per your config) → detect
the available council → pick the mode → freeze an immutable dossier →
establish the baseline → assign distinct investigative lenses (data-flow,
fault-propagation, contracts/history, concurrency/boundaries) → anonymized
hypothesis ledger → adversarial falsification → discriminating experiments →
independent adjudication → regression test → smallest causal patch →
independent verification.

## Output

A report — status, root cause, decisive evidence, rejected hypotheses,
fail-before/pass-after results, patch scope, verification verdict, residual
risks — written under `.skills/supermodo/bug-council/` as it develops, so a
rejected patch or a blocked environment survives session loss.

Requires: `protocols`; uses `skills.config.json` when present.
