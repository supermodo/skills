---
name: commit
description: >
  Generate a one-line Conventional Commits message from the current git changes,
  then offer to run the commit for the user. Use whenever the user asks for a
  commit message or wants to commit finished work — "commit message", "write a
  commit", "generate commit", "commit msg", "cm", "/commit" — even when they
  don't name this skill. Reads the actual diff to derive what was done. Prints
  the message; then shows the exact commands and asks whether to commit —
  runs git only on an explicit yes or a configured auto-consent policy.
  Works in fresh folders too: no repository yet → same flow, with git init
  prepended to the offered commands (init always asks, even in auto mode).
---

# commit

> **Requires:** the sibling `protocols` skill (shared protocol masters); uses `skills.config.json` when present. Missing protocols → tell the user to install the full supermodo package.

One line. Conventional Commits (conventionalcommits.org/en/v1.0.0). The diff is
the source of truth; the message is its index entry — written for someone
scanning `git log --oneline` a year from now.

The message is always the deliverable. Running the commit is an **opt-in extra**
the skill offers after the message exists — never the default, never silent.

**Every invocation delivers all four, in order — none is optional:**

1. the message (clipboard + printed);
2. the changelog fragment WRITTEN to disk (default ON — see the fragment
   section for the only skip conditions);
3. the exact command plan printed in one fenced block;
4. ONE consent question under that plan.

Stopping after the message alone is an incomplete run; running git without
the yes (or a configured auto policy) is a violation.

## Read the changes

FIRST, before any branching below: files in `<changelog.dir>/` (default
`changes/`) whose `scope` frontmatter matches paths in the current
uncommitted change are pending-fragment METADATA of that change, not part
of it — exclude them from the substantive scope in EVERY case (staged,
unstaged, no-HEAD, no-repository); they never drive the message or a
mixed-concern split, and they route to the fragment section's
reuse/replace check.

0. `git rev-parse --is-inside-work-tree` — **not a repository? Don't halt.**
   The whole directory is the change: derive the message from the files
   themselves (read them; survey the tree first if many), skip steps 1–4
   below (they require a repository), and follow the no-repository path
   when offering to commit (below).
1. `git status --porcelain` — what's staged, unstaged, untracked.
2. Anything staged → describe ONLY the staged changes (`git diff --cached`).
   Staged is what the commit will contain; unstaged noise is not your business.
3. Nothing staged → describe all uncommitted work: `git diff HEAD` plus
   untracked files (read them if small, `--stat` view if large). Repo with
   no commits yet (`HEAD` unresolvable) → `git diff HEAD` fails and
   everything is untracked: read the files directly, same as step 0.
4. `git log --oneline -15` — absorb the repo's vocabulary and format habits
   (skip when there is no history).
5. Session context tells you intent; the diff tells you what actually changed.
   On conflict, the diff wins.

Large diff: read `--stat` first, then open only files whose purpose the stat
doesn't reveal.

## Format

`<type>(<scope>)!: <imperative description>`

- **Types:** feat, fix, refactor, perf, docs, test, chore, build, ci, style,
  revert. Choose by what the change does, not where it lives. The common
  confusion: feat = new capability, fix = wrong behavior corrected,
  refactor = same behavior, new shape.
- **Scope:** diff confined to one package/app/area → its short name
  (`packages/data` → `data`, `apps/dashboard` → `dashboard`). Multiple areas →
  omit scope. Never invent junk scopes like (core) or (misc) — an
  uninformative scope is worse than none.
- **`!`** after type/scope when the change breaks consumers: removed or renamed
  public API, changed behavior callers rely on, schema/format change.
- **Description:** imperative mood ("add", "fix", "remove" — not "added",
  "adds"), lowercase start (acronyms and proper nouns keep their caps),
  ≤50 chars when possible, hard cap 72, no trailing period.
- **Language:** English. Reuse the project's own vocabulary from the diff and
  the log — package names, task IDs (MC-1, RA-14), domain terms
  (materialize, watermark). The message should read like the team wrote it.

## One line — hard rule

No body. A breaking change is carried by `!`, not prose. Only exception:
breaking/security/migration cases where one line cannot hold the essential
warning — then at most ONE body line, blank-line separated (spec format):

```
feat(api)!: rename /v1/orders to /v1/checkout

BREAKING CHANGE: /v1/orders returns 410 after 2026-06-01
```

Never more than that.

## Mixed-concern diffs

When the diff contains genuinely unrelated changes, produce two outputs:

1. **Default message** — one line covering everything honestly. Same type:
   concatenate with `+` (`docs: lease spec + entity bridge design`).
   Different types: lead with the dominant type
   (feat > fix > refactor > perf > docs > test > chore) and `+` the rest.
2. **Split suggestion** — after the message, propose the cleaner history.
   Each suggested commit is a pair of ready-to-run commands — `git add` with
   its exact files, then `git commit -m` — in its own fenced code block so
   the user can click-copy and run the whole pair. If the session is working
   in a worktree or a non-main branch checkout (compare `git rev-parse
   --show-toplevel` / `pwd` with where the user's shell likely sits), open
   with a `cd` block to that path so the commands land in the right tree:

   ````
   Better as 2 commits:

   ```bash
   cd /path/to/worktree
   ```

   1.
   ```bash
   git add packages/data/src/watermark.ts
   git commit -m "fix(data): guard null watermark"
   ```

   2.
   ```bash
   git add docs/architecture/lease.md
   git commit -m "docs: pipeline lease spec"
   ```
   ````

   Every changed file appears in exactly one suggested commit. Skip this
   section entirely for single-concern diffs — don't manufacture splits.

## Never in the message

- "This commit...", "I", "we", "now", "currently" — the diff already says what
- AI attribution ("Generated with Claude...") — unless the repo's own rules
  require a trailer
- Emoji (unless the repo's log shows that convention)
- File names the scope already implies

## Deliver

Both steps, in order — neither substitutes for the other:

1. Copy to clipboard via the Bash tool (skip silently if `pbcopy` unavailable):

   ```bash
   pbcopy <<'EOF'
   <message>
   EOF
   ```

2. Print the message in your FINAL text response, alone in its own fenced
   code block, so the user sees it and can click-copy it. The pbcopy tool
   call is invisible to the user — a message that only appears inside the
   heredoc was never delivered. Then say it's on the clipboard.

If a commit is later executed (or declined after staging discussion), append
the outcome — message, files, committed-or-not — to
`.skills/supermodo/commit/<YYYYMMDD-HHMMSS>.md` per
`../protocols/references/reports.md` when the directory exists (a configured
project); skip silently in unconfigured repos.

**Then publish it** per `../protocols/references/reports.md`: invoke
`node <skills>/reports/scripts/render.ts --report <that path>` and NAME the
page in your final message. Standalone runs only — inside a `flow` run the
orchestrator renders the run page and stages render nothing.


## Changelog fragment (default ON)

The model writing the commit is the one holding the full context of what
changed and why — capture the user-facing changelog line NOW, so `release`
never has to reconstruct it from one-line subjects. Governed by `changelog`
in `skills.config.json` (see `../protocols/references/config.md`): default
ON, in configured and unconfigured repos alike. Skip ONLY when
`changelog.fragments` is `false` or the invocation carries `--no-changelog`
(also skip for diffs that are pure release bookkeeping — version bump +
changelog edits — a release commit never gets a fragment of itself).

Write ONE fragment file once the message is FINAL — at delivery time for a
message-only run; if the offer flow below later reconciles the scope and
changes the description (step 2), rewrite the fragment from the final
description (delete the stale file — never two fragments for one commit).
Before writing, check `<changelog.dir>/` for a pending fragment from a
previous invocation whose `scope` frontmatter exactly matches the current
substantive paths. A path match only NOMINATES the candidate — paths
don't uniquely identify a change (the user may have abandoned one edit
and started another in the same files). Identity is confirmed only when
the fragment's prose still accurately describes the current diff; then
reuse or replace that one file (stating its path) — never accumulate a
second fragment for an unchanged uncommitted scope. No `scope`, a
non-matching one, or prose that no longer fits the diff → the fragment is
UNTOUCHABLE: leave it and ask the user. Target, in `<changelog.dir>/`
(default `changes/`, created if missing):

```
changes/<YYYYMMDD-HHMMSS>-<slug>.md
```

`<slug>` = kebab-case from the description. Content:

```markdown
---
bump: patch | minor | major     # from the commit type: feat → minor,
                                # fix/others → patch, `!`/BREAKING → major
                                # (0.x alpha: breaking → minor)
section: Added | Changed | Fixed | Deprecated | Removed | Security
scope: ["path/a.ts", "path/b.md"]  # the substantive files of the change —
                                   # the CANDIDATE key for reuse/replace;
                                   # identity also needs the prose to
                                   # still describe the current diff
---

<1–3 sentences for USERS of the project: what changed for them, not how.
Written in Keep-a-Changelog voice — this text lands in the changelog
almost verbatim at release time.>
```

The fragment is part of the change: when the agent commits (below), stage
it with the commit's files; when the user declines (message only), leave
the fragment in the working tree and NAME it in the final response so the
user includes it in their manual commit. One commit, one fragment — never
retro-write fragments for past commits.

## Offer to commit (after the message)

Consent policy comes from `confirmations` in `skills.config.json` (see
`../protocols/references/config.md`). Rule: consent to MUTATE is only ever
asked under a fully shown command plan; a scope-selection question mutates
nothing and merely decides what that plan will contain. In order:

1. **Classify — read-only.** `git status --porcelain`; nothing runs here:
   - **(a) Message describes the staged diff** (the staged-changes path of
     "Read the changes"): the index IS the commit — the plan will be the
     `git commit -m …` line, plus one `git add -- <fragment-path>` when a
     changelog fragment exists; the user's already-staged paths are NEVER
     re-added. A mixed-hunk file (staged + unstaged hunks) whose staged
     hunks the message describes stays in this case: plain `git commit`
     takes only the staged hunks, and the plan never re-adds that file.
   - **(b) Index empty, message describes the working tree:** the plan
     will be `git add <paths>` (fragment included) + `git commit -m …`.
   - **(c) Mismatch:** the index holds changes the message does NOT
     describe — the user's own in-flight work. SELECT SCOPE first: name
     the exact paths and ask a CLOSED MENU per the questions protocol
     (default and recommended: stop) — keep the index as-is and commit it
     (message will be regenerated to describe it) / also include a WHOLE
     path (the plan gains its `git add`; `git add` is path-level — first
     show every unstaged hunk it would capture, and if the user wants
     only a subset, STOP and let them stage hunks themselves, e.g.
     `git add -p`; never present path-level `git add` as selecting
     hunks) / plan an unstage of the undescribed paths
     (`git restore --staged`) / stop. The answer only shapes the plan —
     no git command runs during selection. Never resolve (c) silently,
     not even in auto mode.
2. **Reconcile message + fragment with the final scope.** If the chosen
   scope differs from what the message was derived from — typically after
   case (c) — regenerate or explicitly reconfirm the message against the
   final scope, and rewrite the changelog fragment from the final
   description (one fragment, final slug, stale file deleted). The
   message must describe the commit that will actually happen.
3. **Show the exact command plan** for that scope — EVERY git/index
   mutation as a literal line in one fenced block: any
   `git restore --staged <path>`, any `git add <path>` (explicit paths
   only, the fragment's exact path among them — never `git add -A` / `.`),
   then the `git commit -m …`. Case (a): the fragment add (if any) plus
   the commit line. (Fragment file operations are not git mutations and
   live outside the plan: the skill may create, rewrite, or delete ONLY
   the fragment file this invocation authored, or the ONE prior pending
   fragment positively identified — per the fragment section's check — as
   describing this same still-uncommitted change, named by its exact
   path. Every other workspace file is untouchable.)
4. **Ask, under the shown plan.** Default `ask`: a SIMPLE CONFIRMATION per
   the question protocol (`../protocols/references/questions.md`) — one
   plain line, the default named, no ordered-choice list. Example:

   > Run exactly these commands? No push. (default: no — message only)

   **Decline (the default) → done.** Message only. Never touch git state.
   With `confirmations.mode: "auto"` (or `perSkill.commit: "auto"`), skip
   this question and proceed — the plan is still shown, and a case-(c)
   scope selection still HALTS for its explicit answer (auto mode never
   sweeps user changes in silently).
5. **Execute the plan verbatim.** The explicit yes (which overrides any
   standing no-commit policy for exactly the shown plan and THIS commit
   only) or the configured auto policy authorizes the shown lines and
   nothing else. Run them in order, with one mandatory checkpoint: after
   the staging/unstaging lines (case (a): after the fragment add) — preview
   the staged diff (`git diff --cached --stat`, then the full
   `git diff --cached`); anything unexpected → stop and ask before
   running the commit line. Never amend, never `push`, never force. One
   commit.

**No repository yet** (step 0 of "Read the changes"): same order, and
`git init` is its OWN consent gate — NEVER covered by
`confirmations.mode: "auto"`. Step 3's fenced plan opens with `git init`,
step 4's question names the init explicitly, and execution stays verbatim:
`git init` → the staging lines → the staged-diff preview → the commit
line. The yes covers exactly the shown plan; nothing runs without it.

Still never: `push`, `merge`, `rebase`, `amend`, force-anything, or any git
mutation not covered by the authorization above — the explicit yes or the
configured auto policy (`git init` and case-(c) scope resolution: explicit
answers only, always).

## Flow integration

When invoked by the `flow` orchestrator, commit is **stage 8** (final):

- **Diff scope is the flow baseline.** Flow records the git status/diff
  baseline before stage 1; the message is generated ONLY from flow-owned
  changes (including librarian's stage-1/7 doc edits), never from pre-existing
  user changes in the tree. Read the baseline from the run state
  (`.skills/supermodo/runs/<run-id>/state.json`).
- **Ambiguous overlap → ask, don't guess.** If flow-owned changes overlap or
  interleave with pre-existing user changes (mixed hunks, shared files), stop
  and ask the user rather than deciding what belongs to the flow.
- Write the stage report per `../protocols/references/reports.md` to
  `.skills/supermodo/runs/<run-id>/08-commit.md` (`skill: commit`, `status`,
  `summary` = the message + whether a commit was made or just proposed).
- The ask-to-commit prompt and its safety steps above are unchanged in flow;
  decline default still means message only.

## Examples

Staged diff: rounding bug fixed in invoice totals
✅ `fix(billing): round invoice totals half-up`

Staged diff: new CSV export module in packages/data with tests
✅ `feat(data): add csv export for fact tables`

Unstaged diff: crash guard in config loader + unrelated README quickstart
✅ `fix: guard empty config on boot + docs quickstart`
…followed by a 2-commit split suggestion.
