# Bug Council — fix and verification

Steps of the `bug-council` procedure. The rules that govern them are in
`../SKILL.md`; this file is the detail for these steps only.

## Contents

- 14. Create the regression test or objective probe
- 15. Implement the smallest causal patch
- 16. Independently attack and verify the patch
- 17. Completion conditions
- 18. User updates
- 19. Final report

## 14. Create the regression test or objective probe

Only after adjudication identifies a sufficiently supported root cause:

1. Create or identify a regression test.
2. Run it against the buggy state.
3. Confirm that it fails for the expected reason.
4. Save the failure output.
5. Avoid testing an implementation detail unless that detail is itself the contract.

Prefer a behavioral regression test that proves:

```text
given the bug-triggering condition
when the affected behavior executes
then the previously incorrect result is observable
```

When a normal test is impossible, define the strongest objective probe available:

- deterministic reproduction script;
- trace assertion;
- observable state transition;
- request/response comparison;
- database or cache state check;
- log invariant;
- property-based counterexample.

Document why fail-before/pass-after could not be expressed as a normal automated test.

## 15. Implement the smallest causal patch

Assign exactly one implementer.

Prefer a different provider or context from the hypothesis author when possible.

Give the implementer only:

- the selected root cause;
- the decisive evidence;
- the required regression test or probe;
- implementation constraints;
- relevant repository instructions;
- prohibited changes.

Do not give the implementer the entire debate transcript unless a specific detail is necessary.

Use this prompt:

```text
You are the sole implementer for a confirmed bug.

CONFIRMED ROOT CAUSE

{{ROOT_CAUSE}}

DECISIVE EVIDENCE

{{EVIDENCE}}

REGRESSION TEST OR OBJECTIVE PROBE

{{REGRESSION_TEST}}

IMPLEMENTATION CONSTRAINTS

{{CONSTRAINTS}}

REPOSITORY INSTRUCTIONS

{{REPOSITORY_INSTRUCTIONS}}

Implement the smallest change that fixes the confirmed cause.

Rules:

- Do not fix unrelated issues.
- Do not refactor unrelated code.
- Do not rename unrelated symbols.
- Do not reformat unrelated files.
- Do not upgrade dependencies unless the confirmed root cause requires it.
- Do not suppress or weaken the regression test.
- Preserve public APIs unless changing one is explicitly required.
- Remove all temporary diagnostic instrumentation.
- Run the regression test and relevant targeted checks.
- Report every changed file and why it was necessary.

Return:

PATCH SUMMARY:
CHANGED FILES:
WHY EACH CHANGE IS NECESSARY:
REGRESSION TEST RESULT:
TARGETED TEST RESULTS:
KNOWN LIMITATIONS:
```

Use a clean worktree or controlled checkout when the existing working tree contains unrelated changes.

Do not overwrite user changes.

## 16. Independently attack and verify the patch

Use a fresh verifier that:

- did not implement the patch;
- preferably uses another provider;
- does not initially receive the implementer's reasoning;
- receives the original dossier;
- receives the root-cause statement;
- receives the patch diff;
- receives the regression test;
- has permission to run the relevant checks.

Use this prompt:

```text
You are the independent verifier for a bug fix.

Assume the patch may be wrong, incomplete, overbroad, or merely masking the
symptom.

ORIGINAL BUG DOSSIER

{{DOSSIER}}

CONFIRMED ROOT CAUSE

{{ROOT_CAUSE}}

PATCH DIFF

{{PATCH}}

REGRESSION TEST OR PROBE

{{REGRESSION_TEST}}

Verify all applicable items:

1. Reproduce the original failure on the buggy revision or state.
2. Confirm the regression test fails before the patch for the expected reason.
3. Confirm it passes after the patch.
4. Run relevant targeted tests.
5. Run the appropriate broader tests when affordable.
6. Inspect the diff for unrelated changes.
7. Test at least one neighboring boundary case or counterexample.
8. Verify the patch fixes the confirmed causal mechanism.
9. Search for paths where the original cause may still occur.
10. Verify public contracts and compatibility.
11. Confirm temporary instrumentation and files were removed.
12. Identify unresolved high-severity risks.

In deep mode, perform a mutation check when practical:

- temporarily undo or invert the essential part of the fix;
- confirm that the regression test fails;
- restore the patch.

Return:

VERDICT

APPROVED | REJECTED | INCONCLUSIVE

FAIL-BEFORE RESULT:
PASS-AFTER RESULT:
TARGETED TEST RESULTS:
BROADER TEST RESULTS:
BOUNDARY OR COUNTEREXAMPLE TEST:
ROOT-CAUSE FIX VERIFICATION:
UNRELATED DIFF FINDINGS:
RESIDUAL RISKS:
REQUIRED FOLLOW-UP:
```

The implementer must address a verifier rejection through evidence or a revised patch.

Allow at most two patch-and-verification loops before returning the remaining uncertainty to the user.

## 17. Completion conditions

Declare `SOLVED` only when all applicable conditions hold:

- the bug was reproduced or objectively observed;
- the first incorrect state, operation, or violated contract was identified;
- the causal explanation is supported by direct evidence;
- material competing hypotheses were tested or explicitly left unresolved;
- the regression test or objective probe fails before the patch;
- the same test or probe passes after the patch;
- relevant existing tests pass;
- at least one adversarial boundary or counterexample was exercised;
- no unresolved high-severity counterevidence remains;
- the production diff is minimal;
- temporary instrumentation was removed;
- the independent verifier approves the fix.

Do not use these as completion conditions:

- all agents agree;
- one agent is highly confident;
- the patch looks reasonable;
- the original error disappeared once;
- the newly added test passes only after being weakened;
- the implementer says the work is complete.

When the conditions are not met, report:

```text
NOT PROVEN
```

Then state:

- what was established;
- what remains uncertain;
- which hypotheses remain viable;
- the next highest-information experiment;
- any permission or environment limitation preventing that experiment.

## 18. User updates

Keep the user informed only at meaningful phase boundaries.

Useful updates include:

- baseline reproduction established;
- initial independent investigations started;
- a decisive contradiction discovered;
- experiments narrowed the cause;
- the judge selected a supported root cause;
- the regression test now fails before the patch;
- implementation completed;
- independent verification approved or rejected the patch.

Do not expose:

- raw internal agent chatter;
- hidden reasoning;
- repetitive operational details;
- provider identities before adjudication unless operationally necessary.

Share concrete evidence as soon as it becomes decisive.

## 19. Final report

Return a concise but complete report with these sections:

```text
STATUS

SOLVED | NOT PROVEN | BLOCKED BY ENVIRONMENT

BASELINE AND REPRODUCTION

- Actual behavior:
- Expected behavior:
- Reproduction:
- Failure frequency:
- Environment:

CONFIRMED ROOT CAUSE

- Root-cause statement:
- First incorrect state or violated contract:
- Causal chain:

DECISIVE EVIDENCE

- ...

REJECTED OR UNRESOLVED HYPOTHESES

- ...

REGRESSION TEST OR OBJECTIVE PROBE

- Fail-before result:
- Pass-after result:

PATCH

- Changed files:
- Minimal-fix explanation:
- Diff scope:

COMMANDS AND RESULTS

- ...

INDEPENDENT VERIFICATION

- Verdict:
- Boundary or counterexample tested:
- Mutation check, when applicable:

RESIDUAL RISKS

- ...

CONFIDENCE

- ...
```

Mention provider participation only after adjudication and only when useful.

Do not claim that several providers worked together unless their independent sessions actually ran successfully.

When an external provider failed to launch, authenticate, read the repository, or return a valid report, state that clearly and continue with the remaining independent seats when the investigation remains valid.
