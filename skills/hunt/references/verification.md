# Verification Protocol

Finder output is inflated by construction — blind finders, overlap-tolerant
parallel dispatch, no docs context. This phase converts that inflation into
precision. Three legs: Claude skeptics, Codex cross-check, docs adjudication.
Reviewer opinion alone is not evidence; every verdict carries a citation.

This file keeps only hunt's DOMAIN logic. The shared primitives live in the
shared protocol masters in the sibling `protocols` skill — read them first, they are not repeated here:

- **Adversarial stance & persistence** (burden of proof on the claim, attacks
  must cite concrete evidence, "no material objection" is a valid outcome,
  verdicts persisted to disk the moment they exist, disputes surface and are
  never silently resolved) → `../../protocols/references/adversarial-review.md`.
- **Cross-model adversary ops** (read-only `codex exec`, no `-m` pin,
  `< /dev/null`, preflight, hung≠slow kill+retry, batching ~12/call, resume
  the same session, degradation honesty) → `../../protocols/references/cross-model.md`.
- **The open-question loop** (triage classes, the plain-words explanation +
  ordered-choice format (both models' suggestions, `More detail`, own
  answer), transport, recording,
  class-scoped auto-resolution) → `../../protocols/references/questions.md`. Hunt may use the
  question tool when config `questions.perSkill.hunt = "tool"`; it defaults to
  plain chat like every other skill.

---

## Skeptic pass (Claude, adversarial)

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

Prompt frame:

> You are verifying a single bug-hunt finding. Your job is to REFUTE it. The
> burden of proof is on the finding, not on you. Read the actual source, the
> types and guards around it, and the governing docs (the project's docs
> router, its `decisions/` records, prior audit reports) before judging.
>
> Finding: [paste full JSON]
>
> Attack it from every side:
> 1. **Not reproducible** — trace the actual code path; does the code really
>    behave as claimed? Cite the lines that contradict the claim.
> 2. **Impossible by construction** — do types, schemas, or upstream guards
>    make the alleged bad state unrepresentable? Cite the guard.
> 3. **Documented-intentional** — does a doc record this exact behavior as a
>    deliberate decision? Quote it with file + section. A vague thematic match
>    does not count; the doc must cover THIS behavior.
> 4. **Severity inflated** — real, but the stated impact overstates reality?
>    Name the honest consequence.
>
> While reading docs for attack 3, also check the reverse: does a doc PROMISE
> the opposite of what the code does? That is doc drift — report it.
>
> If the finding has `"question": true`, your first job is answering it from
> the docs: search for the decision that resolves it. Answered → cite it.
> Unanswerable from docs → verdict OPEN.
>
> Verdict, one of:
> - `CONFIRMED` — survived all attacks; include the strongest remaining evidence
> - `OVERSTATED: <new severity>` — real but inflated; explain
> - `REFUTED` — include the citation that kills it
> - `DOCUMENTED` — intentional per doc; include the quote + file
> - `DOC-DRIFT` — code and doc contradict; quote both sides
> - `ANSWERED` — (questions only) doc answers it; include citation
> - `OPEN` — (questions only) docs are silent
>
> Return JSON: `{"id": "...", "verdict": "...", "evidence": "..."}`

## Codex cross-check (second model)

Claude skeptics share training and habits with the Claude finders — correlated
blind spots. Codex sessions attacking the same list are an independent jury,
and cheap: batched CLI calls, ~12 findings per call, not one per finding.
Cover **ALL merged findings — every severity, same scope as the Claude
skeptics**. If wall-clock forces triage mid-run, crit/high first, but the
med/low batches still run before the report ships; a tier skipped entirely
must be called out in the report, never silently.

Run the Codex leg per `../../protocols/references/cross-model.md` (preflight in Phase 3 with
the dual-model finders, read-only sandbox, no `-m` pin, `< /dev/null`,
hung≠slow handling, honest degradation). If any call errors mid-verify, STOP
and ask the user: fix and retry / continue Claude-only / abort. Never silently
degrade a two-model guarantee to one.

```bash
codex exec -s read-only --json -o "$D/codex-verdicts.json" < /dev/null "
You are adversarially verifying bug-hunt findings. For EACH finding below,
try to REFUTE it — burden of proof is on the finding. Read the actual source
files, surrounding types/guards, and the project's architecture + decisions
docs before judging. You are read-only; modify nothing.

Attacks per finding: (1) code doesn't behave as claimed — cite lines;
(2) types/schemas/guards make it unrepresentable — cite the guard;
(3) a doc records it as deliberate — quote file + section; (4) impact inflated
— name the honest consequence. For \"question\": true findings, answer from
docs if possible.

Findings:
<numbered JSON list of ALL merged findings, every severity>

Reply with ONLY a JSON array:
[{\"id\": \"...\", \"verdict\": \"CONFIRMED | OVERSTATED: <severity> | REFUTED | DOCUMENTED | DOC-DRIFT | ANSWERED | OPEN\", \"evidence\": \"citation or reasoning\"}]
"
```

## Merge matrix (Claude skeptic × Codex)

Apply mechanically after both legs return:

| Claude | Codex | Result |
|--------|-------|--------|
| CONFIRMED | CONFIRMED | **CONFIRMED**, carry the strongest evidence of each; mark "corroborated" |
| REFUTED | REFUTED | **dropped** → refuted appendix |
| OVERSTATED | OVERSTATED | downgrade to the **lower** severity |
| CONFIRMED ↔ OVERSTATED | either way | keep, take the lower severity, note the dispute |
| DOCUMENTED | DOCUMENTED / CONFIRMED | **DOCUMENTED** — but first check the citation actually covers this exact behavior; a bad citation = no verdict. Goes to the Documented section, visible with its quote, never filed to the ledger |
| DOC-DRIFT | anything | **DOC-DRIFT** — keep, quote both sides; user decides whether code or doc is wrong |
| anything | REFUTED (or reverse) | **DISPUTED** — keep, quote both arguments verbatim, flag for the user; never silently resolve |
| ANSWERED | any | question resolved — attach citation, move to Documented (or Confirmed if the doc shows the code violates a recorded decision) |
| OPEN | OPEN | **ask the user now** — run the open-question loop in `../../protocols/references/questions.md` |

A finding missing from Codex's reply is unverified by Codex — Claude's verdict
stands, annotated "Codex: no verdict". Single-model hunts (no Codex) apply
Claude verdicts alone and say so in the report.

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
1. `Claude suggests:` 2. `Codex counters:` (pull it from the Codex verdict
evidence; if
Codex gave no verdict on this finding, run one batched read-only `codex exec`
for a one-line adversarial take per open question; if Codex is unavailable,
write `Codex counters: unavailable (single-model)`).

Each answer is then **recorded via the librarian in the project's `decisions/`
convention** (an ADR-style record) — the next hunt's skeptics search docs
first, so a recorded answer resolves the same question automatically instead
of re-asking — and applied as the citation that re-resolves the finding:
intentional → DOCUMENTED, bug confirmed → CONFIRMED, claim wrong → REFUTED.

Only explicitly deferred questions reach the report's Open Questions section.
Questions are meant to decrease monotonically across hunts.
