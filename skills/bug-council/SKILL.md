---
name: bug-council
description: Last resort for ONE stubborn bug the ordinary attempts already failed on — a blind, evidence-driven council of Codex, Claude, Kimi, or available native subagents that falsifies competing hypotheses, implements the smallest causal fix, and verifies it independently. EXPLICIT INVOCATION ONLY - deliberately slow and token-expensive, so never auto-trigger it, never chain into it from another skill, and never run it on bugs a hunt report merely listed. Use only when the user names it (/bug-council, "convene the council", "bring in the bug council") or explicitly asks for the heaviest possible investigation of one specific bug. Otherwise, at most SUGGEST it - when a fix attempt has already failed, a bug is intermittent or unreproducible, the cause is genuinely disputed, or a regression has no obvious culprit - and wait for the user to say yes. For ordinary bugs use tdd --debug; to find unknown bugs use hunt.
---

# Bug Council

Run a structured, evidence-driven bug hunt.

## Invocation policy — read before starting

This skill is the toolkit's most expensive act: several independent agent
seats, blind investigation, falsification rounds, experiments, and a separate
verification pass. It buys certainty about ONE bug at a price no routine bug
is worth. For the toughest stains only.

- **Explicit invocation only.** Run it when the user asked for it by name.
  Never auto-trigger, never chain into it from `hunt`, `flow`, `tdd`, or
  `work`, and never fan it out over a list of findings — a hunt report with
  twelve findings is twelve `tdd --debug` jobs, not twelve councils.
- **Suggest, don't start.** When the signals below appear, offer it in one
  line and stop: "this one keeps resisting — want me to convene the bug
  council? It's slow and expensive, but it settles the cause." Then wait.
- **Right signals:** a fix was already attempted and failed (the strongest
  one); intermittent or unreproducible failures; several plausible
  explanations that all fit the evidence; a regression with no obvious
  culprit commit; a bug that keeps coming back after being "fixed"; a
  symptom crossing service, thread, or process boundaries.
- **Wrong signals:** a stack trace pointing at the line; a failing test with
  a clear assertion; anything reproducible in one command that nobody has
  tried to fix yet; wanting *more* bugs found rather than *one* explained.
  Those are `tdd --debug` (fix a known bug) or `hunt` (find unknown ones).
- **Scope is one bug.** Two bugs = two runs, or none.

The goal is not agreement between agents. The goal is:

1. reproduce or objectively observe the failure;
2. identify the first incorrect state, operation, or violated contract;
3. falsify plausible competing explanations;
4. create a regression test or equivalent objective probe;
5. implement the smallest causal fix;
6. have a separate agent independently attack and verify the patch.

Codex, Claude, Kimi, and native subagents do not share one hidden context. Treat the hunt as a federated session coordinated through an immutable dossier, anonymized hypotheses, experiment results, and an evidence ledger.

## Non-negotiable rules

- Runtime observations, repository evidence, and executable experiments are evidence.
- Agent confidence, eloquence, majority votes, and consensus are not evidence.
- Keep initial investigations blind.
- Never show an investigator another investigator's initial report.
- Preserve every initial report unchanged.
- Do not edit production code during diagnosis.
- Do not let multiple investigators edit the same checkout.
- Only one designated implementer may produce the final patch.
- The implementer cannot verify its own patch.
- Use a fresh judge that did not author or critique the hypotheses.
- Use a fresh verifier that did not implement the patch.
- Do not declare the bug solved merely because tests pass.
- Verify that the patch fixes the cause rather than masking the symptom.
- Do not perform destructive Git operations.
- Do not modify production systems, remote data, credentials, infrastructure, or external services without explicit permission.
- Do not expose secrets, tokens, personal data, complete environment files, or unrelated proprietary code to external agents.
- Respect repository instructions such as `AGENTS.md`, `CLAUDE.md`, package-level instructions, and contribution guidelines.

## 1. Infer context before asking questions

Inspect the current conversation and the user's bug description first.

Then inspect the repository when available:

```bash
git rev-parse --show-toplevel
git status --short
```

Read applicable instructions and discover relevant commands from files such as:

```text
AGENTS.md
CLAUDE.md
README.md
CONTRIBUTING.md
package.json
deno.json
pyproject.toml
Cargo.toml
go.mod
Makefile
justfile
docker-compose.yml
compose.yml
```

Determine, where possible:

- actual behavior;
- expected behavior;
- exact reproduction;
- failure frequency;
- error messages, logs, traces, or failing assertions;
- affected component;
- suspected change;
- last known good revision;
- relevant test, lint, typecheck, and build commands;
- whether the working tree is dirty;
- actions that appear safe or unsafe;
- available native subagent capabilities;
- available external coding-agent commands.

Do not ask the user for information that already exists in the conversation, repository, issue description, logs, or current environment.

## 2. Ask only the missing questions

Ask one compact batch containing no more than five questions.

Accept `unknown` as a valid answer.

Normally ask only the missing parts of these questions:

1. **Behavior**

   What happens, and what should happen instead?

   Request the exact observable difference, assertion, error, or undesired state.

2. **Reproduction**

   What exact command or steps trigger the problem?

   Ask whether it is deterministic or flaky and, for a flaky failure, approximately how frequently it occurs.

3. **Scope and history**

   What component, file, request, service, release, commit, or recent change is suspected?

   Ask for the last known good state only when it is not already discoverable.

4. **Permissions and boundaries**

   May the hunt:
   - run local tests, builds, typechecks, and linters;
   - access required local services;
   - access the network;
   - start containers;
   - add temporary instrumentation;
   - create temporary Git worktrees;
   - edit code after diagnosis?

   Ask the user to identify prohibited commands, files, systems, data, or services.

5. **Budget**

   Ask for `quick`, `standard`, or `deep` only when the user has expressed a cost, speed, token, or provider constraint.

   Otherwise select the mode automatically.

Use wording similar to:

```text
I need only the missing details before starting:

1. What is the exact actual behavior, and what should happen instead?
2. What command or steps reproduce it, and is it deterministic or intermittent?
3. Is there a suspected component/change or a known-good revision?
4. May I run local tests/builds, use local services or the network, create temporary worktrees, and edit code after diagnosis? Please list any prohibited actions.

“Unknown” is acceptable for any item.
```

When enough information is already available, ask no questions and start immediately.

After the answers arrive, do not ask for another confirmation unless a later action crosses a previously unspecified safety boundary.

## 3. Detect the available council

Prefer one independent seat from each available provider:

- Codex;
- Claude;
- Kimi;
- native subagents exposed by the current host.

Use the current host's native subagent mechanism for its own provider whenever possible. Avoid launching a nested copy of the host CLI merely to create another seat.

For example:

- when running inside Codex, prefer a native Codex subagent for the Codex seat;
- when running inside Claude Code, prefer a native Claude subagent for the Claude seat;
- when running inside Kimi Code, prefer a native Kimi subagent for the Kimi seat.

Detect external CLIs without assuming they exist:

```bash
command -v codex || true
command -v claude || true
command -v kimi || true
```

Inspect the installed CLI help before constructing a non-interactive command:

```bash
codex --help
claude --help
kimi --help
```

Use only flags supported by the installed version.

External investigators must:

- run with the repository as their working directory;
- receive the same immutable dossier;
- operate in read-only or approval-restricted mode during diagnosis;
- write their response to a separate temporary file;
- receive no other investigator's initial report;
- avoid including secrets or unrelated files in their prompts.

A command named `claude` may be configured to route to Kimi or another provider. Do not count it as an independent Anthropic seat unless its configuration actually uses an Anthropic model.

Likewise, identify provider independence by the real model/provider configuration rather than by the executable name alone.

When fewer providers are available, fill the remaining seats with fresh native subagents using distinct evidence scopes.

Do not create decorative personas that all inspect the same evidence.

## 4. Select the hunt mode

Choose automatically unless the user explicitly selected a mode.

### Quick

Use when the bug is:

- deterministic;
- local;
- low-risk;
- narrowly scoped;
- inexpensive to reproduce.

Configuration:

- 2 blind investigators;
- no debate unless their findings materially conflict;
- one adjudicator or coordinator evidence review;
- one implementer;
- one independent verifier.

### Standard

Use as the default for an unclear codebase bug.

Configuration:

- 3 blind investigators;
- one adversarial falsification round;
- a fresh independent judge;
- one implementer;
- a separate verifier.

### Deep

Use when the bug involves one or more of:

- intermittent or flaky behavior;
- concurrency or ordering;
- caching or stale state;
- lifecycle behavior;
- cross-service interactions;
- security;
- data loss or corruption;
- production-only behavior;
- no reliable reproduction;
- a large blast radius;
- an expensive regression;
- several plausible surviving causes.

Configuration:

- 4 blind investigators;
- one falsification round;
- one rebuttal round;
- discriminating experiments;
- a fresh independent judge;
- one implementer;
- a separate verifier;
- at least one boundary, mutation, or counterexample check.

Escalate:

- from `quick` to `standard` when the reports materially disagree or lack direct evidence;
- from `standard` to `deep` when several hypotheses survive experiments or the likely patch has a high blast radius.

Do not add agents merely because more agents are available.

## 5. Create the immutable bug dossier

Create a temporary hunt directory outside the repository when possible:

```bash
REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
HUNT_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/bug-council/$(basename "$REPO")-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$HUNT_DIR/private" "$HUNT_DIR/public" "$HUNT_DIR/experiments"
```

Create `dossier.json`:

```json
{
  "observed_behavior": "...",
  "expected_behavior": "...",
  "reproduction": {
    "steps": ["..."],
    "command": "...",
    "frequency": "deterministic | intermittent | N/M | unknown"
  },
  "evidence": [
    "error",
    "stack trace",
    "log",
    "failing assertion",
    "observable incorrect state"
  ],
  "environment": [
    "operating system",
    "runtime",
    "dependency versions",
    "relevant configuration"
  ],
  "suspected_scope": ["files", "modules", "services", "commits", "or unknown"],
  "last_known_good": "commit, release, date, or unknown",
  "working_tree_status": ["..."],
  "working_tree_is_part_of_bug": false,
  "allowed_actions": ["read repository", "run selected tests"],
  "prohibited_actions": ["..."],
  "test_commands": ["..."],
  "non_goals": [
    "unrelated refactoring",
    "formatting unrelated files",
    "dependency upgrades"
  ],
  "mode": "quick | standard | deep"
}
```

Treat the dossier as immutable after the investigation starts.

Corrections must be recorded as separate amendments rather than silently replacing previous facts.

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

## Persist and publish

Standalone runs write this report to
`.skills/supermodo/bug-council/<YYYYMMDD-HHMMSS>.md` per
`../protocols/references/reports.md` — a result living only in chat dies with
the session. Then publish it:

```
node <skills>/reports/scripts/render.ts --report <that path>
```

and NAME the page in your final message. Inside a `flow` run this does not
apply: the stage report is the artifact and the orchestrator renders the one
run page.

Where the seats landed opens the report as a block
(`../protocols/references/reports.md`, "Report bodies") — a council's value is
that independent sessions converged or did not, and that is a shape, not a
paragraph:

````
```supermodo:bars
{"title":"Seats by hypothesis","unit":"seats","series":[
  {"label":"stale cache key","value":3,"state":"ok"},
  {"label":"race in the writer","value":1,"state":"warn"},
  {"label":"no conclusion reached","value":1,"state":"bad"}]}
```
````

Only seats that actually ran are counted. A seat that failed to launch or
returned nothing is never folded into another hypothesis to make the chart
look decisive — it is its own bar, or it is absent and said in words. When the
adjudicated cause runs through several modules, a `supermodo:graph` of the
chain beats describing it.

Frontmatter: `status` is `ok` when the council reached an adjudicated cause,
`needs-input` when it ended on a question only the user can answer (with that
question in `questions`), `failed` when no seat produced a usable report; set
`task` when the bug belongs to a triad.
