---
rule: release
description: git-flow with release/* stabilization and hotfix/* branches
template: full
summary: >
  Cut a release/X.Y.Z branch off dev and stabilize there while dev keeps moving.
  Only fixes land on that branch; no new features after the cut.
  Then merge into main with a merge commit, tag, push, publish the release,
  and merge back into dev. Hotfixes branch from main and rejoin both.
  The complete command sequence is shown before anything runs.
---

## Process

1. Preflight: on dev, clean tree, version and changelog agree, tiers green.
2. Cut `release/X.Y.Z` off dev. No new features land on it after this point.
3. Bump the version and write the changelog entry on that branch.
4. Only fixes may land on the release branch while dev keeps moving.
5. On go-ahead: merge into main with `--no-ff`, tag, push, publish.
6. Merge back into dev, then delete the release branch.

## Hotfix process

Branch `hotfix/<slug>` from main, patch bump, merge into main with `--no-ff`,
tag, push, publish, merge into dev, delete the branch. Any open `release/*`
branch must receive the hotfix too — exactly one open, use it; more than one,
ask which.

## Branch topology

`main` holds released states only, `dev` integrates. Ephemeral `release/X.Y.Z`
and `hotfix/<slug>` branches are named from the version the skill already
holds.
