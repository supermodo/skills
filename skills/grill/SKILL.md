---
name: grill
description: "Twin-agent adversarial interview that locks a task or design before implementation. Two models plan independently, attack each other's plans, and only genuinely user-owned questions reach you — the locked outcome is handed to librarian to write. Use for 'grill', 'grill me', plan stress-test, design interview, new-task intake, spec lock, or a flow `needs-input` escalation."
---

# grill — twin-agent adversarial interview

> **Requires:** the sibling `protocols` skill (shared protocol masters); uses `skills.config.json` when present. Missing protocols → tell the user to install the full supermodo package.

Moderator skill implementing the grilling protocol. Two planners (host model +
the OTHER provider) work the same brief independently, attack each other, and
surface only what genuinely needs the user. Output is the locked **triad**
(`spec.md`, `plan.md`, `tasks.md`) handed to librarian — **grill never writes
docs itself**.

Read `../protocols/references/grilling.md` (the master), plus `../protocols/references/cross-model.md`,
`../protocols/references/adversarial-review.md`, `../protocols/references/questions.md`. Follow the master
exactly; this file adds host mechanics.

Entry points: standalone `/supermodo:grill`, `librarian --task` intake,
`flow` stage 1 and mid-run `needs-input` escalations.

## Actors (host-neutral)

- **Moderator = you, main context.** Hold the two threads, route questions per
  the questions triage, talk to the user, record decisions via librarian. NEVER
  crawl the codebase yourself — stay tiny.
- **Local planner** — a persistent agent of the HOST model.
- **Adversary planner** — a persistent READ-ONLY CLI session of the OTHER
  provider.

Either planner unavailable → honest single-model degradation (see bottom).

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
  1. Claude suggests: <host recommendation>
  2. Codex counters: <adversary view>   (swap names when Codex is host;
                                          "unavailable (single-model)")
  3. More detail — verbose, link-rich expansion (files, docs, decisions),
     then this question is asked again
  4. Your own answer
  5. Defer — leave open   (only where deferral is acceptable)
```

The user answers by number or free text. Choosing (3) never consumes the
question; a (4) custom answer re-enters one disprove round before locking.
Deferred items go to the work-doc Open Questions.

## Host mechanics — Claude Code host

Local planner = a **subagent kept alive** across the whole grill (monitored
per the liveness rule in `../protocols/references/handoff.md` — a planner
that stops producing between rounds is stopped and respawned once with the
transcript so far; waiting on the USER is never a stall):

- Spawn one general subagent with the brief; it returns its plan + question
  list. Keep it alive and continue it via **SendMessage** to run disprove
  rounds and fold in user answers — its context stays intact, no rerun.

Adversary = **`codex exec`, read-only**, one persistent thread:

- Preflight first (per cross-model): `codex --version`, auth OK. On failure
  STOP and ask: fix+retry / continue single-model / abort. Never silently
  degrade.
- First call:
  `codex exec --json -s read-only --skip-git-repo-check "<brief>" < /dev/null`
  (drop `--skip-git-repo-check` inside a git repo). ALWAYS redirect
  `< /dev/null` or it hangs. Never pin `-m`. `--json` is REQUIRED on the
  first call — the `{"type":"thread.started",...}` event that carries
  `thread_id` only exists in JSON output; capture it there (the planner's
  prose lands in the `item.completed`/message events).
- Resume for every later round (SAME thread keeps context):
  `codex exec resume <thread_id> -c sandbox_mode="read-only" "<next batch>" < /dev/null`
  (resume rejects `-s`). Batch ~12 items per call. Give each call a 10-min
  timeout; within it, a call whose output stopped growing at ~0 CPU for ~5
  consecutive min is hung, not slow — kill early, retry once fresh, second
  stall → single-model for that batch and record it.

## Host mechanics — Codex host (inverted)

- Local planner = the host's OWN delegation mechanism, kept alive across rounds.
- Adversary = `claude -p --allowedTools "Read,Grep,Glob"` (read-only enforced
  by the explicit allowlist, never by trusting user settings), one persistent
  session, same preflight / batching / hung-detection rules. Never pin a model.
- Everything else identical; swap the `Claude suggests:` / `Codex counters:`
  labels so the HOST is the "suggests" line.

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

## Degradation (honest, never faked)

Adversary CLI absent / unauthenticated / both retries stalled → say so, run
single-model with explicitly labeled self-adversary lines
(`Codex counters: unavailable (single-model)`), and mark the whole grill
single-model in its output. Never pretend a second model reviewed.
