# The worklist protocol (v1)

How ANY supermodo skill answers "what should I work on next". This master
owns the **selection semantics**; `docs-convention.md` owns the **grammar**
it reads (`Depends on:`, `Priority:`, `Created:`, `## Open questions`, the
backlog entry shape, task states).

**Read-time only.** The board is recomputed on every call from `docs/work/`,
`docs/work/BACKLOG.md` and read-only repo evidence. It is never written to a
file, and this protocol NEVER mutates documentation — convention debt is
reported for `librarian`, the single documentation owner.

## Items

An item is a live **work triad** (identity = `<task-slug>` or
`<program>/NN-<slug>`) or a **live backlog entry** (identity = its slug).
Archived triads and struck/graduated entries are not items.

Run artifacts are NOT items: `hunt` findings, `tests audit` findings and
everything else under `.skills/supermodo/` reach the board only once
librarian has promoted them to a backlog entry or a triad — which is also
where they acquire a priority. One intake path, one place priority is set.

## Priority

### Scale

`P0 P1 P2 P3`, P0 highest. Deliberately P-identifiers, so nothing collides
with `hunt` finding severities (critical/high/medium/low).

The scale is **user-owned**: the tool proposes a default, the human
confirms, the value is **stored**. It is never inferred at render time and
never reclassified from prose. A tool that believes a stored priority is
wrong SAYS so and offers re-triage; it does not silently recompute.

### Stored form

`spec.md`, one optional line:

```
Priority: P1 — released-workflow-breaking: checkout can fail before payment
```

`BACKLOG.md`, one indented line under the entry:

```
  priority: P1 — released-workflow-breaking: checkout can fail before payment
```

Grammar: `P<0-3> — <classification>: <one-line justification>`.
Classification is one of:

- defects — `<exposure>-<consequence>`, exposure ∈ `released` `unreleased`
  `unknown-exposure`, consequence ∈ `catastrophic` `workflow-breaking`
  `bounded` `cosmetic`;
- non-defects — `commitment-blocker` `capability` `improvement`.

Missing or malformed → the item renders as provisional **`P2 — unset`** and
is listed under repairs. A project with no priorities at all still renders a
board; nothing blocks.

### Proposing the default — at intake ONLY

Asked once, when the item is created or first triaged (`next --triage`,
`librarian --task`, `librarian --backlog add`, `grill`). At most THREE
closed questions, presented as closed menus per `questions.md` (fixed
self-explanatory option sets — no `Claude suggests:`/`Codex counters:`
framing):

1. **Driver** — defect / commitment-blocker / capability / improvement
2. **Exposure** (defects only) — released / unreleased / unknown
3. **Consequence** (defects only) — catastrophic (data loss, corruption,
   security breach) / workflow-breaking (a user journey cannot complete) /
   bounded (degraded but has a workaround) / cosmetic

The human confirms the resulting priority, librarian writes the line, and it
is frozen. Never re-asked, never re-derived.

| exposure ↓ / consequence → | catastrophic | workflow-breaking | bounded | cosmetic |
| --- | --- | --- | --- | --- |
| released | P0 | P1 | P2 | P3 |
| unreleased | P1 | P2 | P3 | P3 |
| unknown | P1 | P2 | P2 | P3 |

Non-defect drivers: commitment-blocker **P1**, capability **P2**,
improvement **P3**.

Exposure MODIFIES consequence; it never replaces it. "Everything released
outranks everything unreleased" is wrong: a released cosmetic typo must not
outrank an unreleased credential leak.

### Determining "released"

Pre-fill the exposure answer by checking whether the affected code is
present on the configured main branch's LOCAL ref
(`release.branches.main`, default `main`) — never "the latest tag", which is
the wrong anchor in any repo that tags after merge or tags irregularly.

Present it as an ASSUMPTION for the human to confirm, and **never claim
deployment reach**: what is on `main` locally is knowable, what is serving
traffic is not.

### Effective priority — dependency inheritance

`effective = max(own, effective of every ACTIVE transitive dependent)`, so a
low-priority blocker of a P0 does not rot at the bottom.

- **Active dependent** = not paused, not archived, not dropped. Paused
  dependents transmit NOTHING.
- Dependency cycles and unresolvable or ambiguous references make an item
  `invalid`: it transmits nothing and is listed under repairs.
- Inheritance is **displayed, never persisted**:
  `api-client-retry  P3 → P1 — required by payment-timeout-fix [P1]`

## Execution state

| state | test |
| --- | --- |
| `in-progress` | some task marked `/` |
| `not-started` | only pending `- [ ]` tasks |
| `needs-human-input` | unchecked entries under `## Open questions` |
| `dependency-blocked` | some declared dependency unmet |
| `paused` | every remaining task marked `^` or `-` |
| `invalid` | dependency cycle, dangling reference, missing triad file |

**Ready** = dependencies met AND no unchecked open questions.

Rank groups, in order:

1. `in-progress` & ready
2. `not-started` & ready
3. `needs-human-input`
4. `dependency-blocked`
5. `paused`
6. `invalid`

Execution state precedes leverage: a started thing beats an unstarted one of
the same priority.

## Ordering — total and deterministic

1. **effective priority** — P0 → P3
2. **execution-state rank** — the six groups above
3. **leverage**, descending — the count of DIRECT dependents for which this
   item is the ONLY unmet dependency. Transitive counts are noise: they
   credit an item for work it does not unblock on its own.
4. **oldest date** — `Created:` for triads, the entry date for backlog
   items; missing dates sort last
5. **ASCII order of identity path** — final tie-break, so two runs over the
   same docs produce the same board

**Context never reorders the board. Effort never reorders the board.** Both
are annotations; only the suggestion layer may consult context.

## Effort — annotation only

Bands `S M L XL ?`, always printed WITH the evidence that produced them:

```
L — 7 tasks, database migration
```

From the unchecked task count, escalated by hazard flags visible in the
triad (schema/data migration, public-contract change, multi-package reach):
`S` ≤2 tasks and no hazard; `M` 3–6 and no hazard; `L` 7+ or one hazard;
`XL` two or more hazards; `?` when evidence is insufficient — which is the
honest band for an ordinary backlog entry with no triad yet.

Task count alone is not effort. Without hazard evidence the band is `?`, not
a guess.

## The board

Every board is also **persisted** as a report (`next/<ts>.md`, a
`supermodo:board` block) per `reports.md`, and the newest one is the Board tab
of the HTML archive. The board is computed HERE, once: the renderer draws the
resolved result and never re-derives priority, order or suggestions.

Grouped by effective priority, ordered within each group by the rules above:

```
Worklist — 11 items · 2 repairs owed

P0
  payment-timeout-fix        in-progress   L — 7 tasks, db migration    unblocks 2
P1
  api-client-retry     P3→P1 not-started   M — 4 tasks                  required by payment-timeout-fix
  auth/02-refresh-flow       needs-input   M — 5 tasks                  1 open question
P2
  telemetry-batching         blocked       ? — backlog entry            depends: api-client-retry
P3
  docs-tone-pass       unset not-started   S — 2 tasks
paused / invalid
  legacy-import              paused        L — 9 tasks
```

Every line carries: identity · effective priority (`→` when inherited,
`unset` when provisional) · execution state · effort with evidence ·
dependency or leverage note.

## Suggestions — at most three, never auto-picked

1. **Priority lead** — the head of the board.
2. **Context lead** — the highest-ranked item matching read-only evidence
   (current branch name, recent commit subjects, uncommitted diff paths,
   session context), **clamped to the priority lead's bucket or one lower**.
   Context may break a tie; it may never jump a priority gap. It MUST name
   its evidence in one line. Omitted when nothing matches meaningfully.
3. **Human unblocker** — the highest-ranked `needs-human-input` item whose
   dependencies ARE met, phrased as the decision owed, quoting the open
   question verbatim.

`dependency-blocked`, `paused` and `invalid` items are never suggested.
Duplicates collapse. An empty board yields "nothing doable" plus the repairs
list — never a fabricated suggestion.

**The selection is always the user's; nothing auto-picks.**

## `next` as a job source

Where a skill accepts `next` as a job source (e.g. `flow --job next`), it
resolves to the **priority lead** — the board head — not to alphabetical
order.

## Doable

A work triad is **doable** when its `tasks.md` still has unchecked tasks and
every declared dependency is met. A backlog entry is doable when it is live
and its `depends:` line (if any) names no unmet dependency. Dependencies are
met per the docs convention (triad archived; backlog entry graduated or
struck). Doable items are rank groups 1–3; the board shows the rest too, so
the user can see what is waiting and why.

## Repairs

The worklist never mutates `docs/`. It reports convention debt for
`librarian`: missing `Priority:`, missing `Created:`, malformed priority or
dependency lines, dependency cycles, dangling references. Repairs are
counted in the board header and listed after the suggestions.
