---
name: bug-council
description: Last resort for ONE stubborn bug the ordinary attempts already failed on — a blind, evidence-driven council of Codex, Claude, Kimi, or available native subagents that falsifies competing hypotheses, implements the smallest causal fix, and verifies it independently. EXPLICIT INVOCATION ONLY - deliberately slow and token-expensive, so never auto-trigger it, never chain into it from another skill, and never run it on bugs a hunt report merely listed. Use only when the user names it (/bug-council, "convene the council", "bring in the bug council") or explicitly asks for the heaviest possible investigation of one specific bug. Otherwise, at most SUGGEST it - when a fix attempt has already failed, a bug is intermittent or unreproducible, the cause is genuinely disputed, or a regression has no obvious culprit - and wait for the user to say yes. For ordinary bugs use tdd --debug; to find unknown bugs use hunt.
---

# Bug Council

> **Requires:** the sibling `protocols` skill (shared protocol masters); uses `skills.config.json` when present. Missing protocols → tell the user to install the full supermodo package.

> **Project rules.** Read `.supermodo/rules/bug-council.md` if present, plus any
> `.supermodo/rules/INDEX.md` rows naming `bug-council` — that file IS this
> project's council process (seats, models, mode, rounds) and replaces the
> defaults below wherever they overlap. Contract:
> `../protocols/references/rules.md`. Never in that file, so never switchable
> off: investigations stay blind and are never shown to each other, one
> designated implementer, a fresh verifier that did not implement, passing
> tests never mean solved, explicit invocation only.

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
- **First run in this project** (no `.supermodo/rules/bug-council.md` AND no
  decline recorded under `rulesDeclined` in
  `.skills/supermodo/config-manifest.json`): before spawning the first seat,
  show the chosen template's `summary` — which states the seat count, the round
  count, and that this is the most expensive act in the package — and ask an
  ordered choice per `../protocols/references/questions.md` over the shipped
  starting points, plus customize and show-full. **The cost disclaimer is part
  of the gate, not a footnote:** the user is approving a token spend, not just
  a procedure. Materialize through `config --rules bug-council`, never by
  writing the file directly. `confirmations.mode: "auto"` does NOT skip this —
  choosing a process is a class-(c) preference, and this one carries a bill.

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

## The procedure

Nineteen steps in three phases. Follow them in order; the rules above govern
all of them.

**Intake — [references/intake.md](references/intake.md)**
- 1. Infer context before asking questions
- 2. Ask only the missing questions
- 3. Detect the available council
- 4. Select the hunt mode
- 5. Create the immutable bug dossier

**Investigation — [references/investigation.md](references/investigation.md)**
- 6. Establish the baseline
- 7. Assign distinct investigative lenses
- 8. Initial investigator prompt
- 9. Build the anonymized hypothesis ledger
- 10. Adversarial falsification
- 11. Rebuttal round for deep mode
- 12. Select discriminating experiments
- 13. Independent adjudication

**Fix and verification — [references/resolution.md](references/resolution.md)**
- 14. Create the regression test or objective probe
- 15. Implement the smallest causal patch
- 16. Independently attack and verify the patch
- 17. Completion conditions
- 18. User updates
- 19. Final report


## Persist and publish

Standalone runs write this report to
`.skills/supermodo/bug-council/<YYYYMMDD-HHMMSS>.md` per
`../protocols/references/reports.md` — a result living only in chat dies with
the session. Then publish it:

```
node <skills>/reports/scripts/render.ts --root <project-root> --report <that path>
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
