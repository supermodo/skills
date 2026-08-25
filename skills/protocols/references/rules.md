# Project rules — `.supermodo/rules/` (v1)

Contents: what a rules file is · the split · location and format · the load
sequence · materialization and the first-use gate · independence. Read the
whole file before writing or reading a rules file.

Every supermodo skill encodes an opinionated process. A company's git cycle,
release sequence, and definition of "done" differ from ours, and no closed set
of `key: value` pairs covers them — `release.mode: light|full` is not a
parameter, it is a choice between two workflows we happened to ship.

A **rules file** is where a project states its own process for one skill.

## What a rules file is

**The complete process for that skill.** Not a patch, not an override layer,
not a set of hints merged with a default. Materialized once, then read as-is.

**One file, one read, nothing to reconcile.** A skill never combines a rules
file with a built-in default, because anything a model must reconcile at run
time is somewhere it can drift. Present → the file is the process. Absent →
the skill's **default shipped template** is the process, read from
`rules-templates/` (the variant whose frontmatter carries `default: true`).

**A sequence exists in exactly ONE place.** SKILL.md holds capabilities and
invariants; it never carries a second copy of the skill's own sequence "as the
default". A default that is written twice is two defaults, and the first time
one is edited the skill and its template disagree with nobody told. Behaviour
is always skill + rules: the skeleton from SKILL.md, the process from the
rules file or the template it came from.

## The split — capabilities, invariants, sequence

**Skills own capabilities and invariants. The project owns the sequence.**

- **Capabilities** stay in the skill: deriving a semver bump from Conventional
  Commits, building a changelog entry from fragments, printing an exact git
  sequence, dispatching a finder fleet. A rules file NAMES a capability; it
  never reimplements one.
- **Invariants** stay in SKILL.md as always-on preconditions and **never appear
  in a rules file**. That is the whole safety model, and it is structural
  rather than a matter of care: what is not in the file cannot be removed from
  the file. There is no "skip validation" section because no such section
  exists to write.
- **Sequence** is the project's: which steps, in what order, under what
  conditions.

A skill reads two things that never overlap. SKILL.md says *how to execute a
step well* — print the exact command, gate consent, write the report. The rules
file says *which steps, in what order*. Neither describes the other's subject,
so there is nothing to merge.

**Write sequence, not machinery.** Six lines naming capabilities age well; a
transcription of the skill's internals goes stale the moment that code changes.
The size cap below is a smell detector as much as a budget.

## Location and format

```
.supermodo/
└── rules/
    ├── INDEX.md      # generated — routes cross-cutting files only
    ├── commit.md     # per-skill, found by filename
    ├── release.md
    └── vcs.md        # cross-cutting
```

Committed and reviewed like source. `skills.config.json` stays at the project
root; `.supermodo/rules/` sits beside it.

Frontmatter, required on every file:

```yaml
---
rule: release                       # MUST equal the filename stem
applies-to: [release]               # closed vocabulary: installed skill names
description: RC release with QA sign-off, Jira fix-version linkage
template: full                      # which shipped starting point it came from
template-version: 0.7.0             # package version that starting point came from
---
```

- `rule` must equal the filename stem — skills read the file BY filename, so
  two disagreeing identities name two different files.
- `applies-to` is a **closed vocabulary**: every entry must be an installed
  skill name. A typo is a validation error, not a file that is silently never
  read. A file whose stem is itself a skill name may omit it — the filename is
  the declaration.
- `template` + `template-version` are two fields, not one string: drift uses
  `template` to pick WHICH shipped file to diff against and `template-version`
  to decide WHETHER to bother.
- **Cross-cutting** means `applies-to` names more than one skill, or names a
  skill other than the file's own stem. Only cross-cutting files appear in
  `INDEX.md`.

**Size: 4 KB per file, 12 KB per invocation.** Enforcement is asymmetric —
**hard at write** (`config` refuses to materialize an oversized file) and
**soft at read** (read it anyway, report it). A skill that refuses to run
because its process file is 200 bytes over is hostile. A process that will not
fit in 4 KB is describing machinery, not sequence.

## Every skill reads rules

**Reading is universal; gating is selective.** Every skill checks for its rules
file before acting — always, whether or not it ships a template and whether or
not it ever asks. A skill that silently stops reading rules is a project's
stated process being ignored with nobody told.

Two skills are exempt, and the list is enumerated rather than left implicit so
that adding to it is a decision someone has to defend:

| exempt | why |
| --- | --- |
| `protocols` | holds the masters and answers questions about them; it has no project process to own |
| `reports` | a thin wrapper over a deterministic renderer — its only knobs (`reports.html`, `reports.open`) are strict config, and prose cannot change a script's output |

The bar for a new exemption is "there is no sequence a project could own",
never "it has no template yet". **Reading and shipping a template are different
things:** a skill with no template still reads a hand-written rules file, and
`config --rules <target>` simply reports that this one has no starting point to
offer yet. `scripts/check.ts` enforces the roster.

## The load sequence

A skill reading its rules does exactly this, in order:

1. Read `.supermodo/rules/<my-name>.md` if present — **by a static path
   written in the skill's own SKILL.md**, never by listing the directory.
   Zero discovery cost, flat as the folder grows.
2. Read `.supermodo/rules/INDEX.md` if present, then read only the rows whose
   `applies-to` names me.
3. Open nothing else in that folder, ever. A skill never reads a file that does
   not name it — no "read it to be safe".

Stop at the 12 KB ceiling: if the files named for you exceed it, load the
per-skill file first, then cross-cutting files in INDEX order, and report what
you skipped. Never silently truncate a process.

`INDEX.md` carries `<!-- supermodo:generated -->`: generated in its entirety,
never hand-edited, rewritten only by `config`'s `rules-index.ts`.

## Materialization and the first-use gate

Rules files are created **on demand**, never scaffolded in bulk at bootstrap.
Two entry points, and one procedure does the writing:

- `config --rules [target]` — walk the default, ask where the project
  diverges, write the result.
- A **gated skill's first-use gate** — which routes its materialization
  through `config --rules <target>` rather than writing the file itself, so
  containment, validate-before-rename, index regeneration and the manifest
  record all live in one place.

### Which skills gate, and why

Two triggers, both about what the user is about to pay:

- **irreversible / outward-facing** — `commit`, `release`
- **expensive** — `flow`, `bug-council`

Everything else is equally customizable and never gates proactively.

The gate fires at the skill's **first consequential stop**, folded into a
consent gate that already exists — never as a new interruption. It shows the
chosen template's `summary` block (5–7 lines, fixed text, never improvised)
and offers `accept / customize / show full`, or an ordered choice of starting
points when the skill ships more than one. Accept materializes verbatim and
asks nothing further.

**Absence is not the gate condition.** Gate only when the rules file is absent
AND no decline is recorded in `.skills/supermodo/config-manifest.json` under
`rulesDeclined`. A user who said "just do it, don't save a file" is never asked
again — that is what makes absence *chosen* rather than accidental.

**`confirmations.mode: "auto"` does NOT skip this gate.** Choosing a process is
a class-(c) product/scope/preference question, which the config contract says
auto never skips. `config --rules --accept-defaults` is the bulk escape for a
user who wants it over with.

### `flow` resolves the whole pipeline up front

A stage subagent **cannot talk to the user** — that is what `needs-input`
exists for. So flow resolves rules for itself and every stage skill it will
invoke during its step-0 preflight: one `stat` per stage plus one manifest
read, every unresolved gate asked in a single batch, accepted ones materialized
through `config --rules`, all before stage 1 starts. No subagent then stops
mid-pipeline, and a process question never travels the report channel dressed
as a technical blocker.

That check needs no "first run" flag of its own. File presence plus the
manifest's `rulesDeclined` already answer it; a third record of the same fact
is one that can disagree with the other two the first time someone deletes a
rules file by hand.

### Shipped templates

A skill ships its starting points at `skills/<skill>/rules-templates/<variant>.md`
— two or three at most, beyond which the gate is a menu nobody reads. A variant
is a starting point, not a mode: once materialized the file is the project's,
and the variant name survives only so drift can diff against the right shipped
file.

Exactly one variant per skill carries `default: true`. That is the file a skill
reads when no rules file exists, so "which process runs by default" has one
machine-checkable answer instead of living in prose. `scripts/check.ts`
enforces the one-and-only-one rule; a cross-cutting template has no owning
skill and therefore no default.

A **cross-cutting** template has no owning skill, so its destination comes from
its own `rule:` field and never from the folder it ships in.

Shipped templates are a **public interface**: they are copied into user
projects and stamped with the package version they came from, so changing one
is a versioned, changelogged change.

## Independence

`.supermodo/rules/` works with **no `skills.config.json` at all**. `commit` and
`release` are config-optional, and their process is exactly what a config-less
project wants to pin. Validation lives in its own script
(`config/scripts/rules-check.ts`) for that reason — folding it into the config
validator would make the standalone case unreachable.
