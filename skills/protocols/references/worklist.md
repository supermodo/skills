# The worklist protocol (v1)

How ANY supermodo skill answers "what should I work on next". This master
owns the **selection semantics**; `docs-convention.md` owns the **grammar**
it reads (`Depends on:`, `Priority:`, `Created:`, `## Open questions`, the
backlog entry shape, task states).

**Read-time only.** The board is recomputed on every call from `docs/work/`,
`docs/work/BACKLOG.md` and read-only repo evidence. Nothing here is ever
derived from a stored board, and this protocol NEVER mutates documentation —
convention debt is reported for `librarian`, the single documentation owner.

"Never mutates documentation" governs `docs/` and nothing else. The board IS
written to disk, every run, as a run artifact under `.skills/supermodo/next/`
(see "The board" below and `reports.md`) — run artifacts are not documentation
and a board that exists only in a chat window dies with the session. Read the
two rules together: recompute from source every time, persist the result every
time, never treat the persisted copy as an input.

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

### Every item is born with a priority

Triage is not a periodic clean-up, and `next --triage` is not where priorities
are supposed to come from — it is the **repair path**, there for items that
escaped. An item acquires its priority at the moment it comes into existence,
from the person creating it, while they still have the context that answers
the three questions in seconds. Asked a month later against thirty items at
once, the same questions are an interview nobody wants.

`librarian` is the only writer of `Priority:`, so the duty is the same for
every way an item can be born, with no exceptions:

| an item is created by | asks the intake questions |
| --- | --- |
| `librarian --task` (free text, or `flow` stage 1) | yes — into `spec.md` |
| `librarian --backlog add` | yes — into the entry |
| `librarian --backlog graduate` | no — the entry's priority VALUE moves to the new `spec.md`, re-emitted as `Priority: <value>` (see below); it was already answered. Only ask if the entry had none. |
| `librarian --absorb`, for every file it turns into a triad or a backlog entry | **yes** — a document absorbed without one becomes an item nobody ranked |
| `grill` / `flow`, wherever they create an item | yes |
| `next --triage` | yes — the repair path, for what got through |

A user may always decline; the item is then provisional and appears under
repairs. What must never happen is the questions not being ASKED at creation —
that is what fills a board with thirty `P2 — unset` rows and forces the triage
gate below.

**Moving a priority between files changes its field name, never its value.**
The two stored forms differ: `  priority: P1 — …` indented under a backlog
entry, `Priority: P1 — …` at the top level of `spec.md`. "Verbatim" applies to
the VALUE — everything from `P<0-3>` onward — and never to the field name.
Copying a backlog line unchanged into `spec.md` leaves a lowercase indented
key that this protocol reads as no valid priority at all, rendering
`P2 — unset`. On graduation that is silent data loss, not a cosmetic slip: the
backlog entry is replaced by a pointer in the same step, so a confirmed P0
disappears from both files and reappears as an unranked P2 with nothing to
show anything was lost.

### The questions

At most THREE closed questions, presented as closed menus per `questions.md`
(fixed self-explanatory option sets — no `Claude suggests:`/`Codex counters:`
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
| `in-progress` | some task marked `/`, **or** some task done while others remain — work that has begun is in progress, whatever marker it stopped on |
| `not-started` | no task done and none in progress |
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
4. **completion**, descending — `done / total` tasks. Within one bucket and
   one state, finish what is nearly finished: 20 of 21 outranks 0 of 21.
   Items with no task list count as 0.
5. **has a triad**, before a bare backlog entry — a triad exists because
   someone already spent attention on this: it was specced, planned and
   broken into tasks. Within one priority and one state that investment is
   real evidence of intent.
6. **most recently touched**, descending — the last commit date touching the
   triad's directory (read-only `git log -1`, NOT filesystem mtime, which a
   checkout resets). Backlog entries have none and sort after.
7. **oldest date** — `Created:` for triads, the entry date for backlog
   items; missing dates sort last. Kept AFTER recency deliberately: recency
   surfaces what you are living in, this keeps neglected work from sinking
   forever.
8. **ASCII order of identity path** — final tie-break, so two runs over the
   same docs produce the same board

Steps 2–6 are the order WITHIN a priority bucket, and they must do real work:
if a bucket ever comes out in alphabetical order, the earlier keys were all
ties and that is a signal something is mis-stated (a started item reading as
`not-started`, a missing `Created:`), not that the items are equivalent.

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

## The triage gate — before the board, not after it

An item with no stored priority renders as provisional `P2 — unset`. One or
two of those are noise the board absorbs. Thirty of them are not: every key
below effective priority is a tie-break, so when most items share one
defaulted bucket the ordering collapses onto leverage and completion, and the
board presents a ranking nobody chose as though it were considered. Showing
that board and mentioning triage afterwards — in a closing line, an insight,
a repairs list — is the wrong order: the user has already read and believed
it.

**Untriaged** means no VALID stored priority — the line is missing, or it is
there but malformed. Both render as provisional `P2 — unset`, and a malformed
line is exactly as unranked as an absent one. The universe it is counted
against is **every item on the board**, in all rank groups, including blocked
and paused ones; an item is untriaged whether or not it happens to be doable.

**An untriaged priority is UNKNOWN, not P2.** `P2 — unset` is a rendering
default so the board can draw a row; it is not an estimate and carries no
evidence. The item's real priority spans the whole range, P0 to P3, and until
someone answers three questions nobody knows which.

Everything below turns on that. The tempting test — "does the untriaged item
reach the provisional shortlist" — is exactly wrong, because it asks the
question *while assuming the answer*. An untriaged released-catastrophic
defect ranks as P2, sorts below every known P0 and P1, never reaches the
provisional shortlist, and so never trips the gate — and it was the P0 all
along. The one case the gate exists for is the one that test cannot see.

**Gate when the order is materially unknown**, which is either of:

- **any ACTIVE item is untriaged.** Unknown spans P0–P3, so any such item
  could be the true lead — or could lift a different item into the lead. One
  unclassified item is enough: three questions resolve it, and it is the only
  thing that can silently invert the answer.
- untriaged items are at least half of all items — the whole ORDER is then
  guesswork, not just its head, and the board is what the user reads even
  when they are not asking for a suggestion.

**Active, not doable — the distinction matters and the narrower one is
wrong.** "It is blocked, so its priority cannot change what I do next" is
false under this protocol's own inheritance rule: `effective = max(own,
effective of every ACTIVE transitive dependent)`, and a `dependency-blocked`
item is active. A blocked, untriaged item that is truly P0 lifts its blocker
to P0 — and its blocker may well be doable and sitting quietly in P2. Judging
an unknown priority irrelevant because the item carrying it cannot be worked
on ignores the entire reason inheritance exists.

The only safe exclusions are the ones inheritance itself excludes: **paused,
archived and dropped** items transmit nothing, and `invalid` items transmit
nothing. They cannot move any effective priority, so leaving them provisional
cannot change the answer. Everything else active counts, blocked or not.

They all still count toward the second test regardless, since they occupy rows
the user is reading.

Computing this needs no shortlist and no context evidence — it is a property
of the items themselves — so it can be evaluated as soon as the items are
collected. Gather the context evidence and compute the provisional board
anyway, since option 2 below and the skipped path both need them; just never
let provisional shortlist membership BE the test.

Otherwise do not gate: name the count in one line, list the items under
repairs, and render the board.

Two bounds, so the gate cannot trap anyone:

- **It fires at most ONCE per run.** After the user has answered it — whatever
  they chose, however many items they declined — the board renders. Items left
  provisional by a decline go to repairs, not back through the gate. A user
  who declines every question would otherwise meet the same menu forever.
- **The volume test needs a volume.** At zero items "half are untriaged" is
  vacuously true, and below four items a proportion says nothing. Apply the
  second test only from **four** items up.

  The first test has no such floor and gets none: it is about whether the
  answer can be wrong, and that does not become acceptable on a small board.
  One unclassified active item out of two still costs three questions and can
  still be the P0.

At the gate, print the one-line assessment (how many items, how many
untriaged, what that does to the order) and ask a closed menu per
`questions.md`:

1. **triage now** — all untriaged items, ≤3 closed questions each
2. **triage only what changes the answer** — the untriaged ACTIVE items, in
   board order; untriaged paused, archived, dropped and invalid items stay
   provisional because they transmit nothing and so cannot move any effective
   priority. This is the smaller set, not a different rule: it drops exactly
   the items whose priority provably cannot change what you do next. It needs
   no loop — the set is fixed before any question is asked, and answering
   cannot add to it.
3. **skip** — render the board now, unreliable and marked so

Never triage without asking, and never refuse the board. Skip is a first-class
answer: the user may be looking for one specific item and want no interview at
all. What skip does NOT do is hide its cost — the board renders with the
`caveat` field set (`reports.md`), the warning appears above the board on the
page and in chat, and the shortlist says its ranking rests on defaults.

### Answers are stored, or they were not collected

Triage answers that end the run as chat text are worse than no triage: the
user spent the interview and will be asked the identical questions next week.

The moment the user confirms a priority, that line is handed to `librarian` —
the only writer of `Priority:` — **in the same run**, by invoking it, not by
printing what it should write.

**The handoff carries the lines in the invocation itself**, one per line, in
this exact form and nothing else:

```
work:<slug> — P1 — released-workflow-breaking: checkout can fail before payment
backlog:<slug> — P3 — improvement: tighten the export column names
```

Identity, an em dash, then the priority VALUE alone
(`P<0-3> — <classification>: <justification>`) — never the `Priority:` /
`  priority:` field name, which belongs to the destination file and is added
by the writer. No prose around them, no file to go and read, no "the
priorities we just discussed" — the receiving skill is a fresh context and
cannot see the interview. Anything not in that list does not get written.

Then re-read the touched files and confirm each line is actually there.
Confirmation is reading the file, not the absence of an error message.

**When the store fails** — librarian unavailable, a line rejected, a partial
write — the run does NOT pretend it succeeded and does not silently retry
forever:

1. Say plainly which priorities are stored and which are not, by name.
2. Render the board anyway. Refusing to show it helps nobody, and the user
   answered questions in good faith.
3. Set `caveat` on that board: unstored answers leave the order resting on
   defaults exactly as a skipped gate does, and this is the case most likely
   to mislead — the user believes they just triaged.
4. Report `status: failed` with `questions` EMPTY. The user answered; the
   write failed. Nothing is waiting on them, so `needs-input` would be a lie
   under the status invariant in `reports.md`, and it would advertise a
   settled question in the archive's "Needs you" tab while hiding the
   operational failure that actually happened.
5. Put the confirmed lines in the report body verbatim, in handoff format, so
   the run can be retried by pasting them into
   `/supermodo:librarian --priorities`. An answer the user has already given
   must never have to be given twice.

A run that silently ends with unstored answers has failed at the only thing
triage is for.

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

## Suggestions — a shortlist of three to five, never auto-picked

The user asked what to work on. Answer with a SHORTLIST of real, doable work
they can choose from — never with empty slots. Take the first **3 to 5**
doable items in board order (the deterministic total order above), always
starting with the priority lead.

Each entry carries a **role label** explaining why it earned its place. Roles
are labels, NOT reserved slots: a role with no candidate simply does not
appear. A shortlist is never padded with placeholders, and never says
"nothing qualifies" while doable work exists.

**Board order alone is not relevance.** Fill the shortlist in two passes:

1. the **priority lead** first, always;
2. then up to TWO role entries that board order would bury — a `quick win`,
   an `unblocks others`, a `continues your work` — taken from anywhere in the
   doable set, provided they sit no more than one bucket below the lead;
3. then `next in line` items in board order until the list holds 3–5.

Without pass 2 the shortlist is just the top of the board with labels on it,
and a P2 item at 20 of 21 tasks — minutes from done — never surfaces while
seven untouched P1 entries queue ahead of it. Naming that item is the whole
point of a shortlist.

| role | earned by |
| --- | --- |
| `priority lead` | head of the board — always first |
| `continues your work` | matches read-only evidence (branch, recent commit subjects, uncommitted diff paths, session context), **clamped to the lead's bucket or one lower**. Context may break a tie, never jump a priority gap. MUST name its evidence in one line. |
| `unblocks others` | this item is the only unmet dependency of one or more active items — name them |
| `waiting on you` | a `needs-human-input` item whose dependencies ARE met, phrased as the decision owed, quoting the open question verbatim |
| `quick win` | effort S with no unmet dependency, inside the lead's bucket or one lower |
| `next in line` | no special role; it is simply next in board order |

Every entry states its identity (`work:<slug>` / `backlog:<slug>`), its
priority, one line of why, and the **exact command** to start it.

`dependency-blocked`, `paused` and `invalid` items are never suggested.
Duplicates collapse — an item earning two roles appears once, with the
stronger role. Fewer than three doable items → show what exists. A board with
NO doable item yields "nothing doable", the reason, and the repairs list —
never a fabricated suggestion.

**The selection is always the user's; nothing auto-picks.**

## `next` as a job source

Where a skill accepts `next` as a job source (e.g. `flow --job next`), it
resolves to the **priority lead** — the board head — not to alphabetical
order.

The triage gate applies here with more force, not less: `--job next` asks the
board to CHOOSE, and a board whose order rests on unconfirmed defaults cannot.
Everywhere else the cost of a wrong lead is that the user reads a bad
suggestion and ignores it; here it is an eight-stage pipeline that edits code,
writes docs and reaches a commit gate on the wrong task.

So `--job next` never resolves silently past an unknown. When any ACTIVE item
is untriaged — including a blocked one, which can lift its blocker into the
lead — triage it or get explicit confirmation of the pick before running
anything. "Skip" is not available in this path, because there is no board for
the user to read and correct: the choice becomes an action immediately.
Nothing here may auto-run on a provisional lead.

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
