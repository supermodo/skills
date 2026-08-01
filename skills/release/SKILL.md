---
name: release
description: "Run a versioned release with git-flow discipline: deterministic preflight (branch, clean tree, Conventional Commits since last tag → suggested semver bump), changelog entry written from fragments/commits into the changelog file automatically, then the exact squash-merge/tag/push/GitHub-release sequence printed and consent-gated by default (configurable auto mode). Two configurable modes: light (dev → main) and full git-flow (release/* stabilization + hotfix/* branches). Use for 'release', 'cut a release', 'ship a version', 'bump the version', 'publish vX.Y.Z', 'hotfix production' — whenever accumulated work should become a tagged, published version."
---

# release — versioned releases with git-flow discipline

> **Requires:** the sibling `protocols` skill (shared protocol masters); uses `skills.config.json` when present (`release` section — defaults apply without it). Missing protocols → tell the user to install the full supermodo package.

The message of this skill: **`main` only ever contains released states** (it is
what installers and users consume), so releasing is a deliberate, gated act.
Everything scriptable is scripted; git mutations pass a consent gate that
defaults to an explicit per-release yes (the yes IS the authorization, for
THIS release only) and can be relaxed to auto via `confirmations` in config.

> **Cross-tool note (Claude Code ↔ Codex).** Written in Claude Code idioms.
> Under Codex: run the same script with `node`, ask the questions in chat, and
> execute the same git sequences with your native shell tool.

## Configuration

`skills.config.json` → `release` section (all optional, defaults per
`../protocols/references/config.md`): `mode` (`"light"` default | `"full"`),
`branches.main`/`branches.dev`, `versionFile` + `versionPath` (where the
version lives — `package.json:version`, `.claude-plugin/plugin.json:version`,
…), `changelog`, `tagPrefix`, `mergeStrategy` (`"squash"` default |
`"merge"`), `githubRelease` (publish via `gh` after tagging).

## Step 1 — Preflight (deterministic, read-only)

**Establish where the release actually got to — from git, never from memory.**
A release is many steps (version bump, changelog, merge, tag, push, GitHub
release) and any of them may already have been run by the user or by an
earlier attempt. Read `HEAD`, the tags (local AND remote), the branches, and
`gh release list` before you say anything about state. NEVER report a step as
"still pending" or "never done" because you did not see it happen in this
conversation: a proposal that went unanswered in chat is not evidence of an
unchanged repository. If the tag exists, say so and continue from there —
re-running a completed step is how tags get moved and releases get
duplicated.

If `skills.config.json` exists, validate it FIRST (run the config skill's
`config-check.ts` or apply `../protocols/references/config.md`) — never feed
unvalidated values into git commands. Then run the bundled script, resolved
RELATIVE TO THIS SKILL FOLDER:

```
node <dir-of-this-SKILL.md>/scripts/release-check.ts [project-root]
```

(for hotfixes add `--hotfix`: it then expects `main` or an existing
`hotfix/*` branch instead of dev, and the bump is patch.)

It verifies: on the expected branch, clean tree, version file readable,
version ↔ changelog consistency, and that config-supplied refs/paths are
safe (no option-shaped values); it computes the **suggested bump from the
Conventional Commits since the last release tag** — the nearest tag matching
`tagPrefix`, reading full commit bodies so `BREAKING CHANGE:` footers count
(`!`/BREAKING → major, `feat` → minor, others → patch; alpha policy: on 0.x,
breaking demotes to minor). Two states it reports instead of guessing: a
**pre-bumped** tree (version + changelog already advanced past the last tag
→ release the DECLARED version, never bump again on top) and **no bump
signal** (no conventional commits in range → the user must choose; never
re-release the current version). The final JSON line is the machine-readable
result.

Blockers → report them and stop; never work around a blocker silently. If the
project has its own repo self-check (e.g. a `check` script), run it too — a
release never ships red. When `skills.config.json` defines them, also run
the configured quality tiers: `commands.testAll` (fallback `commands.test`)
and `commands.lint` (see `../protocols/references/tooling.md`). A red tier
is a preflight blocker like any other; an absent tier is reported as "not
gated", never silently assumed green.

## Step 2 — Write the release files (automatic file edits — no git)

Every `/release` run gets this far without asking: the version bump and the
changelog entry are ordinary, reversible working-tree edits — consent gates
git, not file drafting. Only two preflight states interrupt: **no bump
signal** (the user must choose the version — never re-release the current
one) and **pre-bumped** (release the declared version; write nothing).
Full mode: these writes happen AFTER cutting the `release/*` or `hotfix/*`
branch, on that branch — never on dev.

1. **Bump.** Adopt the script's suggestion. Sanity-check it against squash
   workflows first: commits that are dev-side pre-squash duplicates of
   content already released under the last tag are NOT bump evidence —
   count only work genuinely new since that release; state it when you
   correct the script.
2. **Changelog entry.** Sources, in order of preference:
   - **Fragments first.** When `changelog.fragments` is on (default — see
     `../protocols/references/config.md`), read every file in
     `<changelog.dir>/` (default `changes/`): each carries a bump hint, a
     Keep-a-Changelog section, and user-facing prose written by `commit`
     while the full context was live. Group by section, use the prose
     near-verbatim. Fragment bump hints are evidence for step 1's bump
     alongside the commit scan (the higher of the two wins).
   - **Commit subjects as fallback** for commits since the last tag that
     have no fragment — grouped Added / Changed / Fixed, written for users
     (what changed for them), not a raw `git log` dump. Non-conventional
     subjects still get summarized; never dropped silently.

   Draft the `## [x.y.z] - YYYY-MM-DD` entry from both.
3. **Write, then show.** Write the bump into `<versionFile>` and the entry
   into `<changelog>`, and delete the consumed fragments — file edits only,
   nothing staged, no git. Then print the full entry text and the version
   change (old → new) so the single consent question below is asked over
   the real artifacts. Changelog text is an artifact: full grammar
   regardless of verbosity setting. The user edits or overrides at the
   gate (their project, their number); a decline leaves the tree
   pre-bumped and uncommitted — report the state and the one-line revert
   (`git checkout -- <versionFile> <changelog> && git checkout -- <changelog.dir>` /
   re-run releases the declared version via the pre-bumped path).

## Step 3 — Execute (consent-gated, shown-then-run)

The gate follows `confirmations` in config (see
`../protocols/references/config.md`): default `ask` = explicit yes required.
With `confirmations.mode: "auto"` (or `perSkill.release: "auto"`) the
sequence runs without asking — every command is still printed as it
executes, and preflight blockers still halt. The only questions that
survive auto mode are the two preflight interrupts (no bump signal,
pre-bumped) — Step 2's writes are automatic in every mode.

Show the COMPLETE command sequence first (ALWAYS — even when the user will
decline; the printed plan is part of every run's deliverable, like commit's
command plan), then run it command by command,
stopping at the first failure and reporting exact state (which commands ran,
which didn't — half-done releases must be visible, never papered over).

**Light mode** (`dev` → `main`):

```bash
# on dev — Step 2 already wrote the bump, the entry, and the fragment
# deletions into the working tree; the sequence only stages and ships them:
git add <versionFile> <changelog> <changelog.dir>
git commit -m "chore(release): v<X.Y.Z>"
git switch <main>
git merge --squash <dev>            # squash stages; the commit below creates the release commit
git commit -m "release: v<X.Y.Z>"
git tag <tagPrefix><X.Y.Z>
git push origin <main> <tagPrefix><X.Y.Z>   # the branch and ONLY this release's tag — never --tags
git switch <dev>
git merge <main>                    # re-sync dev after squash — REQUIRED, skipping breaks the next cycle
git push origin <dev>
```

With `mergeStrategy: "merge"`, the squash+commit pair is replaced by ONE
command that creates the merge commit itself — a separate `git commit` after
`--no-ff` would find nothing to commit and abort the sequence:

```bash
git merge --no-ff <dev> -m "release: v<X.Y.Z>"
```

Then, when `githubRelease` is true (extract the entry, publish — always a
fresh mktemp file, never a fixed `/tmp` path):

```bash
NOTES=$(mktemp)
awk '/^## \[<X.Y.Z>\]/{f=1;next}/^## \[/{f=0}f' <changelog> > "$NOTES"
gh release create <tagPrefix><X.Y.Z> --title <tagPrefix><X.Y.Z> --notes-file "$NOTES"
```

**Full mode** adds two flows:

- `release` — cut a stabilization branch instead of merging dev directly:
  `git switch -c release/<X.Y.Z> <dev>` → bump + changelog commit there →
  only fixes may land on it while dev keeps moving → on user go-ahead:
  merge `release/<X.Y.Z>` into `<main>` (`--no-ff`), tag, push, GitHub
  release, merge back into `<dev>`, delete the release branch.
- `release --hotfix <slug>` — patch production without dragging dev along.
  Preflight runs with `--hotfix` (expects `<main>` or an existing
  `hotfix/*`). Then: `git switch -c hotfix/<slug> <main>` → fix + PATCH
  bump + changelog entry → merge into `<main>` (`--no-ff`), tag, push,
  GitHub release, merge into `<dev>`, delete the hotfix branch. If any
  `release/*` branches are open, the hotfix must also merge into the
  active one — exactly one open → use it; more than one → ASK the user
  which (never pick silently).

## Step 4 — worktree cleanup (suggested, never run)

Supermodo's worktree-per-task mode (`work`/`flow` `--worktree`, config
`workspace.worktree`) leaves one worktree + branch per task. After the
release sequence, run `git worktree list --porcelain` read-only; for every
worktree other than the main checkout whose branch is now fully merged into
`<dev>` or `<main>` (`git branch --merged`), PRINT — never run — the cleanup
pair, AFTER the merge/tag/push commands:

```bash
git worktree remove <path>
git branch -d <branch>          # -d refuses if not merged; never -D
```

Removing a worktree and deleting a branch are state the user owns (like
merge/push): release only ever suggests them. A worktree whose branch is
NOT yet merged is listed as "still open — not cleaned up", never force-removed.

## Hard rules

- In `ask` mode (default) NEVER run any of this without the explicit
  per-release yes; decline = report the preflight + proposal and stop. In
  `auto` mode, transparency replaces consent — print everything, halt on any
  blocker or failure.
- Never `push --force`, never rebase published branches, never amend
  published commits, never delete tags.
- Version bump and changelog entry always travel in the same commit — a
  release where they disagree must be impossible (the preflight enforces it).
- Consumed changelog fragments are deleted in that same release commit —
  a fragment is never counted into two releases. Fragments are read-only
  input until then; release never edits or rewrites them in place.
- The back-merge into dev after a squash release is part of the release, not
  optional cleanup.
- `gh` absent or unauthenticated with `githubRelease: true` → do everything
  up to the tag push, then report the GitHub-release step as NOT done with
  the ready-to-run command. Never silently skip it.
- **Persist the outcome** per `../protocols/references/reports.md`
  (standalone location): preflight result, proposed + chosen bump,
  changelog entry, and exactly which commands ran — so a half-done or
  declined release survives session loss. Then publish it per the reports protocol — render it with
  `node <skills>/reports/scripts/render.ts --report <that path>` and name the
  page in your final message (standalone runs only; inside `flow` the
  orchestrator renders the run page).

## What this skill is not

Not a commit generator (that's `commit`), not CI, and not a substitute for
the project's own checks — it sequences and gates; the project's gates still
gate.
