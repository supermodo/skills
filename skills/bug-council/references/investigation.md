# Bug Council — investigation

Steps of the `bug-council` procedure. The rules that govern them are in
`../SKILL.md`; this file is the detail for these steps only.

## Contents

- 6. Establish the baseline
- 7. Assign distinct investigative lenses
- 8. Initial investigator prompt
- 9. Build the anonymized hypothesis ledger
- 10. Adversarial falsification
- 11. Rebuttal round for deep mode
- 12. Select discriminating experiments
- 13. Independent adjudication

## 6. Establish the baseline

Before accepting any root-cause theory:

1. Run the supplied reproduction when authorized.
2. Record the exact command.
3. Record the working directory.
4. Record relevant environment details.
5. Record the exit status.
6. Save relevant standard output and standard error.
7. Record the visible incorrect behavior.
8. Repeat the reproduction when failure frequency matters.

Store a baseline similar to:

```text
command:
working_directory:
revision:
working_tree_state:
environment:
attempts:
failures:
exit_status:
relevant_output:
observable_result:
```

When the bug cannot be reproduced:

- state that explicitly;
- do not invent a root cause;
- identify the smallest observable probe that distinguishes correct behavior from incorrect behavior;
- use `deep` mode when uncertainty or risk justifies it.

## 7. Assign distinct investigative lenses

Assign the following lenses in order.

Rotate providers between roles across hunts. Do not permanently bind a provider to one role.

### Lens A: Runtime and data-flow tracer

Investigate:

- actual runtime values;
- state transitions;
- control flow;
- side effects;
- request and response transformations;
- event emissions;
- database or cache reads and writes;
- the first runtime point where actual behavior diverges from expected behavior.

Prefer traces, debugger observations, focused logging, and existing tests over speculation.

### Lens B: Fault-propagation analyst

Trace backward from the visible symptom through:

- calls;
- imports;
- dependencies;
- callbacks;
- events;
- queues;
- state ownership;
- boundaries between components or services.

Construct at least two possible fault-propagation paths and identify the earliest defective assumption on each path.

### Lens C: Contract, configuration, and history analyst

Inspect:

- type contracts;
- API contracts;
- comments and documentation;
- configuration;
- feature flags;
- dependency versions;
- serialization formats;
- Git history;
- blame;
- relevant previous fixes;
- changed assumptions;
- compatibility boundaries.

Do not treat old code as correct merely because it is old.

### Lens D: Concurrency and boundary falsifier

Search for:

- races;
- ordering errors;
- stale closures or stale state;
- lifecycle mistakes;
- retries;
- timeouts;
- cancellation;
- caching;
- clock or timezone behavior;
- boundary values;
- partial failure;
- error-path differences;
- environment-dependent behavior;
- resource cleanup;
- duplicate or missing events.

Attempt to reproduce the symptom using a different execution path.

Use Lens D in `deep` mode or when particularly relevant.

## 8. Initial investigator prompt

Give each investigator the same dossier and one distinct lens.

Do not include any other investigator's findings.

Use this prompt structure:

```text
You are an isolated bug investigator participating in an evidence-driven
debugging council.

You are not trying to agree with other agents. You are trying to produce one
precise, falsifiable causal explanation supported by repository or runtime
evidence.

You must not edit production code during this phase.

Do not perform destructive actions, access prohibited resources, expose
secrets, or inspect unrelated private data.

BUG DOSSIER

{{DOSSIER}}

YOUR INVESTIGATIVE LENS

{{LENS}}

REQUIREMENTS

1. Inspect the relevant repository instructions before reasoning about the
   code.
2. Reproduce or inspect the reported behavior when permitted.
3. Trace the complete causal chain:
   trigger
   -> intermediate transition
   -> first incorrect state or violated contract
   -> responsible operation
   -> visible symptom.
4. Distinguish:
   - OBSERVED: directly shown by execution or repository contents;
   - INFERRED: logically derived from observations;
   - SPECULATIVE: plausible but unsupported.
5. Provide concrete evidence using file paths, line numbers, commands, tests,
   traces, logs, commits, or configuration.
6. Look for evidence contradicting your preferred hypothesis.
7. Consider at least one strong alternative explanation.
8. Design the cheapest experiment that distinguishes your hypothesis from its
   strongest alternative.
9. Do not propose a production patch yet.
10. Do not claim certainty without direct evidence.

Return a structured report with exactly these sections:

PRIMARY CLAIM

One precise and falsifiable root-cause statement.

CAUSAL CHAIN

- Trigger:
- Intermediate transitions:
- First incorrect state or violated contract:
- Responsible operation:
- Visible symptom:

SUPPORTING EVIDENCE

For each item:

- Classification: OBSERVED | INFERRED | SPECULATIVE
- Source:
- Observation:
- Implication:

CONTRADICTING EVIDENCE

For each item:

- Source:
- Observation:
- Effect on hypothesis:

ASSUMPTIONS

- ...

DISCRIMINATING EXPERIMENT

- Setup:
- Exact command or action:
- Predicted result if the hypothesis is true:
- Predicted result if the hypothesis is false:
- Safety or mutation considerations:

AFFECTED SCOPE

- ...

STRONGEST ALTERNATIVE HYPOTHESIS

- Claim:
- Why it remains plausible:
- Evidence needed to distinguish it:

CONFIDENCE

0-100%, followed by a one-sentence justification based on evidence quality.
```

Store each original report privately and immutably.

Assign anonymous identifiers:

```text
H1
H2
H3
H4
```

Do not put provider or model names in the public hypothesis ledger.

## 9. Build the anonymized hypothesis ledger

Create a ledger containing, for every distinct hypothesis:

```text
Hypothesis ID:
Claim:
Causal chain:
Supporting observations:
Contradicting observations:
Unsupported assumptions:
Missing evidence:
Discriminating experiment:
Initial confidence:
Current status:
```

Allowed statuses:

```text
UNTESTED
SUPPORTED
WEAKENED
REFUTED
CONFIRMED
UNRESOLVED
```

Merge only exact duplicate claims.

When two reports reach the same conclusion through materially different evidence, preserve both evidence paths.

Never rank hypotheses by:

- provider identity;
- model identity;
- writing quality;
- report length;
- confidence number alone;
- number of agents supporting the claim.

## 10. Adversarial falsification

Skip this phase in `quick` mode unless the two investigators materially disagree.

In `standard` and `deep` modes, assign a fresh critic to each material hypothesis.

A critic must receive:

- the dossier;
- one anonymized hypothesis;
- its evidence;
- relevant raw experiment output;
- no provider identity;
- no vote count.

Use this prompt:

```text
You are an adversarial hypothesis critic.

Your task is not to produce another broad bug analysis. Your task is to try
to falsify the assigned hypothesis.

BUG DOSSIER

{{DOSSIER}}

HYPOTHESIS

{{HYPOTHESIS}}

AVAILABLE EVIDENCE

{{EVIDENCE}}

RULES

- Evaluate the causal chain one link at a time.
- Identify the strongest valid point.
- Identify unsupported assumptions or broken causal links.
- Search for counterexamples.
- Run a safe discriminating experiment when authorized and practical.
- Do not use consensus, provider reputation, or confidence scores as proof.
- Do not edit production code.
- Return UNRESOLVED rather than forcing a verdict when evidence is missing.

Return:

VERDICT

SUPPORTED | WEAKENED | REFUTED | UNRESOLVED

STRONGEST VALID POINT

- ...

UNSUPPORTED OR INCORRECT CLAIMS

For each item:

- Claim:
- Why it is unsupported or incorrect:
- Evidence:

COUNTEREXAMPLE OR EXPERIMENT

- Setup:
- Command or action:
- Predicted outcomes:
- Actual result:
- Interpretation:

MISSING EVIDENCE

- ...

REVISED CONFIDENCE

0-100%, based only on the available evidence.
```

Use fresh critics where possible rather than the original investigators.

## 11. Rebuttal round for deep mode

In `deep` mode, return the critique to a fresh context using the original investigator's provider when practical.

Do not allow an unlimited conversation.

The response must be one of:

```text
ACCEPT
REJECT
MODIFY
```

Use this prompt:

```text
Review the critique of your original hypothesis.

ORIGINAL HYPOTHESIS

{{ORIGINAL_HYPOTHESIS}}

CRITIQUE

{{CRITIQUE}}

NEW EXPERIMENTAL EVIDENCE

{{NEW_EVIDENCE}}

Choose exactly one:

- ACCEPT: the critique invalidates the original hypothesis;
- REJECT: the critique is invalid, with direct evidence;
- MODIFY: revise the hypothesis to account for new evidence.

A confidence change requires new evidence or a demonstrated logical error.
Do not change your conclusion merely because another agent disagreed.

Return:

DECISION:
REASON:
NEW EVIDENCE:
REVISED CLAIM:
REVISED CAUSAL CHAIN:
REVISED CONFIDENCE:
```

Stop the debate after this round even when disagreement remains.

## 12. Select discriminating experiments

The coordinator selects the smallest set of experiments with the greatest information value.

Prefer experiments that:

- distinguish several hypotheses at once;
- inspect the first suspected incorrect runtime state;
- reuse the real execution path;
- are deterministic;
- reuse existing tests;
- require minimal instrumentation;
- avoid changing production code;
- have unambiguous predicted outcomes.

For every experiment, record:

```text
EXPERIMENT ID:
HYPOTHESES TESTED:
SETUP:
COMMAND:
WORKING DIRECTORY:
ENVIRONMENT:
PREDICTION FOR EACH HYPOTHESIS:
ACTUAL OUTPUT:
EXIT STATUS:
INTERPRETATION:
REMAINING AMBIGUITY:
```

Before running an experiment, write its predicted result for every tested hypothesis.

Do not reinterpret vague output after seeing it.

Temporary instrumentation must be:

- narrowly targeted;
- clearly marked;
- isolated in a temporary worktree when practical;
- removed after the experiment;
- excluded from the final patch unless it is intentionally retained as useful observability.

When investigators require conflicting experimental edits, use separate worktrees:

```bash
git worktree add /tmp/bug-council-exp-a HEAD
git worktree add /tmp/bug-council-exp-b HEAD
```

Do not merge experimental branches.

A hypothesis may be marked `CONFIRMED` only when:

- its predicted behavior matches direct observations;
- the complete causal chain is supported;
- it explains all material symptoms;
- it explains the evidence better than the surviving alternatives;
- no decisive contradicting observation remains.

When no hypothesis survives, launch at most two new investigators targeted specifically at the missing evidence.

Do not restart the whole council without a concrete reason.

## 13. Independent adjudication

Use a fresh judge that:

- did not author a hypothesis;
- did not participate as a critic;
- cannot edit production code;
- does not receive provider identities;
- does not receive vote counts;
- receives the immutable dossier;
- receives anonymized original reports;
- receives critiques and rebuttals;
- receives raw experiment output.

Use this prompt:

```text
You are the independent judge in an evidence-driven debugging investigation.

You must select the best-supported causal hypothesis or return NONE.

Do not choose based on consensus, model identity, writing style, confidence
scores, or the number of agents supporting a claim.

Evaluate each hypothesis using:

1. reproducibility;
2. direct runtime evidence;
3. repository evidence;
4. completeness of the causal chain;
5. ability to explain every material symptom;
6. consistency with control flow and data flow;
7. consistency with documented and historical contracts;
8. unsupported assumptions;
9. experimentally confirmed predictions;
10. decisive counterevidence;
11. regression risk implied by the likely fix.

BUG DOSSIER

{{DOSSIER}}

ANONYMIZED HYPOTHESES

{{HYPOTHESES}}

CRITIQUES AND REBUTTALS

{{REVIEWS}}

RAW EXPERIMENT RESULTS

{{EXPERIMENTS}}

Return:

SELECTED HYPOTHESIS

H? | NONE

ROOT-CAUSE STATEMENT

A precise causal statement naming the first incorrect state, operation, or
violated contract.

CAUSAL CHAIN

- Trigger:
- Intermediate transitions:
- First incorrect state:
- Responsible operation:
- Visible symptom:

DECISIVE EVIDENCE

- ...

REJECTED HYPOTHESES

For each:

- Hypothesis:
- Rejection reason:
- Decisive counterevidence:

UNRESOLVED HYPOTHESES

- ...

IMPLEMENTATION CONSTRAINTS

- ...

NEXT EXPERIMENT IF NONE WAS SELECTED

- ...

REMAINING UNCERTAINTY

- ...

CONFIDENCE

0-100%, based on evidence quality.
```

The judge may select `NONE`.

Do not force a winner.

When the judge selects `NONE`, return `NOT PROVEN` or run the named next experiment when it is safe and authorized.
