# commit — Conventional Commits messages, opt-in commits

Generates a one-line [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
message from your actual git changes, then offers to run the commit for you.
The message is always the deliverable; running the commit is an opt-in extra
— never the default, never silent.

## When to use

"Commit message", "write a commit", "cm", or just `/supermodo:commit` when
work is finished.

## How the message is built

- Anything staged → it describes **only** the staged changes (that's what
  the commit will contain). Nothing staged → all uncommitted work.
- The recent log is read to absorb your repo's vocabulary and habits; the
  diff always wins over session context.
- Format: `<type>(<scope>)!: <imperative description>` — one line, ≤50 chars
  when possible, no trailing period, no AI attribution, no junk scopes. The
  only body ever allowed is a single `BREAKING CHANGE:` line when one line
  can't hold the warning.
- **Mixed-concern diffs** get two outputs: one honest combined message, plus
  a split suggestion with ready-to-run `git add` + `git commit` command
  pairs per suggested commit.

The message is copied to your clipboard and printed in a code block.

## Changelog fragments (default ON)

The model writing the commit holds the full context of what changed and why
— so alongside the message it writes a small **changelog fragment**
(`changes/<timestamp>-<slug>.md`): a bump hint, a Keep-a-Changelog section,
and 1–3 user-facing sentences. At release time, [release](release.md)
builds the changelog entry from these fragments near-verbatim instead of
reconstructing intent from one-line commit subjects, and deletes them in
the release commit (the [changesets](https://github.com/changesets/changesets)
pattern).

The fragment is committed together with the change. Opt out per invocation
with `--no-changelog`, or permanently with `changelog.fragments: false` in
the config (`changelog.dir` moves the folder).

## The offer to commit

After the message, consent to run git is only ever asked under a fully
shown command plan:

1. Classifies the index read-only and settles scope. Message written from
   your staged diff → the plan commits that index verbatim (your staged
   paths are never re-added; only the changelog fragment gets its own
   `git add`; a mixed-hunk file is safe — commit takes only its staged
   hunks). Index empty → normal `git add` + `git commit` plan. Index
   holding work the message doesn't describe → it names the paths and
   asks keep-as-is / include / unstage / stop — a scope question that
   runs nothing; your in-flight work is never swept in silently, even in
   auto mode. If the scope changes, the message and fragment are
   regenerated to match the commit that will actually happen.
2. Shows every mutation as a literal command line (any unstage, any
   explicit-path `git add`, the `git commit`), then asks one plain
   question under that plan (default: **no** — message only). Your yes
   authorizes exactly the shown lines, this commit only.
3. On yes: runs the plan verbatim, previewing the staged diff before the
   commit line (anything unexpected halts). Never push, amend, merge,
   rebase, or force-anything.

With `confirmations.mode: "auto"` in the config (or `perSkill.commit`), the
question is skipped but every safety step still runs and still halts on
conflicts.

**Fresh folder, no repository yet?** It still works: the message is derived
from the files themselves, and the offered command plan opens with
`git init`. Initializing a repository is its own explicit question — never
skipped, even in auto mode.

A standalone commit writes no report and opens no page: the commit is already
the record, permanent and diffable, and a browser tab per commit would be an
interruption charged against the most frequent action in the toolkit. See
[reports.md](reports.md).

The exception is a commit that **failed after staging** — rejected by a hook,
a signing error, anything. Then there is no commit to be the record, and you
have a half-staged tree to sort out, so you do get a report and a page: the
message, every command marked ran or not-run, the error, and what state the
index was left in.

In `flow`, commit is stage 8: the message is generated only from the run's
own baseline diff, ambiguous overlap with your pre-existing changes is
asked about, never guessed, and the stage report is written like every other
stage — there it is how the run hands off, not a copy.

Requires: `protocols`; uses `skills.config.json` when present.
