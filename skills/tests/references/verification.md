# Tests verification protocol

This file holds only the mechanics specific to verifying **test-quality
findings**. Stance and cross-model operations are NOT re-specified here — they
live in the shared protocol masters (sibling `protocols` skill) and this file defers to them:

- **Adversarial stance** (burden on the claim, attacks cite evidence, "no
  material objection" is valid, disputes surface, persist immediately):
  `../../protocols/references/adversarial-review.md`.
- **Running the opposite-provider adversary** (read-only, no `-m` pin,
  preflight, hung≠slow, batching, honest degradation): `../../protocols/references/cross-model.md`.

Read both before running this pass. What follows is tests-specific only.

---

## Finding schema and id prefixes

Every finding is a JSON object:

```json
{
  "id": "SA-1",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW",
  "package": "<package or module>",
  "file": "<path to the source or test file>",
  "finding": "one-sentence defect statement",
  "why_it_matters": "concrete consequence if unfixed",
  "test_to_add_or_fix": "test name + exact assertion",
  "skeleton": "test sketch with concrete values in the project's framework"
}
```

Id prefixes by dimension: `SA-` spec-alignment, `AS-` assertion-strength,
`CC-` corner-cases, `CB-` coverage-balance, `DL-` the derived domain lens (or
the project domain reviewer's own prefix when a roster supplies one).

## Skeptic pass (host model)

One skeptic per finding — **every severity**, one parallel batch. Severity
orders the report; it never gates verification: a LOW missed-boundary finding
can hide a bug as costly as any CRITICAL. Each skeptic gets exactly one finding
plus its scope files. Prompt frame (stance from `adversarial-review.md`):

> You are verifying ONE test-quality finding. REFUTE it — the burden is on the
> finding. Read the actual test file, the source it covers, and the governing
> contract resolved through the docs router before judging.
>
> Finding: [paste full JSON]
>
> Attacks: (1) **already covered** — an existing test (this file or a sibling)
> exercises it; cite file:line. (2) **impossible by construction** — types,
> schemas, or upstream guards make the alleged input unrepresentable; cite the
> guard. (3) **spec disagrees** — the routed contract says the alleged intended
> behavior is not intended; quote it (file + section). (4) **severity inflated**
> — real gap, overstated consequence; give the honest consequence.
>
> Verdict: `CONFIRMED` (survived all four; give strongest evidence) /
> `OVERSTATED: <new severity>` / `REFUTED` (give the killing citation).
> Return JSON: `{"id":"...","verdict":"...","evidence":"..."}`

## Cross-model pass

Run the opposite provider over ALL merged findings per `cross-model.md`
(read-only, batched ~12/call, same scope as the host skeptics). Same four
attacks. The point is an independent jury: host skeptics share blind spots with
the host reviewers that produced the findings.

## Merge matrix (host skeptic × cross-model)

| Host verdict            | Cross verdict | Result                                                              |
| ----------------------- | ------------- | ------------------------------------------------------------------ |
| CONFIRMED               | CONFIRMED     | **CONFIRMED** — carry the strongest evidence of each               |
| REFUTED                 | REFUTED       | **dropped** → refuted appendix (records what was checked)          |
| OVERSTATED              | OVERSTATED    | downgrade to the **lower** of the two severities                   |
| CONFIRMED ↔ OVERSTATED  | (either)      | keep, take the lower severity, note the severity dispute           |
| anything vs REFUTED     | (either)      | **DISPUTED** — keep, quote both arguments verbatim, flag for user  |

A finding the adversary could not locate (id absent from its reply) is
unverified by it — the host verdict stands, annotated "adversary: no verdict".
Never silently resolve a DISPUTED finding. Persist every verdict to the audit
file the moment it exists.

---

## Mutation probe protocol

A probe answers the only objective question: **if this code were wrong, would
any test fail?** Run probes ONLY when `commands.mutation` is configured, OR run
them manually with the same discipline against a package's configured test
command. Introduce one realistic bug, run the targeted tests, restore.

### Safety rules — absolute

- **Strictly serial.** Never two probes at once; never a probe while any other
  test run is in flight. Concurrent probes poison each other's results and the
  restore step.
- **Clean git status between probes.** A probe may start only on a file that is
  clean (`git status --porcelain <file>` empty); skip any file that starts
  dirty. After every probe — pass or fail — restore and re-verify the tree is
  clean before the next probe, and never end the audit with a dirty tree.
- **Backup before touching.** Copy the file into a run-scoped backup dir before
  the edit; restore from that copy, then confirm clean.
- Probes mutate SOURCE files only, never test files, never files outside the
  audited package.

### Choosing mutants

One mutation per probe, a _plausible bug_ not vandalism — compile errors and
deleted functions prove nothing. Good mutants: boundary flip (`<`→`<=`),
off-by-one, inverted/dropped guard, wrong field, dropped factor in a
computation, order swap, wrong aggregate. Target functions where a finding
alleges weakness AND the docs mark the code domain-critical. 3–5 probes per
audit — a spot check, not a campaign.

### Crash safety — the probe must be recoverable, not just procedural

The clean-file precondition is what makes recovery always possible: a probed
file's pristine content is in git, so `git checkout -- <file>` restores it
even after a crash, hang, or interrupted session. Before mutating, write a
breadcrumb line to `.skills/supermodo/tests/pending-restore.txt` —
`<path>\t<sha256 of the MUTATED content>` (hash taken right after the Edit);
delete the line right after the verified restore. ON EVERY AUDIT START: if
that breadcrumb exists and is non-empty, a previous probe died mid-flight.
For each listed file, hash its CURRENT content first:
- hash matches the recorded mutated hash → the file still holds only the
  probe's mutation: `git checkout -- <path>`, verify clean, remove the line;
- recorded value is `PENDING` (crash between breadcrumb and Edit) → if
  `git status --porcelain <path>` is clean, nothing was mutated: remove the
  line; if dirty, show the user the `git diff <path>` and ask before
  touching anything;
- hash differs → the file changed since the crash (user or tooling edits) —
  do NOT touch it; report the path, the pending mutation (file:line from the
  probe log), and ask the user to reconcile.
Tell the user what was restored/left before doing anything else. Never start
a new probe while the breadcrumb is non-empty.

### Per-probe procedure

1. Confirm file clean (`git status --porcelain <file>` empty).
2. Backup the file; append `<path>\tPENDING` to the pending-restore
   breadcrumb BEFORE touching the file — the crash window must be covered
   from the first moment the file can be dirty.
3. Apply exactly one mutation with Edit; record file:line and the flip, and
   replace the breadcrumb line's `PENDING` with the sha256 of the
   now-mutated file.
4. Run the package's configured targeted test command (`commands.test*`), full
   output to a file, no head/tail truncation.
5. Interpret: any test failed → **caught** (note which test — it is
   load-bearing); all passed → **survived** (proof of weakness; the new test to
   write must be one that would have failed here).
6. Restore + verify clean; remove the path from the breadcrumb.
7. Only then, next probe.

Report a table: function, file:line, mutation, result
(caught-by-`<test>` / SURVIVED), linked finding id. Survived mutants are the
audit's strongest deliverable — lead with them.
