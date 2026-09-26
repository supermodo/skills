---
name: grill
description: "Twin-agent adversarial interview that locks a task or design before implementation. Two models plan independently, attack each other's plans, and only genuinely user-owned questions reach you — the locked outcome is handed to librarian to write. Use for 'grill', 'grill me', plan stress-test, design interview, new-task intake, spec lock, or a flow `needs-input` escalation."
---

# grill — twin-agent adversarial interview

> **Requires:** the sibling `protocols` skill (shared protocol masters); uses `skills.config.json` when present. Missing protocols → tell the user to install the full supermodo package.

> **Project rules.** Read `.supermodo/rules/grill.md` if present, plus any
> `.supermodo/rules/INDEX.md` rows naming `grill` — that file IS this project's
> grill process and replaces the defaults below wherever they overlap. Contract:
> `../protocols/references/rules.md`. Never in that file, so never switchable off:
> two models agreeing never substitutes for the user on a class-(c) question, a second opinion is never faked, disputes surface with both arguments verbatim, nothing is seated without the user's approval.

Moderator skill implementing the grilling protocol. Two `lead` planners of
different lineages work the same brief independently, two `adversary` seats
attack the plan each did not write, and only what genuinely needs the user
reaches them. Output is the locked **triad** (`spec.md`, `plan.md`,
`tasks.md`) handed to librarian — **grill never writes docs itself**.

Read `../protocols/references/grilling.md` (the master), plus
`../protocols/references/models.md` (seats, approval, staffing, independence),
`../protocols/references/cross-model.md`, `../protocols/references/adversarial-review.md`,
`../protocols/references/questions.md`, and `../protocols/references/multimodel-knowledge.md`
(why the rounds are capped and the passes blind). Follow the master exactly;
this file adds the seating mechanics. The seats live in `sequence.json` beside
this file (variants `standard`, `same-lineage`, `deep`) — the ONLY home of
grill's roles and constraints.

Entry points: standalone `/supermodo:grill`, `librarian --task` intake,
`flow` stage 1 and mid-run `needs-input` escalations.

## Actors (host-neutral)

- **Moderator = you, main context (the coordinator, always the host).** Hold
  the threads, route questions per the questions triage, talk to the user,
  record decisions via librarian. NEVER crawl the codebase yourself — stay tiny.
- **Planners `plan-a` / `plan-b`** — two `lead` seats, `differentLineageFrom`
  each other, each a persistent read-only session resumed across rounds.
- **Adversaries `attack-a` / `attack-b`** — two `adversary` seats, each a
  different lineage from the plan it attacks, receiving that plan RAW.

Which model sits where comes from the user's approved registry assignments
through the broker (below). A seat that cannot be staffed stops the grill
before it starts — there is no degraded mode.

## Phases (from the master)

1. **Independent plans.** Both planners get the same brief (user ask + docs
   router pointer). Each crawls code/docs, forms a plan + question list,
   WITHOUT seeing the other's output. No anchoring.
2. **Disprove rounds.** Each attacks the other's plan and proposed answers per
   the adversarial-review stance: every objection names a concrete failure
   scenario; "no material objection found" is a valid, logged outcome — never
   manufacture disagreement. Iterate to stable (1–2 rounds typical).
3. **Question routing — three classes:**
   - **(a) discoverable facts** — planners answer from code/docs; never reach
     the user.
   - **(b) technical tradeoffs** — adversary consulted first; asked
     individually ONLY on unresolved model conflict; agreed → settled table.
   - **(c) product / scope / business logic / preference** — ALWAYS an
     individual question with explicit user confirmation, even when both
     models agree (agreement ≠ consent); model agreement there only makes
     their position the recommended option.
4. **Custom answers.** A user answer that isn't one of the suggestions re-enters
   ONE disprove round (adversary attacks it with concrete scenarios); surviving
   objections shown; user confirms or amends before locking.
5. **Record.** Everything logged with both positions — including agent-to-agent
   resolutions. Durable decisions → ADRs; scope/plan → the triad. Via librarian.

### Settled table first (mandatory, before the individual questions)

Every TECHNICAL (class-b) point the two models settled between themselves
goes into ONE numbered table — never a per-item question parade:

```
Settled between the models (technical; reopen any by number):

| # | Question                          | Agreed answer                    |
|---|-----------------------------------|----------------------------------|
| 1 | <the question, 1–2 lines>         | <agreed answer, one line>        |
| 2 | …                                 | …                                |

N technical points settled. Reopen any by number — otherwise they lock as shown.
```

Reopening a row re-presents it in the full question format below.
Confirmation (or moving on) locks the rest. Then ask the individual
questions: unresolved technical conflicts AND every business-logic /
product / scope / preference call — those are never batched. 30 questions
with 2 in those buckets = 2 questions asked, 28 rows reviewed.

### Question format to the user (individual questions only, mandatory)

question transport follows the shared questions protocol: chat by default,
config may override globally or per skill (uniform for every skill).
Per concept-group:

```
<3–4 line plain-language explanation of the actual choice and what's at stake>

Q: <the question>
  1. <plan-a model> suggests: <that planner's recommendation>
  2. <plan-b model> counters: <the other planner's view>
     (labels are the seated models' registry ids, e.g. `opus5 suggests:` /
     `astra counters:`, the host seat by its pin — never a vendor name; a
     `same-lineage` variant adds
     "(same lineage — reviewed, not independent)" after the counter line)
  3. More detail — verbose, link-rich expansion (files, docs, decisions),
     then this question is asked again
  4. Your own answer
  5. Defer — leave open   (only where deferral is acceptable)
```

The user answers by number or free text. Choosing (3) never consumes the
question; a (4) custom answer re-enters one disprove round before locking.
Deferred items go to the work-doc Open Questions.

## Seating and dispatch (host-neutral)

Every seat is resolved and run by the broker
(`../protocols/scripts/broker.ts`); the moderator never composes a CLI call
and never names a model. `<skills>` = the installed supermodo skills folder
(under the plugin, `${CLAUDE_PLUGIN_ROOT}/skills`); `<host>` = `claude` or
`codex`, whichever runs this session.

1. **Plan the seats** — before anything launches:
   `node <skills>/protocols/scripts/broker.ts plan --skill grill --project-root <root> --host <host> --host-pin <your exact model id> [--variant <v>] [--run <id>]`
   Read the JSON: `staffed`, `seats[]` (id · model · effort · session ·
   independent), `unstaffed[]` with reasons, `independence`, `proposal`.
2. **Unapproved classes** (`proposal` is non-null): show ONE numbered table —
   class · seats the row fills (`detail[].seats`) · proposed model + effort ·
   flags — and ask the closed menu **approve all / change rows by number /
   decline** (default decline; `models.md` → Approval). The rows are the set
   that staffs the whole variant, so a class may take two rows (one per
   lineage the variant needs); approving them all is one answer. On approval run
   `node <skills>/config/scripts/models.ts approve <proposalFile> --project-root <root>`,
   then plan again. Unattended → report `needs-input` with the table and stop.
3. **Unstaffed seats** (`staffed: false`): show each `unstaffed` id with its
   reason and ask the closed menu **staff it / run a fully staffed variant /
   abort**. Never start with a hole; never downgrade automatically.
4. **Independent plans** — the brief is `roles/planner.md` (this skill's
   folder) with a `<task>` block prepended: the user's ask verbatim, the
   project root and the docs router path — nothing else (no hints, no
   framing: the planners find what matters themselves). Write it
   under `roundsDir` (from the plan JSON), then for each planner:
   `node <skills>/protocols/scripts/broker.ts dispatch --plan <planFile> --seat plan-a --brief <file>`
   (and `plan-b`). Both dispatches go out in the same turn, blind to each other.
   A seat whose `transport` is `host` or `native` is launched by the moderator
   itself as a subagent with the same brief (kept alive via SendMessage); when
   it returns, save its output under `roundsDir` and ledger it with
   `dispatch --seat <id> --brief <file> --result <output>` (status `host`).
5. **Disprove rounds** — the brief is `roles/adversary.md` with `<task>` and
   an `<artefact>` block: `plan-b`'s output file path for `attack-a`, `plan-a`'s
   for `attack-b` (raw artefact by path plus a verbatim copy, never a summary).
   Fold the attacks back to the planners with `--resume` so each keeps its
   context. Batch ~12 items per call. Cap: two disprove rounds, then the
   settled table.
6. **Custom answers and reopened rows** re-enter ONE disprove round the same
   way (`--resume`).
7. **Run-time failure** — a dispatch returning `status: failed` (rate limit,
   identity mismatch, stall, retired pin) stops the grill: the round files stay
   under `roundsDir`, report seat / requested pin / cause, and offer
   fix and retry / abort. (`status: host` is a ledgered host seat, not a
   failure.) `unreviewed` output (empty, unparseable) is treated
   as no verdict, never as agreement. Nothing is ever substituted.
8. **Record** every round file and the ledger
   (`broker.ts ledger --project-root <root> --run <id>`) in the grill report:
   the seating table, independence reached, requested vs effective model per
   seat.

## Output — what a successful grill produces

The locked triad content, in memory, handed to librarian to WRITE:

- `spec.md` — goal, non-goals, scope, acceptance evidence.
- `plan.md` — approach, steps, risks, alternatives considered.
- `tasks.md` — checklist with immutable inline task IDs
  (`- [ ] X <!-- task:x -->`).

Plus the recorded decision log (both positions per resolved question).
**grill hands this to librarian; grill creates no doc files.** Mid-flow
(`needs-input` during stages 2–6), it does NOT call librarian — it returns the
decisions as structured `decisions` notes in the stage report for the stage-7
librarian pass, preserving the stages-1-and-7-only docs rule.

## Hard rules

- Moderator never writes code, never edits docs, never crawls.
- No doc files exist until the grill resolves and the user signs off (librarian
  creates the triad at the end — standalone/intake only).
- Two models agreeing never substitutes for the user on class-(c) questions.
- Auto-resolution is class-scoped: recorded facts and durable technical
  decisions auto-resolve future runs; class-(c) answers may seed the default
  suggestion but the question STILL reaches the user.
- Disputes surface with both arguments verbatim — never silently resolved.
- Persist verdicts as they form (adversarial-review protocol).

## Tie-break

At **five** unresolved rounds on one point, or when a disagreement hinges on
product intent: present both positions verbatim and the user breaks the tie.

## Staffing gate (never faked)

A grill runs only fully staffed. A missing CLI, an unauthenticated adapter, a
declined class, or a lineage constraint no approved model can satisfy is an
UNSTAFFED seat: the broker names it and its reason, the moderator asks
**staff it / run a fully staffed variant / abort**, and nothing starts until
one is chosen. The `same-lineage` variant exists for a user with one lineage
enrolled — it promises "reviewed, not independent" and every question and
report says so. A self-adversary standing in for a second lineage does not
exist in this skill.
