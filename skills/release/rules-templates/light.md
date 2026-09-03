---
rule: release
description: dev to main by squash, tag, push, forge release
default: true
template: light
summary: >
  Cut from dev into main by squash merge, tag, push, publish the forge release,
  then merge main back into dev.
  The bump comes from the Conventional Commits since the last tag.
  The changelog entry is built from the fragments commit wrote.
  The complete command sequence is shown before anything runs.
---

## Process

1. Preflight: on dev, clean tree, version and changelog agree, quality tiers
   green. Any blocker stops the release.
2. Bump the version and write the changelog entry from the fragments.
3. Commit the bump on dev.
4. Squash-merge dev into main; create the release commit.
5. Tag, then push main and that one tag — never `--tags`.
6. Publish the forge release from the changelog entry (skip when the
   project publishes none).
7. Merge main back into dev. This is part of the release, not cleanup:
   skipping it breaks the next cycle.

## Branch topology

Two long-lived branches. `main` only ever contains released states — it is what
installers and users consume; `dev` is the integration branch. No stabilization
branch.

## Version bump rules

From the Conventional Commits since the last tag: `!`/`BREAKING CHANGE` major,
`feat` minor, everything else patch. On 0.x, breaking demotes to minor.
