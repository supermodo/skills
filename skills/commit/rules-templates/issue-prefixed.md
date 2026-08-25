---
rule: commit
description: Conventional Commits prefixed with the tracker key from the branch
template: issue-prefixed
summary: >
  Message: `[KEY] type(scope): description`, the key taken from the branch
  name via `vcs.issueKey.pattern` in skills.config.json.
  A branch with no key stops and asks rather than guessing one.
  A changelog fragment is written for every commit.
  The exact command plan is shown, then one consent question under it.
---

## Process

1. Read the change, as in the default process.
2. Extract the issue key from the current branch with `vcs.issueKey.pattern`.
   No match → stop and ask; never invent or omit a key silently.
3. Compose the subject with `vcs.issueKey.template`
   (default `[{key}] {type}: {subject}`).
4. Write the changelog fragment from the final description.
5. Show the exact command plan; ask under it; execute verbatim.

## Message format

`[<KEY>] <type>(<scope>)!: <imperative description>`, one line. The template
comes from config and is validated there: it may not carry quotes, backslashes
or shell metacharacters, because the subject is printed as a single-quoted
`git commit -m '…'` line. The skill's own no-apostrophe rule covers the
description; the same applies to the key.

## Trailers

None by default. A project that requires `Refs:` or `Signed-off-by:` adds it
here, one trailer per line, and the skill appends them to every commit.
