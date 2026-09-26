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

The brief is `roles/implementer.md` (this skill's folder), with `{{ROOT_CAUSE}}`, `{{EVIDENCE}}`, `{{REGRESSION_TEST}}`, `{{CONSTRAINTS}}` and `{{REPOSITORY_INSTRUCTIONS}}` filled in.

Use a clean worktree or controlled checkout when the existing working tree contains unrelated changes.

Do not overwrite user changes.

## 16. Independently attack and verify the patch

Use a fresh verifier that:

- did not implement the patch;
- is the `verify` seat of `../sequence.json`: another lineage than the implementer, a fresh session from the judge, resolved by the broker;
- does not initially receive the implementer's reasoning;
- receives the original dossier;
- receives the root-cause statement;
- receives the patch diff;
- receives the regression test;
- has permission to run the relevant checks.

The brief is `roles/verifier.md` (this skill's folder), with `{{DOSSIER}}`, `{{ROOT_CAUSE}}`, `{{PATCH}}` and `{{REGRESSION_TEST}}` filled in.

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

Mention which model held which seat only after adjudication and only when useful.

Do not claim that several lineages worked together unless the ledger shows their independent sessions actually ran successfully.

A seat that returned `failed` (launch, auth, rate limit, stall, identity mismatch) stopped the council where it happened (`intake.md` §3: fix and retry / abort) — the report names the seat, pin and cause for every attempt. A seat that returned `unreviewed` (ran, but no parseable report) is recorded as "no report from this seat"; the council continues only when the remaining seats still satisfy the variant's independence constraints, and the report says which seat is missing.
