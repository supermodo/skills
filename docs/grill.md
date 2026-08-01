# grill — twin-agent adversarial interview

Locks a task or design before implementation. Two planners — the host model
and the **other** provider (Claude ⇄ Codex) — work the same brief
independently, attack each other's plans, and only genuinely user-owned
questions reach you. The outcome is the locked **triad** (`spec.md`,
`plan.md`, `tasks.md`) handed to `librarian` to write — grill never writes
docs itself.

## When to use

- "Grill me" / stress-test a plan or design before building.
- New-task intake (it's what `librarian --task` and `flow` stage 1 run).
- Any high-stakes change where you want two models to fight over the plan
  before code exists.

## How it works

1. **Independent plans.** Both planners get the same brief and crawl
   code/docs separately — no anchoring on each other.
2. **Disprove rounds.** Each attacks the other's plan; every objection must
   name a concrete failure scenario. "No material objection found" is a
   valid, logged outcome — disagreement is never manufactured.
3. **Question routing — three classes:**
   - **Discoverable facts** — answered from code/docs; never reach you.
   - **Technical tradeoffs** — the models fight it out first; you're asked
     only on unresolved conflict.
   - **Product / scope / business logic / preference** — always an
     individual question you confirm explicitly, even when both models
     agree (agreement ≠ consent; it only sets the recommended option).
4. **Custom answers re-fought.** An answer of your own that isn't one of the
   suggestions gets one disprove round before locking — surviving objections
   are shown, you confirm or amend.
5. **Everything recorded** with both positions, durable decisions as ADRs.

## The settled table

Every TECHNICAL point the two models agreed on arrives as ONE numbered
table — question in 1–2 lines, agreed answer — closed by a single
confirmation: reopen any row by number, otherwise all lock as shown.
Business-logic and product calls are never in the table — those are always
asked. 30 questions with 2 conflicts/business calls = you answer 2 and
review a table of 28.

## The question format (individual questions)

Each remaining question arrives as a plain-language explanation of what's
at stake, then ordered choices:

```
Q: <the question>
  1. Claude suggests: <host recommendation>
  2. Codex counters: <adversary view>
  3. More detail — verbose expansion, then the question is asked again
  4. Your own answer
  5. Defer — leave open   (only where deferral is acceptable)
```

## Honesty rules

- Ties (five unresolved rounds, or product-intent disagreements) are broken
  by you, with both positions shown verbatim.
- If the adversary CLI is absent or unauthenticated, the grill runs
  single-model and **says so** in its output — a second opinion is never
  faked.

Requires: `protocols`; uses `skills.config.json` when present.
