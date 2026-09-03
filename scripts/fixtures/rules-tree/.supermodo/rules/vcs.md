---
rule: vcs
applies-to: [commit, release, work]
description: Jira key linkage, branch naming, MR title format
template: vcs
template-version: 0.7.0
---

## Issue linkage

Branches are named `<type>/<KEY>-<slug>`. The key appears in the commit
subject, the MR title, and the release notes for its fix-version.
