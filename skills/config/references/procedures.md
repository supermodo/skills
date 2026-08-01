# config — phase playbook

Read the section the SKILL.md checklist points you at; the hard rules in
SKILL.md apply unchanged throughout.

Contents:

1. Fast path (empty project or `--yes`)
2. Dry-run + docs scaffold
3. Conflicts = migration plan
4. Write + manifest
5. Validate
6. Tooling phase
7. Upgrade
8. Final report + docs handoff

## §1 Fast path

Triggered by: a NEW project (no `skills.config.json`, no source files, no
docs — only inert scaffolding: `.git/`, stub `README.md`, license,
editor/tool dotfiles) or an explicit `--yes`. Discovery has already run.

1. **Answers.** Preference fields take their defaults — project name =
   directory basename, docs entry `docs/README.md`, coverage `80`, no
   agent roster (single-agent fallback; no project evidence = nothing to
   ground roles on), transport `chat`, verbosity `concise`. Discovered
   command candidates are auto-accepted into their tiers with
   deterministic precedence: an aggregator target beats the raw tool it
   wraps (tooling master's aggregator rule); the project's dominant
   manager beats a stray alternative; genuinely equal candidates → ask
   that ONE question, never pick silently. SKILL.md rule 5 applies:
   verification runs only after the confirmation that lists the argv to
   be run — in a non-empty project that rides the §2 dry-run. A truly
   empty folder has no candidates: nothing runs, no commands recorded,
   never invented ones.
2. **Writes.** Without asking ONLY when every write creates a new file —
   no pre-existing file modified or appended to (including `.gitignore`).
   This is the single documented exception to §2's mandatory dry-run:
   safe because nothing existing is touched and the manifest keeps it
   reversible. The moment ANY pre-existing file would change, show the
   compact plan (file list + the one `.gitignore` append) and get one
   confirmation first. `--yes` in a non-empty project → defaults replace
   the interview answers, but §2–§3 (dry-run, conflicts) apply in full.
3. **Report AFTER writing** (validation, §5, included): one table of
   every setting → its value, the list of files created, and — when no
   test tier exists — one line stating that the `flow`/`tests`/`tdd`
   gates stay unavailable until a test command is configured
   (`config --edit commands` once the project has code). Then ask ONE
   simple confirmation: "Change anything? (default: no)" — a named field
   routes into `--edit` for just that field; no → done.
4. **Close** by pointing at the first commit:

   > Next: `/supermodo:commit` — proposes the commit message for this
   > scaffold; if this isn't a git repository yet it asks about
   > `git init` explicitly and runs it only on your yes.

## §2 Dry-run + docs scaffold

Present the COMPLETE list of files to be created or modified; nothing is
written before explicit approval.

Docs scaffold (per `../../protocols/references/docs-convention.md`),
ROOTED AT THE CONFIGURED `docs.entry`: `<docs>` = the entry's directory,
router = the entry's filename — choosing `handbook/index.md` scaffolds
`handbook/index.md`, `handbook/work/`, … and the written config must point
at exactly what was scaffolded. Default entry → the classic tree:

```
<docs>/<router>           # THE ROUTER — docs.entry's filename verbatim (e.g.
                          # README.md; never append another extension) — with:
                          #   <!-- supermodo:nav:start --> … <!-- supermodo:nav:end -->
<docs>/CONVENTIONS.md     # prose conventions stub
<docs>/work/BACKLOG.md    # dated backlog, empty
<docs>/work/              # active task triads live here
<docs>/decisions/         # ADR-NNNN-<slug>.md
<docs>/reference/         # verified contracts
<docs>/archive/           # cold, completed work
skills.config.json        # the config (schema: ../../protocols/references/config.md)
.gitignore                # append one line: .skills/
```

Accepted agent-team proposals (wizard step 5) join the enumeration as
`<agents.dir>/<role>.md` + one-line description each.

An existing `work/` using the PROGRAM shape (`<program>/README.md` +
`NN-<slug>/` initiative triads, per the docs convention) is
convention-valid — never treat it as a conflict or propose flattening it.

The router carries ONLY the nav delimiters — never a file-level
`<!-- supermodo:generated -->` marker (that marker means "this whole file
is generated" and would forbid librarian from editing router prose).
Reserve the file-level marker for docs generated in their entirety. Show
the exact `skills.config.json` you will write.

## §3 Conflicts = migration plan

Any target path already existing with non-generated content:

- Do NOT overwrite. File-by-file plan: propose move / merge / leave, get
  approval per file. Declined plan → HALT, project unchanged.
- SKILL.md rule 6 applies: only files this skill itself marked
  `<!-- supermodo:generated -->` may be replaced without a migration plan.

## §4 Write + manifest

On approval, write with write-temp-then-rename. Record every action
(create/move/merge/append, source→dest, note) to
`.skills/supermodo/config-manifest.json` so the change is reversible.
Real-path containment on EVERY write: resolve the target (or nearest
existing parent) and refuse unless it stays beneath the real project root —
root-relative syntax alone does not stop a symlinked parent from escaping.
The stricter `.skills/supermodo/` containment rule (reports protocol)
applies on top for manifest/report paths. Append `.skills/` to `.gitignore`
(create if missing; don't duplicate the line).

## §5 Validate

Run the bundled checker, resolved **relative to the installed SKILL
folder** (never a config path):

```
node <dir-of-SKILL.md>/scripts/config-check.ts skills.config.json
```

Exit 0 = valid; exit 1 → print the field errors and fix before reporting
success. Then confirm the docs scaffold matches the convention.

## §6 Tooling phase

Only tiers queued "set up after". Runs after validation, BEFORE the final
report, one tier at a time, per the freshness method in
`../../protocols/references/tooling.md` — never from remembered recipes:

1. **Local truth:** exact tool versions from lockfiles/manifests, existing
   tool configs, the installed tool's own `--help`.
2. **Live docs:** current official setup for that tool AND version via the
   host's docs/web tools.
3. **Propose as an approved plan:** exact file diffs (aggregator targets
   per the tooling master's aggregator rule, scripts, tool config) and
   any dev-dependency install command, dry-run enumerated, per-change
   approval, manifest-recorded — same invasiveness rules as the scaffold.
4. **Verify, then record:** run the new command. An invocation/setup
   failure (command not found, misconfiguration) → report honestly,
   record nothing for that tier, let the user decide. A command that RUNS
   correctly but reports genuine findings (red tests, lint errors) IS
   verified — record it and disclose the red result. Recording goes
   through the normal `--edit` write path (diff, confirm, re-validate).

A tier the user abandons mid-phase becomes a decline (manifest,
`tooling.declined`) like any skipped tier.

## §7 Upgrade

Current schema is `configVersion: 1` — the only version.

- **Equal** to supported → nothing to migrate; report and stop.
- **Lower** → migration: dry-run the field changes first, same safety
  rules as bootstrap (enumerate, confirm, manifest, recoverable), then
  rewrite and re-validate. (No lower version exists yet; path reserved.)
- **Higher** → HALT. The installed skills are older than the config; tell
  the user to update the supermodo skills. An older config skill never
  rewrites a newer config.

Always dry-run and back up (manifest) before touching an existing config.

## §8 Final report + docs handoff

Report per SKILL.md "Report", after any §6 work. Documentation files noted
during discovery outside the scaffold's target paths — elsewhere in the
repo (root `ARCHITECTURE.md`, `notes/`, package READMEs) AND inside
`docs/` at non-convention paths (`docs/architecture.md`, `docs/setup/`) —
are never touched by config. If any exist, END the report with:

```
/supermodo:librarian --absorb
```

as the REQUIRED next step (librarian classifies each file, proposes
per-file disposition) — until absorbed, those docs are invisible to the
toolkit.
