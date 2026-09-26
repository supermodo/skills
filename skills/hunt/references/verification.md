# Verification Protocol

Finder output is inflated by construction — blind finders, overlap-tolerant
parallel dispatch, no docs context. This phase converts that inflation into
precision. Three legs: host skeptics, a cross-check seat of another lineage,
docs adjudication.
Reviewer opinion alone is not evidence; every verdict carries a citation.

This file keeps only hunt's DOMAIN logic. The shared primitives live in the
shared protocol masters in the sibling `protocols` skill — read them first, they are not repeated here:

- **Adversarial stance & persistence** (burden of proof on the claim, attacks
  must cite concrete evidence, "no material objection" is a valid outcome,
  verdicts persisted to disk the moment they exist, disputes surface and are
  never silently resolved) → `../../protocols/references/adversarial-review.md`.
- **Seats, approval and independence** (which model sits where, the staffing
  gate, the three independence levels) → `../../protocols/references/models.md`;
  operating an external seat (read-only flags, batching ~12/call, resumed
  sessions, hung≠slow, honesty) → `../../protocols/references/cross-model.md`.
- **The open-question loop** (triage classes, the plain-words explanation +
  ordered-choice format (both models' suggestions, `More detail`, own
  answer), transport, recording,
  class-scoped auto-resolution) → `../../protocols/references/questions.md`. Hunt may use the
  question tool when config `questions.perSkill.hunt = "tool"`; it defaults to
  plain chat like every other skill.

---

## Skeptic pass (the `skeptic` seat — the host, adversarial)

One skeptic agent per finding — **every severity**, all in one parallel batch.
Above ~25 findings, batch instead by subsystem cluster (6-12 related findings
per skeptic, which also lets one refutation inform its siblings); every
finding still receives an individual verdict. Severity orders the report; it
never decides what gets verified: a LOW finding can hide a bug as expensive
as any CRITICAL, and an inflated CRITICAL wastes the user's trust. Each
skeptic gets its finding(s) plus their scope files.

Persist each skeptic's verdicts to a file the moment they return (per
`../../protocols/references/adversarial-review.md`) — verdicts that exist only in agent
conversations die with the session (proven the hard way: a crashed run lost
9 of 11 skeptics' work; files on disk survived).

Unlike finders, skeptics READ the project docs — architecture docs, the
`decisions/` records, prior audits. Judges are informed; that's the design.

Prompt frame: `../roles/skeptic.md` (this skill's folder).

## Cross-check (the `cross-check` seat — another lineage)

Host skeptics share training and habits with the host finders — correlated
blind spots. The `cross-check` seat (`adversary`, `differentLineageFrom` the
finders and the skeptics, resolved by the broker at Phase 0) attacks the same
list as an independent jury, cheaply: batched dispatches, ~12 findings per
call, not one per finding. Cover **ALL merged findings — every severity, same
scope as the skeptics**. If wall-clock forces triage mid-run, crit/high
first, but the med/low batches still run before the report ships; a tier
skipped entirely must be called out in the report, never silently.

Dispatch each batch with the brief below and the verdict schema:
`node <skills>/protocols/scripts/broker.ts dispatch --plan <planFile> --seat cross-check --brief <batch file> --schema <skills>/protocols/schemas/finding-verdicts.schema.json [--resume]`
(`--resume` from the second batch on, so the seat keeps its context). A
dispatch returning `status: failed` STOPS the hunt: report seat / requested
pin / cause and offer fix and retry / abort. Never substitute another model,
never fall back to a host-only verdict presented as two-model.

Brief (the artefacts are passed BY PATH, never summarised): `../roles/verifier.md`
(this skill's folder).

## Merge matrix (host skeptic × cross-check)

Apply mechanically after both legs return:

| skeptic | cross-check | Result |
|---------|-------------|--------|
| CONFIRMED | CONFIRMED | **CONFIRMED**, carry the strongest evidence of each; mark "corroborated" |
| REFUTED | REFUTED | **dropped** → refuted appendix |
| OVERSTATED | OVERSTATED | downgrade to the **lower** severity |
| CONFIRMED ↔ OVERSTATED | either way | keep, take the lower severity, note the dispute |
| DOCUMENTED | DOCUMENTED / CONFIRMED | **DOCUMENTED** — but first check the citation actually covers this exact behavior; a bad citation = no verdict. Goes to the Documented section, visible with its quote, never filed to the ledger |
| DOC-DRIFT | anything | **DOC-DRIFT** — keep, quote both sides; user decides whether code or doc is wrong |
| anything | REFUTED (or reverse) | **DISPUTED** — keep, quote both arguments verbatim, flag for the user; never silently resolve |
| ANSWERED | any | question resolved — attach citation, move to Documented (or Confirmed if the doc shows the code violates a recorded decision) |
| OPEN | OPEN | **ask the user now** — run the open-question loop in `../../protocols/references/questions.md` |

A finding missing from the cross-check reply is unverified by that seat — the
skeptic's verdict stands, annotated "cross-check: no verdict". A
`same-lineage` run says "reviewed, not independent" in the report; a hunt
whose cross-check seat failed reports "verification absent" for the affected
batches. There is no "single-model hunt".

## Why DOCUMENTED stays visible

A DOCUMENTED verdict silences a finding on the strength of a doc that may
itself be stale. It therefore never disappears: it sits in the report's
Documented section with its quote, so the user can spot a decision that no
longer matches reality. Killing it silently would re-create the exact bias
this pipeline exists to prevent — the doc suppressing the bug.

## Closing the question loop

Questions both legs leave OPEN are asked to the user BEFORE the report is
written — never shipped as open documentation debt. Run the shared loop in
`../../protocols/references/questions.md`: per open question, print a plain-words explanation
(max 4 lines, no doc/id/phase references), then the ordered choice list:
1. `<skeptic model> suggests:` 2. `<cross-check model> counters:` — labels
are the seated models' registry ids, the host seat by its pin (pull the
counter from the cross-check
verdict evidence; if that seat gave no verdict on this finding, dispatch one
batched `--resume` call to the `cross-check` seat for a one-line adversarial
take per open question; a seat that failed leaves the line as
"no independent counter — cross-check seat failed", never a fabricated one).

Each answer is then **recorded via the librarian in the project's `decisions/`
convention** (an ADR-style record) — the next hunt's skeptics search docs
first, so a recorded answer resolves the same question automatically instead
of re-asking — and applied as the citation that re-resolves the finding:
intentional → DOCUMENTED, bug confirmed → CONFIRMED, claim wrong → REFUTED.

Only explicitly deferred questions reach the report's Open Questions section.
Questions are meant to decrease monotonically across hunts.
