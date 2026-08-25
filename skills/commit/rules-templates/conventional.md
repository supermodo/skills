---
rule: commit
description: Conventional Commits, one line, no issue key
default: true
template: conventional
summary: >
  Message: Conventional Commits, one line — `type(scope)!: description`.
  Types: feat, fix, refactor, perf, docs, test, chore, build, ci, style, revert.
  A changelog fragment is written for every commit.
  The exact command plan is shown, then one consent question under it.
  Nothing runs without your yes.
---

## Process

1. Read the change: the staged diff if anything is staged, otherwise the whole
   working tree, plus the last 15 subjects for the repo's own vocabulary.
2. Compose one line: `type(scope)!: imperative description`, under 50 chars
   where possible, hard cap 72, no trailing period.
3. Write the changelog fragment from the final description.
4. Show the exact command plan in one fenced block.
5. Ask under the plan, then execute it verbatim.

## Message format

`<type>(<scope>)!: <imperative description>` — no body. A breaking change is
carried by `!`, not prose.

## Scope vocabulary

Derived from the diff: a change confined to one package or app takes that
package's short name; a change spanning several omits the scope entirely.

## Never in the message

- "This commit…", "I", "we", "now", "currently" — the diff already says what
- AI attribution ("Generated with Claude…") unless this repo's rules require a
  trailer
- emoji, unless the existing log shows that convention
- file names the scope already implies

## Body

None. A breaking change is carried by the marker. The single exception is a
breaking, security or migration case where one line cannot hold the essential
warning: then at most ONE body line, blank-line separated.

## Split suggestions

Offered whenever the diff holds genuinely unrelated changes, as ready-to-run
`git add` + `git commit` pairs. Never manufactured for a single-concern diff.
