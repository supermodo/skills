---
rule: release
description: protected main; the release lands through a change request
template: request
summary: >
  The main branch is protected, so the release lands through a change request
  instead of a direct merge. Bump and changelog are committed on dev, pushed,
  and opened as a request; once it is approved and green it is merged, main is
  pulled locally, and only then is the tag created and pushed. Publishing is
  whatever this project uses — fill in the command below.
---

## Process

1. Preflight: on dev, clean tree, version and changelog agree, tiers green.
   Any blocker stops the release.
2. Bump the version and write the changelog entry from the fragments.
3. Commit the bump on dev and push it, so the request has something to review.
4. Open the request dev → main, titled for the release, described from the
   changelog entry. **Replace this line with the command your forge uses** —
   the skill renders git, not your forge's CLI.
5. Wait for approval and green checks. Neither is the skill's to bypass: if
   the request cannot be merged, the release stops here and says so.
6. Merge the request, then bring main up to the merged state locally.
7. Tag that commit and push the tag alone — main is already pushed by the merge.
8. Publish the release from the changelog entry (`extract-notes` puts it in
   `$NOTES`). **Write the actual command here** — or delete this step if the
   tag is the release, or if CI publishes it.
9. Merge main back into dev. This is part of the release, not cleanup.

## Branch topology

Two long-lived branches, `main` protected. Nothing is ever pushed to `main`
directly — that is the point of this variant, and the reason the direct-merge
steps do not appear above.

## Version bump rules

From the Conventional Commits since the last release: `!`/`BREAKING CHANGE`
major, `feat` minor, everything else patch. On 0.x, breaking demotes to minor.

## What the CI owns

If CI tags, publishes the release, or owns the version outright
(release-please, semantic-release, changesets), delete the steps above that it
performs and say so here. Two things doing step 7 is how a tag gets moved.
