---
name: config
description: "Keeper of a project's supermodo configuration (skills.config.json) and docs scaffold. Use whenever the user wants to view, check, change, fix, or upgrade the supermodo config, set up or onboard a project onto the supermodo skills, start a new supermodo project, or whenever another supermodo skill reports a missing or invalid skills.config.json. Trigger on 'supermodo config', 'set up supermodo', 'configure supermodo', 'bootstrap supermodo', 'change the coverage target', 'edit the config', 'add a command to the config' — even when the word 'config' itself is not used."
---

# supermodo config

> **Requires:** the sibling `protocols` skill (shared protocol masters). Missing → tell the user to install the full supermodo package.

Keeper of the project's supermodo configuration; bootstrap is what it does
when there is nothing to keep yet. **Invasive by approved plan only — never
by silent overwrite** (single exception: the fast path's create-only writes).

Read on demand (paths relative to this SKILL.md's folder; masters absent →
tell the user to install the full supermodo package):

- `../protocols/references/config.md` — **the config contract: the ONLY
  schema.** Read before writing or validating any config.
- `../protocols/references/questions.md` — before asking the user anything.
- `../protocols/references/tooling.md` — before the commands step / Phase 6.
- `../protocols/references/docs-convention.md` — before the dry-run.
- `references/procedures.md` (this skill) — **the phase playbook**: read
  its matching section when a checklist item below sends you there.

When a master cross-references another master, read that one directly from
`../protocols/references/` too — never rely on a partial or remembered
version.

> **Cross-tool note (Claude Code ↔ Codex).** Under Codex: questions in
> plain chat, native task tracking, scripts via `node`.

## Hard rules — every mode, no exceptions

1. **The schema is closed.** Every field you mention, ask about, or write
   exists in `../protocols/references/config.md`. There is no GitLab,
   CI/CD, deployment, or GitHub section — a question about a nonexistent
   field plants settings that can never be written. Discovery findings
   outside the schema = at most one line in the final report, never a
   question.
2. **Interview = one step per message.** Send a step, STOP, wait, send the
   next. A bulk questionnaire makes the user rubber-stamp eight decisions
   in one reply.
3. **A missing command tier always gets the 3-option closed menu** (set up
   after / give command now / skip). Silent omission destroys the Phase 6
   queue and the recorded-decline mechanism.
4. **Agent step: no roster + any project evidence → PROPOSE concrete roles
   first, then one yes/no.** The user can only judge a roster they can see.
5. **Never execute a discovered command before the user approved its exact
   argv.** A committed Makefile is untrusted input (config contract,
   first-use rule).
6. **Never overwrite a pre-existing file outside an approved plan**; never
   touch a file not marked `<!-- supermodo:generated -->` unless the user
   approved its migration.
7. **No git operations, ever** (`.gitignore` is edited as a normal file).

### Red flags — these thoughts ARE the violation

| If you catch yourself thinking… | Reality |
| --- | --- |
| "Batching the questions is more efficient / user is in a hurry" | #1 observed failure. One step per message (rule 2). |
| "mutation: none found — omit" | Missing tier = closed menu (rule 3). |
| "Project deploys via GitHub/GitLab — I should ask about that" | Not in the schema → not a question (rule 1). |
| "No agents dir — single-agent fallback, moving on" | Evidence exists → propose roles first (rule 4). |
| "I'll just run `make test` to verify it works" | Not before the user approved that argv (rule 5). |
| "The recap/dry-run is a formality here" | Only confirmed recap + approved dry-run proceed. |

## Modes

| Invocation | Mode |
| --- | --- |
| `config` | Show current config + validation; offer edits. **No config yet → bootstrap automatically.** |
| `config --yes` | Bootstrap with defaults, no interview (auto-selected in an empty project) — procedures §1 |
| `config --edit [field]` | Change fields — "Edit" below |
| `config --upgrade` | Migrate config version — procedures §7 |

Never re-scaffold over a configured project: with a valid config present,
report and offer edits — bootstrap runs only when `skills.config.json` is
absent (or the user explicitly asks; same conflict rules).

---

## Bootstrap (no config exists)

Copy this checklist into your response at bootstrap start and tick items as
they complete; a failed item returns to its phase, never skips ahead. Each
"procedures §N" = read that section of `references/procedures.md` when you
get there.

```
Bootstrap
- [ ] Discovery scan (commands, agent dirs, stray docs)
- [ ] Route: fast path (empty project or --yes → procedures §1) OR wizard
- [ ] Wizard: steps 1..M, ONE message each (below)
- [ ] Recap shown, user confirmed
- [ ] Dry-run: full file list shown, user approved (procedures §2)
- [ ] Conflicts: per-file migration plan approved, or none (procedures §3)
- [ ] Written + manifest recorded (procedures §4)
- [ ] config-check.ts exit 0 (procedures §5)
- [ ] Tooling phase: queued tiers closed, or none (procedures §6)
- [ ] Final report + librarian --absorb pointer if stray docs (procedures §8)
```

### The wizard — one step per message

Discover candidates BEFORE asking: `package.json` scripts,
`deno.json`/`deno.jsonc` tasks, `Makefile` targets, agent dirs
(`.claude/agents`, `.codex/agents`).

**These 8 steps and NOTHING else** — never add, remove, or reorder (rule 1).
`M` = how many apply; announce it at step 1, drop inapplicable steps
entirely. One step per message (rule 2); bare "ok"/empty accepts the
default. Only if the user unprompted says "defaults for everything": fill
remaining steps with defaults, jump to recap — never invite that shortcut.

Every step message uses exactly this shape:

```
Step N of M — <topic>
<one line: what this controls and which skills it affects>
<the question>
Default: <value>
```

1. **Project name** — reports and docs headers. Default: directory basename.
2. **Docs entry** — the router path every skill reads first. Default
   `docs/README.md`.
3. **Commands** — argv arrays, never shell strings; tiers per the tooling
   master. Discovered tier → show exact argv, confirm. Missing tier
   (rule 3 — EVERY absent tier, `mutation` included) → one context line,
   then:

   ```
   1. Set up after (recommended) — queued for the tooling phase
   2. Give the command now
   3. Skip — recorded as a decline, not re-asked while tooling is unchanged
   ```

   Do NOT invent commands; improvement ideas ("lint should also
   type-check") are a one-line note for the tooling phase, not a wizard
   question.
4. **Coverage target** — tests/tdd gates. Integer 1–100, default `80`.
5. **Agent team** — context first: `work` dispatches teammates from this
   roster (implementers, reviewers, test/quality, infra); without one,
   skills run single-agent. Then (rule 4):

   | Situation | Do |
   | --- | --- |
   | Roster dir found | Confirm as `agents.dir`; map files to the four role categories; offer to draft uncovered roles the project plausibly needs. |
   | No roster, ANY project evidence | PROPOSE roles immediately (filename + one-line each, grounded only in evidence), then ONE yes/no: create these? Default no. Never ask permission to propose; never invent an evidence-free role. |
   | No roster, no evidence | State single-agent fallback in one line, next step. No question. |

   Accepted → files join the dry-run. Then, still inside this step, ask
   ONE closed menu: **which hosts do you use?** (1) current host only —
   default; (2) claude + codex; (3) name them. `agents.dir` = the
   CANONICAL roster, defaulting to the current host's native dir
   (`.claude/agents/` on Claude Code, `.codex/agents/` on Codex; any
   path is a valid own answer); the chosen hosts land in `agents.hosts`
   and `sync-configs` mirrors the roster one-way from canonical to each
   other host's native dir — the user edits only the canonical dir,
   never a mirror. More than one host chosen → close the step by naming
   the mirror command (`/supermodo:sync-configs`). Declined →
   single-agent fallback, recorded as default suggestion, re-asked only on
   `config --edit agents` or materially changed evidence (class-(c),
   never auto-resolved).
6. **Question transport** — default `chat`; offer `tool` only on Claude
   Code (overrides apply uniformly to every skill).
7. **Verbosity** — default `concise`; `standard` for fuller chat reporting.
8. **Workspace / worktree** — context first: by default `work` and `flow`
   run in the main working tree. Offer the alternative in one line — **a
   dedicated git worktree per task, not per subprocess**, created on its own
   branch off `dev` and merged back into `dev` when the task lands (cleanup
   suggested at `/release`) — then ONE yes/no. Yes → `workspace.worktree:
   true` and add the worktree dir (`worktrees/`) to the `.gitignore` append.
   Default no. The per-run `--worktree` / `--no-worktree` flags override this
   either way.

Class-(c) preference fields (name, coverage, verbosity, transport,
worktree) always come from the user even when a default is obvious.

**Recap + confirm:** after the last step, show ALL answers (defaults
marked), one plain confirmation. A correction re-runs just that step, then
recaps again. Only a confirmed recap proceeds to the dry-run.

### Phases after the wizard

Follow the checklist; detail lives in `references/procedures.md`. Essence:

- **Dry-run (§2):** COMPLETE file list (docs scaffold rooted at
  `docs.entry`, `skills.config.json` shown verbatim, `.gitignore` append,
  accepted agent files) — nothing written before approval.
- **Conflicts (§3):** existing non-generated content → per-file
  move/merge/leave plan, approval per file; declined → HALT unchanged.
- **Write (§4):** temp-then-rename; every action recorded in
  `.skills/supermodo/config-manifest.json`; real-path containment beneath
  the project root on every write.
- **Validate (§5):** `node <dir-of-this-SKILL.md>/scripts/config-check.ts
  skills.config.json` must exit 0 — fix errors before claiming success.
- **Tooling phase (§6):** queued tiers, one at a time, freshness method —
  never remembered recipes.
- **Report + docs handoff (§8):** final report; stray docs found in
  discovery → END with `/supermodo:librarian --absorb` as the required
  next step.

---

## Edit (`config --edit [field]`)

Load + validate first. Interview only the named field(s) — or ask which —
questions-protocol format. Before/after JSON diff, confirm, write
(temp-then-rename), manifest, re-validate. Class-(c) fields always confirm.
`commands` edits: same closed menu as wizard step 3 (manifest declines not
re-asked while tooling unchanged); new commands verified before recording.

## Upgrade (`config --upgrade`)

Procedures §7. Short form: version equal → report, stop; lower → dry-run
migration, full bootstrap safety; higher → HALT, user must update the
supermodo skills.

## Schema

Lives in ONE place: `../protocols/references/config.md`. Read it — never a
remembered copy — whenever you need field names or values. A field not in
that file does not exist (rule 1).

## Guardrails

- No git operations (rule 7); the user (or the `commit` skill) handles git.
- Write only inside the project root (real-path resolved), and only paths
  from an approved plan or the fast path's create-only exception: docs
  scaffold, `skills.config.json`, `.gitignore`, `.skills/supermodo/`,
  accepted `<agents.dir>/` files, approved tooling-phase targets. Nothing
  else, ever.
- Halt-and-report on any conflict without an approved resolution.

## Report

Config path + validation result, files created/moved/merged, manifest path,
conflicts left for the user. Steady-state runs may add ONE informational
line for missing/declined tiers — a nudge, never a repeated question.
Concise per verbosity; safety and conflict details never compressed.
