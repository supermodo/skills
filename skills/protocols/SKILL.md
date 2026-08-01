---
name: protocols
description: >
  The supermodo package's single source of truth and help desk. Holds the
  master copies of every shared protocol (config contract, docs convention,
  reports, subagent handoff, cross-model adversary ops, adversarial review
  stance, user questions, grilling, command tooling) that all other supermodo skills read in
  place. Invoke to ask how the supermodo package or any of its protocols
  works, to get an overview of the skills and pipeline, or to check that a
  supermodo installation is complete and healthy — triggers on "how does
  supermodo work", "explain the grilling/questions/docs protocol", "supermodo
  help", "check my supermodo install".
---

# supermodo protocols — single source of truth + help

This skill is the ONE place shared protocol text lives. Other supermodo
skills read these masters directly via their sibling path
(`../protocols/references/<file>.md`, resolved relative to each skill's own
folder; under the Claude Code plugin, equivalently
`${CLAUDE_PLUGIN_ROOT}/skills/protocols/references/<file>.md`). Nothing is
duplicated — editing a master here changes behavior everywhere.

## When invoked, do one of three jobs

1. **Explain** — the user asks how something works: answer from the
   protocol masters below and the package README; quote the governing
   passage, link the file. Don't paraphrase from memory when the master is
   one Read away.
2. **Overview** — the user wants the big picture: summarize the toolkit
   (documentation-driven development with twin-model adversarial checks),
   the 13 skills, and the 8-stage `flow` pipeline, pointing at the skills
   involved.
3. **Doctor** — the user wants their installation checked: verify all 13
   skill folders are present as siblings of this one (a missing sibling
   means a partial install — recommend installing the full package), that
   `references/` here contains the 9 masters, and, inside a project, that
   `skills.config.json` validates (defer to the `config` skill) and the
   docs convention is in place (`docs-check`, via `librarian`). Report
   findings; fix nothing yourself.

## The masters

| File | Governs |
|------|---------|
| `references/config.md` | `skills.config.json` contract: versioning, validation, argv commands, env-var namespacing, defaults |
| `references/docs-convention.md` | The strict docs layout: router, work triads, immutable task IDs, ADRs, generated navigation, single doc owner |
| `references/reports.md` | Where and how skills persist output: run dirs, stage report frontmatter, run-state hashes, symlink containment |
| `references/handoff.md` | Subagent stages: file-based handoff, needs-input escalation, liveness (periodic progress checks on every delegated agent), failure protocol |
| `references/cross-model.md` | Running the other provider as adversary: read-only sandboxes, preflight, batching, hung-detection, degradation honesty |
| `references/adversarial-review.md` | The review stance: burden of proof, evidence-cited attacks, valid "no objection", dispute surfacing |
| `references/questions.md` | Asking the user: three-class triage, three question kinds (ordered-choice decisions, simple confirmations, closed menus), transport, answer recording & auto-resolution |
| `references/grilling.md` | Twin-agent adversarial interview: actors, independent plans, disprove rounds, routing, recording |
| `references/tooling.md` | Command tiers as quality gates: gap surfacing, decline memory, runtime freshness method (local truth → live docs → verify), aggregator rule |

## Communication rule (package-wide)

Chat reporting defaults to extreme concision: "be extremely concise and
sacrifice grammar for the sake of concision." Overridable per project via
`output.verbosity` in `skills.config.json` (`"standard"`). This NEVER
applies to generated artifacts (docs, ADRs, reports, commit messages),
never shrinks protocol-mandated formats (grill explanations, question
loops), and never compresses safety output (warnings, destructive
confirmations, mutation previews).

## Precedence

1. The user's explicit instructions
2. These protocols
3. Individual skill defaults
