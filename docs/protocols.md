# protocols — shared protocols, help desk, install doctor

**Core dependency.** The single source of truth for every shared protocol
the supermodo skills follow, plus the package's help desk. Other skills read
these masters in place — nothing is duplicated, so editing a master changes
behavior everywhere.

## When to use

- "How does supermodo work?" / "Explain the grilling protocol" — it answers
  from the masters, quoting the governing passage.
- A big-picture overview of the skills and the `flow` pipeline.
- "Check my install" — the doctor verifies all skill folders are present,
  the protocol masters exist, and (inside a project) that
  `skills.config.json` validates and the docs convention is in place. It
  reports; it fixes nothing itself.

## The protocol masters

All live in `skills/protocols/references/`:

| File | Governs |
|---|---|
| `config.md` | The `skills.config.json` contract: versioning, validation, argv commands, env-var namespacing, defaults |
| `docs-convention.md` | The strict docs layout: router, work triads, immutable task IDs, ADRs, generated navigation, single doc owner |
| `worklist.md` | What to work on next: the priority scale and its intake questions, dependency inheritance, execution state, ordering, effort bands, the board, the suggestion rules |
| `promotion.md` | How findings and pre-existing documents become work items: opt-in promotion, severity ownership, one item one priority, cohesion grouping, tracked evidence, idempotent retries |
| `reports.md` | Where and how skills persist output: run dirs, stage report frontmatter, run-state hashes, containment, the HTML projection and its visual-block grammar |
| `handoff.md` | Subagent stages: file-based handoff, needs-input escalation, liveness checks, failure protocol |
| `models.md` | The multi-model engine layer: sequence descriptors, roles, engine classes, the per-user model registry, the broker, approval and staffing, independence levels, adapters, judgment seats, the patch path, project policy |
| `cross-model.md` | Operating an external seat: adapter safety flags, pins from the registry, preflight, batching and sessions, hung-detection, honesty |
| `judgment-roles.md` | The typed-judgment roles (router, ranker, matcher, sentinel, triager): their question sets and what the code may do with each answer |
| `multimodel-knowledge.md` | What the evidence says about multi-model work — lineages and independence, blind passes and rounds, findings as hypotheses, loop divergence, headless CLI traps — and the ten hard rules every seat obeys |
| `adversarial-review.md` | The review stance: burden of proof, evidence-cited attacks, valid "no objection", dispute surfacing |
| `questions.md` | Asking the user: three-class triage, three question kinds (ordered-choice decisions, simple confirmations, closed menus), transport, answer recording & auto-resolution |
| `grilling.md` | The twin-agent adversarial interview: actors, independent plans, disprove rounds, routing, recording |
| `tooling.md` | Command tiers as quality gates: gap surfacing, decline memory, runtime freshness method (local truth → live docs → verify), aggregator rule |

## Package-wide communication rule

Chat reporting defaults to extreme concision, overridable per project via
`output.verbosity` in the config. This never applies to generated artifacts
(docs, ADRs, reports, commit messages), never shrinks protocol-mandated
formats, and never compresses safety output.

## Precedence

1. Your explicit instructions
2. These protocols
3. Individual skill defaults
