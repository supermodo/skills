# The supermodo docs convention (v1)

Strict and opinionated. Skills REQUIRE this structure; `config` scaffolds or
migrates projects into it (dry-run + file-by-file approval, never silent
overwrites). Skills do not adapt to other layouts.

## Layout

```
docs/
├── README.md                    # THE ROUTER — single entry point, always read first
├── CONVENTIONS.md               # prose: code + docs conventions for this project
├── work/
│   ├── BACKLOG.md               # dated backlog entries; history is struck through, never erased
│   ├── <task-slug>/             # one folder per active task ("the triad")
│   │   ├── spec.md              # what & why: goal, non-goals, scope, acceptance evidence
│   │   ├── plan.md              # how: approach, steps, risks, alternatives considered
│   │   ├── tasks.md             # checklist with immutable task IDs (below)
│   │   └── findings.md          # optional: evidence a promotion carried in
│   └── <program>/               # OR a program: related initiatives grouped
│       ├── README.md            # program overview (frontmatter: `program:` = folder name)
│       └── NN-<slug>/           # initiative triad (NN = 01, 02, … unique)
│           └── spec.md …        # same triad files as a flat task
├── decisions/
│   └── ADR-NNNN-<slug>.md       # durable decisions; bodies immutable, only lifecycle fields update
├── reference/                   # promoted, verified contracts ("how it IS")
└── archive/
    └── YYYY-MM-<task-slug>/     # completed work folders, moved verbatim
```

## Rules

- **Router first.** Every skill starts at `docs/README.md` (or
  `docs.entry` from config). Never infer current work from `archive/`.
- **Two work shapes, two levels max.** A dir under `work/` is a **triad**
  (it has `tasks.md`) or a **program** (it has `README.md` plus
  `NN-<slug>/` initiative triads — `NN` two digits, zero-padded, unique
  within the program; numeric order is the program's own sequencing). A
  program dir holds NOTHING else: no stray files, no non-initiative dirs.
  Initiatives never nest further — program/initiative is the hard depth
  cap. The program `README.md` opens with YAML frontmatter whose
  `program:` equals the folder name; other frontmatter keys (status,
  updated, description, host-specific like `gitlab-*`) are free-form and
  never validated. Its body is the program's overview for agents: vision,
  status, initiative table, dependencies. A triad's identity path is its
  slug (`<task-slug>` flat, `<program>/NN-<slug>` in a program).
- **Task IDs are immutable.** Every checklist task line in `tasks.md` carries
  an inline ID comment: `- [ ] Implement X <!-- task:implement-x -->`.
  Identity NEVER derives from list position or title text. IDs are kebab-case,
  unique within the file, never reused, never renamed.
- **Task states** — the checklist marker is one of: ` ` pending, `/`
  in-progress, `x`/`X` done, `^` or `-` paused. Every tool reads this full
  set: "incomplete work" = pending OR in-progress; done and paused are not
  picked up.
- **Generated navigation.** The marker `<!-- supermodo:generated -->`
  denotes a file that is generated IN ITS ENTIRETY — never hand-edit one;
  only `docs-generate.ts` (or the configured `commands.docsGenerate`)
  rewrites it. The router is NOT such a file: it carries no file-level
  marker; only its nav section, delimited by `<!-- supermodo:nav:start -->`
  / `<!-- supermodo:nav:end -->`, is generated. Librarian edits router
  prose freely OUTSIDE the delimiters and never inside them.
- **Single documentation owner.** Only `librarian` mutates documentation.
  Every other skill/agent reports drift (see reports protocol); librarian
  resolves it. During a `flow` run, docs mutate only at stages 1 and 7.
  **Run artifacts are not documentation:** skill outputs (audit reports,
  preflight results, run state) live under `.skills/supermodo/` per the
  reports protocol and are written by the skill that produced them — the
  single-owner rule governs `docs/` only.
- **ADRs.** `ADR-NNNN` numbering is sequential, zero-padded to 4. Statuses:
  `proposed | accepted | superseded-by: ADR-NNNN | rejected`. Body and
  original decision metadata are immutable after acceptance; only lifecycle
  fields may be updated, mechanically.
- **Archive is cold.** Read archive prose only for a specifically identified
  provenance need, never by default. Archive names flatten: a flat triad
  moves to `archive/YYYY-MM-<task-slug>/`, an initiative to
  `archive/YYYY-MM-<program>-<NN-slug>/`; when a program's last initiative
  archives, its `README.md` moves to `archive/YYYY-MM-<program>/` and the
  empty program dir is removed.
- **Size discipline.** Live docs above 40 KB are split at responsibility
  boundaries by librarian, leaving a short landing document at the stable
  path.
- **Specs are not evidence.** A plan or spec never proves behavior exists;
  only code and verification evidence do. `reference/` holds only verified
  contracts.
- **A triad is three files plus whatever it needs.** `spec.md`, `plan.md` and
  `tasks.md` are required; further files are allowed and one is defined here —
  `findings.md`, the evidence a promotion brought with it (`promotion.md`).
  It is tracked ON PURPOSE: run artifacts under `.skills/supermodo/` are
  gitignored, so evidence left there does not survive a clone.

## Work metadata

These optional fields in `spec.md` and `BACKLOG.md` are the grammar two
protocols read: `worklist.md` owns what they MEAN and how work is ordered,
`promotion.md` owns the write-time act that sets them. This section defines
only their shape.

- **`Priority:`** — one optional line in `spec.md`:
  `Priority: P1 — released-workflow-breaking: checkout can fail before payment`
  Shape: `P<0-3> — <classification>: <justification>`. In `BACKLOG.md` the
  same value is an indented `priority: …` line under the entry. Absent or
  malformed = the item is treated as provisional `P2 — unset`.
  **At most ONE per item** — two priority fields in one file is a convention
  error, not a range, and every reader would disagree about the real value. A
  body of work that does not have a single priority is more than one item;
  `promotion.md` governs the split.
- **`Priority-source:`** — one optional line in `spec.md`, valid only next to
  a valid `Priority:`: `Priority-source: derived — <what was assumed> <date>`
  (in `BACKLOG.md`, an indented `  priority-source:`). The only defined value
  is `derived`, meaning a tool computed the priority and no human confirmed
  it. **Absence means confirmed** — that is what makes every item written
  before this field correct. An unrecognised value reads as `derived`, never
  as confirmed: a marker nobody can parse is not a signature.
- **`Mixed:`** — one optional line in `spec.md`, written when an item
  knowingly holds more than one priority: cohesion bound the work together, or
  the user declined a proposed split (`promotion.md` owns both cases):
  `Mixed: P2, P3 — split declined 2026-08-03`
  Shape: a comma-separated list of the OTHER `P<0-3>` values present in the
  item, an em dash, then a short reason and the date. It never repeats the
  item's own `Priority:` value and never changes it.
- **`Promoted-from:` / `Promoted-ids:`** — two anchored lines in `spec.md`,
  present together or not at all, written only by a promotion
  (`promotion.md`):
  ```
  Promoted-from: .skills/supermodo/hunt/2026-08-03-api
  Promoted-ids: HNT-20260803141500-004, HNT-20260803141500-011
  ```
  `Promoted-from` is the source run's identity — its report stem,
  repo-relative under `.skills/supermodo/`, without `.md`, with no `.` or
  `..` segments. The form is fixed because duplicate detection compares it
  literally: an alias for the same run compares equal to nothing.
  `Promoted-ids` is every finding id in the item, ASCII-sorted and
  `, `-separated. They are the index a later promotion scans to find this
  item, so their spelling is fixed. `docs-check` requires
  each listed id to head its own `## <id> — <title>` section in `findings.md`
  AND to appear as a `<!-- task:<id> -->` marker (lowercased) in `tasks.md`.
  Both comparisons are exact-set, never substring: `…-01` occurs inside
  `…-010`, and an id named in prose is not a task.
- **`Created: YYYY-MM-DD`** — one optional line in `spec.md`, the canonical
  age of the work. Directory timestamps differ per clone and are never used
  for this.
- **`## Open questions`** — an optional section in `spec.md`, a checklist
  whose items carry immutable inline question IDs exactly like task IDs:
  `- [ ] Which retention policy applies? <!-- question:retention-policy -->`
  Unchecked = the answer is owed by a human; checked = resolved. IDs are
  kebab-case, unique within the file, never reused, never renamed.

## Dependencies

- A `spec.md` MAY declare dependencies with a single optional line
  `Depends on: <triad-path>[, <triad-path>…]` naming other work triads by
  identity path (`<task-slug>` or `<program>/NN-<slug>`). A dependency is
  **met** when that triad has been archived.
- **Backlog entry grammar** (`work/BACKLOG.md`) — one list item per entry:
  `- **<slug>** (YYYY-MM-DD): <text>`, slug kebab-case and unique among
  live entries; identity IS the slug. Optional indented lines may follow.
  Dropped = the item struck through (`- ~~**<slug>** …~~ — dropped
  YYYY-MM-DD: <reason>`); graduated = text replaced by `→ graduated
  YYYY-MM-DD to work/<triad-path>/` (flat slug or `<program>/NN-<slug>`). **Live** = neither struck nor graduated.
- Backlog entries declare dependencies ONLY with an indented line of the
  exact form `depends: <slug>[, <slug>…]` (each slug a backlog entry or
  work triad). Other indented constraint prose is context for humans and
  models but never parsed as a dependency.

## What to work on next

Selection — doable, priority, ordering, effort, the board, suggestions — is
NOT defined here. It lives in `worklist.md`, which reads the grammar above.
No skill restates those rules; they read that master.
