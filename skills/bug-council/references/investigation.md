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

The broker seats each role from the user's ordered assignments; a lineage is never permanently bound to one role by this skill.

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

The brief is `roles/investigator.md` (this skill's folder), section "Initial investigation", with `{{DOSSIER}}` and `{{LENS}}` filled in.

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

The brief is `roles/falsifier.md` (this skill's folder), with `{{DOSSIER}}`, `{{HYPOTHESIS}}` and `{{EVIDENCE}}` filled in.

Use fresh critics where possible rather than the original investigators.

## 11. Rebuttal round for deep mode

In `deep` mode, return the critique to the original investigator's seat with `--resume` so it keeps its context.

Do not allow an unlimited conversation.

The response must be one of:

```text
ACCEPT
REJECT
MODIFY
```

The brief is `roles/investigator.md` (this skill's folder), section "Rebuttal round", with `{{ORIGINAL_HYPOTHESIS}}`, `{{CRITIQUE}}` and `{{NEW_EVIDENCE}}` filled in.

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

The brief is `roles/adjudicator.md` (this skill's folder), with `{{DOSSIER}}`, `{{HYPOTHESES}}`, `{{REVIEWS}}` and `{{EXPERIMENTS}}` filled in.

The judge may select `NONE`.

Do not force a winner.

When the judge selects `NONE`, return `NOT PROVEN` or run the named next experiment when it is safe and authorized.
