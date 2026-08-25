---
rule: commit
description: Conventional Commits with the Jira key from the branch name
template: issue-prefixed
template-version: 0.7.0
---

## Process

1. Derive the issue key from the current branch with `vcs.issueKey.pattern`.
2. Compose the subject as `[{key}] {type}: {subject}`.
3. Write the changelog fragment from the final description.
4. Show the command plan; ask; run it verbatim.
