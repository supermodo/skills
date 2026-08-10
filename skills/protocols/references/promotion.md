# The promotion protocol (v1)

How findings and pre-existing documents become work **items**, and how many.
`worklist.md` owns read-time selection; this owns the write-time act.
`docs-convention.md` owns the shape of what gets written. `librarian`
executes all of it — it is the only writer under `docs/`.

## Contents

- Defaults · What is promotable · Reading the record
- Grouping: cohesion, priority, `Mixed:`
- Priority: the hunt-defect mapping, everything else
- Writing: what gets created, evidence, the exact forms
- Idempotence: locks, retries, extension
- What is enforced

## Defaults

- **Nothing is promoted unless the user asks**, and only the findings they
  name. Reports persist and render; they are a record, not a queue.
- **`BACKLOG.md` is the user's inbox.** Never write to it uninvited.
- A promotion that creates nothing has ended correctly.

### When no user is reachable

Inside `flow`, or any subagent run, there is nobody to answer a gate. Two
different things are gated, and they degrade differently:

- **Selection stays blocked.** Which findings become work is the user's call
  and cannot be assumed. No ids named and nobody to ask → promote nothing and
  say so. That is the default above, unchanged.
- **Grouping and priority proceed on their derived values.** These are
  derivable from evidence, so refusing to write them helps nobody: the run
  would end having done nothing with ids it was explicitly given.

A priority written this way is marked as the tool's:

```
Priority: P0 — released-catastrophic: captured signed requests replay
Priority-source: derived — exposure assumed from local main 2026-08-03
```

That is what keeps the board honest (`worklist.md`, "Confirmed, derived,
unset") and what makes `next --triage` come back for it. Do **not** use
`## Open questions` for this: that field means the WORK is blocked pending a
decision, and an unconfirmed ranking blocks nothing — the fix can start today.
Reserve it for questions that actually stop the work, and put the same
question in the report's `questions` frontmatter either way. An assumption
that reaches only a chat message or a notes file has not been recorded.

## What is promotable

| verdict | promotable |
| --- | --- |
| `confirmed` | yes |
| `overstated` | yes — arrives already normalised to `confirmed` at the surviving severity |
| `disputed` | not until the user resolves the dispute |
| `refuted` `documented` `doc-drift` `resolved` | never — the verdict is the disposition |

**Severity belongs to the agent that found it** and the skeptic that attacked
it. Read the field; never assign, adjust, or infer one. Missing or
unparseable → not promotable, hand it back.

## Reading the record

Read the producing skill's machine-readable findings (`hunt`'s
`findings/*.jsonl`, the equivalent from `tests audit`) — never report prose.
No record → refuse, naming the skill that owes one.

- **Derive** the shard directory as `<report-parent>/<report-stem>/findings`
  and require the report's `findings` frontmatter to agree. A pointer
  elsewhere is a producer bug; refuse rather than follow it.
- **Check** every id carries the report's declared `run_stamp`; a mismatch is
  a refusal naming both, never a guess.
- **Identity is the PAIR**: run identity (the allocated report stem) plus
  finding id. Ids are unique within a run only — two same-second runs mint
  identical ones (`reports.md`), so the stamp check catches a wrong directory,
  not a same-second twin.

## Grouping

**Cohesion binds first; priority then separates whatever cohesion did not
bind.** No later rule overrides this sentence.

Keep as ONE item when any holds:

1. one deliverable — shipping half leaves a broken state;
2. one acceptance criterion proves them all;
3. one edit surface — separating means rewriting the same code twice;
4. B is worthless before A, and A is not independently valuable.

A cohesive group spanning priorities stays one item at the **maximum** of its
members. Cohesion outranks priority because a split deliverable cannot be
archived independently, and dependency resolution is defined on archiving.

**Priority never merges.** Among candidates cohesion left loose, different
priorities force a split; a shared priority forces nothing. Several items at
one priority is the normal outcome. Group those by shared **surface** — one
package, one module — never one item per finding, never one item per band.

**Size bound:** crossing `L` in `worklist.md` (7+ tasks) without a shared
surface means over-bundled. Split by surface and say so.

Show the proposed grouping — ids, resulting item, shared surface — before
writing anything.

### `Mixed:`

An item knowingly holding more than one priority declares
`Mixed: P2, P3 — <reason> <date>` in `spec.md`. Two origins: cohesion bound
it, or the user declined a split. Never a repair, never re-asked; the board
draws a `mixed` pill so the next reader can see inside.

## Priority

### `hunt` findings with `kind: defect` — mechanical

- **Driver**: from the finding's `kind`. A hunt is not only a defect finder —
  its own anchors put missing tests and dead exports at `medium`/`low`.
  `kind: improvement` takes the non-defect path below. No valid `kind` → not
  promotable; never infer it from the title.
- **Consequence**: the severity, read off the shard.

  | severity | consequence |
  | --- | --- |
  | `critical` | catastrophic |
  | `high` | workflow-breaking |
  | `medium` | bounded |
  | `low` | cosmetic |

  Mechanical only because hunt's anchors rank user-facing consequence.
- **Exposure**: the main-branch check in `worklist.md`, presented as an
  assumption, never claiming deployment reach.

Feed into the `worklist.md` matrix, confirm **once per band** — ≤4 for a run
of any size.

### Everything else — asked

`hunt` `improvement` findings and every `tests audit` finding take the normal
intake questions, **once per group**, never per finding.

A test severity ranks suite weakness, not consequence
(`tests/references/review-dimensions.md`: a spec violation in a passing test
is `CRITICAL` there). Neither scale yields a driver. Groups here form on
cohesion and surface only — priority is the answer being sought and cannot
also be the input.

A group whose priority the user declines stays in the report, unpromoted.

## Writing

- Promoted work becomes a **triad**. A backlog entry only when asked by name.
  **Never a program** — siblings from one promotion share provenance, not a
  goal.
- **`findings.md` carries the evidence**, one section per finding:

  ```
  ## HNT-20260803141500-004 — nonce is never checked

  - severity: high · kind: defect · `src/api/sign.ts:88`
  - evidence: `verify()` reads the nonce and never compares it.
  - impact: a captured request replays indefinitely.
  - fix: compare against the stored nonce window.
  ```

  Not a pointer: `.skills/supermodo/` is gitignored, so evidence left there
  is gone in every other clone — silently, since the path still reads fine.
- **Provenance**, two anchored lines in `spec.md`:

  ```
  Promoted-from: .skills/supermodo/hunt/2026-08-03-api
  Promoted-ids: HNT-20260803141500-004, HNT-20260803141500-011
  ```

  `Promoted-from` is the run identity: normalised, repo-relative under
  `.skills/supermodo/`, no `.md`. `Promoted-ids` is ASCII-sorted, `, `
  separated — a function of the set, re-sorted on every extension.
- **Slug** (new items only): `<report-stem>-<group-key>`, lowercased,
  non-`[a-z0-9]` runs collapsed to `-`, trimmed, ≤60 chars at a `-` boundary.
  The **surface key** is the group's shared path prefix with its extension
  dropped and its leading source directory (`src/`, `lib/`, `packages/`)
  removed — `src/api/sign.ts` → `api-sign`, and a group spanning
  `src/api/sign.ts` and `src/api/verify.ts` → `api`. Append `-p<N>` only when
  priority separated two groups that would otherwise collide.

## Idempotence

- **Report lock.** `<report-stem>/.promotion-lock/`, created atomically, held
  across preflight and creation, released on **every** exit. Nothing
  interactive happens inside it: propose and confirm first, then lock, then
  re-run preflight — an abandoned interview would otherwise strand a lock no
  run is allowed to clear.
- **Lookup by provenance**, never by recomputing a slug. A normalisation
  difference then misnames a new item; it cannot cause a duplicate.
- **Atomic creation.** Assemble each item complete in a temp directory,
  validate it there (`docs-check.ts --item <dir>`, the mode that checks one
  work directory in place), then rename into `docs/work/` once. Writing in
  place leaves a triad the next preflight reads as promoted.
- **Never overwrite.** An item that is incomplete, invalid, or unrecognised is
  named and asked about — it is indistinguishable from work started by hand.
- **One exception:** an invalid item whose `Promoted-from` is this run, whose
  group is this one, failing ONLY by artifacts missing for ids in this
  promotion's set, is an interrupted extension of this promotion. Reconcile it
  under the lock. Without this the provenance-last write order has no retry.

### Extension — a later subset

A **live** item of the same run whose group these findings belong to is
extended, not duplicated. Confirm first; a sibling is sometimes wanted.

- Append-only, reconciled **per artifact per id**: evidence, then task, then
  provenance last. "Present somewhere" is not "done".
- Re-read each file immediately before writing; the lock is the guarantee,
  this is the backstop.
- An **archived** match is never extended: its ids count as promoted, new ids
  become a live successor naming it as predecessor. A task in the archive is
  invisible to the board and unwalked by `docs-check`.
- An addition outranking the item's stored `Priority:` is never re-ranked
  silently — state the maximum, ask, then rewrite `Priority:` and `Mixed:`, or
  leave the finding in the report.

## Absorbed documents

One file is not one item. A `TODO.md` of thirty unrelated things absorbs by
the same cohesion test, or not at all.

## Rejected: per-task priorities in `tasks.md`

Ordering and archiving both operate on items, and `Depends on:` is met on
archiving — so per-task markers change the display and nothing else.

## What is enforced

`docs-check` validates what lands in `docs/`: the provenance pair, its
canonical form, sorting and uniqueness, each finding's section shape and
required fields, evidence ↔ provenance in both directions, tasks one way from
checklist lines, one `(run identity, id)` per item across the whole tree, and
that a `Priority-source:` marker is single, spelled `derived`, and sits beside
a valid `Priority:`.

Everything else here — the defaults, the lock, write ordering, shard
derivation, the confirmation gates — is a rule for the executor that no
runtime checks, because `--promote` is an instruction, not a script. An
executor that ignores them produces damage `docs-check` can only report after
the fact, and the concurrency rules have no test because there is nothing to
run one against.

## Reporting

Per finding: which item it became, or why it did not. Which groups stayed in
the report. Which findings were not promotable, and why.
