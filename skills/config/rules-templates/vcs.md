---
rule: vcs
applies-to: [commit, release, work]
description: Issue-key linkage, branch naming, and merge-request conventions
template: vcs
summary: >
  One cross-cutting file for the conventions that span more than one skill:
  how branches are named, where the tracker key comes from, and where it
  must appear downstream — commit subjects, merge-request titles, release
  notes. Written once so the skills that consume it cannot drift apart.
  A branch with no key stops and asks rather than guessing one.
---

## Branch naming

`<type>/<KEY>-<slug>` — for example `feature/PROJ-412-csv-export`. The key is
extracted by `vcs.issueKey.pattern` in `skills.config.json`.

## Where the key must appear

- The commit subject, via `vcs.issueKey.template`.
- The merge-request title.
- The release notes, grouped by the tracker's fix-version.

## When a branch carries no key

Stop and ask. Never invent a key, and never silently omit one — an unlinked
commit is invisible to the tracker, and nobody notices until the release notes
are wrong.
