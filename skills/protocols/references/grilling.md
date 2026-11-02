# Grilling protocol (v1) — twin-agent adversarial interview

Adapted from Matt Pocock's `grilling` skill (MIT — see the package
THIRD-PARTY-NOTICES). Purpose: lock shared understanding of a task/design
BEFORE implementation, with two models fighting so the user answers only
what genuinely needs them.

Used by: `grill` (standalone), `librarian --task` (intake), `flow`
(stage 1 and `needs-input` escalations). Runs in the MAIN context under a
moderator; heavy work happens off-main.

## Actors (host-neutral)

- **Moderator** (main context): holds the threads, routes questions per the
  questions-protocol triage, talks to the user, records decisions via
  librarian. NEVER crawls the codebase itself — stays tiny.
- **Planners**: two `lead`-class seats from the grill descriptor
  (`skills/grill/sequence.json`), staffed by the broker from the user's
  approved assignments (`models.md`), with `differentLineageFrom` between
  them so the two plans are independent. A planner may be a native subagent
  of the host (continued via SendMessage so answers land in its intact
  context — keep it alive until the grill ends) or an external read-only
  seat resumed across rounds (`cross-model.md`).
- **Adversaries**: `adversary`-class seats that attack the plan they did
  not write, each a different lineage from that plan's author.

An unstaffed seat → the grill does not start (staffing gate in `models.md`):
staff it, run a fully staffed variant, or abort. A grill never runs with a
self-adversary standing in for a second lineage; a variant that promises
`same-lineage` or `none` says so in every question and in the record.

## Phases

1. **Independent plans.** Both planners receive the same brief (the user's
   ask + pointers to docs router). Each crawls the codebase and docs, forms
   a plan, and produces its question list — WITHOUT seeing the other's
   output. No anchoring.
2. **Disprove rounds.** Each planner attacks the other's plan and proposed
   answers per the adversarial-review stance: objections must name concrete
   failure scenarios; "no material objection" is a valid logged outcome.
   Iterate until positions are stable (typically 1–2 rounds).
3. **Question routing.** Merge both question lists; triage per the
   questions protocol: facts get answered from code/docs by the planners.
   TECHNICAL tradeoffs (class b) the models agree on after the disprove
   rounds are NOT asked one by one: they go into the settled decisions
   (below). Individual questions — in the mandatory questions-protocol
   format (3–4 line explanation + the ordered choice list: both models'
   suggestions, `More detail`, own answer), on the transport the
   questions protocol resolves from config — are asked for (b) tradeoffs
   still in CONFLICT and for EVERY class-(c) product / scope / business
   logic / preference call, agreed or not: business decisions always get
   the user's explicit per-question confirmation; when the models agree
   there, their position becomes the recommended option, never the
   answer.

   **The settled decisions — one batch review before the questions.** A
   single report of the agreed technical items, readable by someone who
   saw none of the rounds: a task intro (what the work is, what is wrong
   today, what it achieves), then the items grouped by area, each area
   opening with 1–2 sentences of context. Each item is a card numbered
   continuously across areas: a 4–5 word title, then `Problem`, `Decision`,
   `Rejected` and `Cost`, on their own lines and 1–2 lines each. A field is
   never invented: no serious alternative or no real downside is stated
   as such. Close it with ONE confirmation: "Reopen any by number;
   otherwise all lock." Reopening a card turns it back into a full
   questions-protocol question; confirmation locks the rest. If 30
   questions exist and 2 are conflicts or business calls, the user
   answers 2 and reviews 28 cards.
4. **Custom answers** from the user re-enter one disprove round before
   locking.
5. **Record.** Everything is recorded — including questions resolved
   agent-to-agent, with both positions: durable decisions → ADRs;
   scope/plan → the work-doc triad (via librarian; mid-flow → queued in the
   stage report for the stage-7 pass). The locked outcome is the triad
   (`spec.md`, `plan.md`, `tasks.md` with immutable task IDs).

## Hard rules

- The moderator never writes code and never edits docs directly.
- Plans are held in memory/state until user sign-off — no doc files created
  before the grill resolves (librarian creates the triad at the end).
- Two models agreeing is never a substitute for the user on class-(c)
  questions: business logic, product, scope, and preference calls are
  ALWAYS individual questions with explicit confirmation — only agreed
  TECHNICAL (class-b) items batch into the settled decisions.
- At five unresolved rounds on one point, or when disagreement hinges on
  product intent: present both positions, the user breaks the tie.
