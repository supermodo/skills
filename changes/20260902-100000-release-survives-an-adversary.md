---
bump: minor
section: Fixed
scope: ["skills/release/scripts/release-check.ts", "skills/config/scripts/config-check.ts", "skills/config/scripts/rules-check.ts", "scripts/fixtures/release-state-probe.mjs", "scripts/check.ts"]
---

A second adversarial pass — this one by an independent model — found nine more
ways the release preflight could be confidently wrong. All nine produced a
plausible-looking result rather than an error.

- **A mid-cycle `main → dev` sync is no longer mistaken for a release
  boundary.** The unreleased range was bounded at "the newest merge whose
  second parent `main` contains", which matches any routine sync — and taking
  one as the boundary EXCLUDED everything before it. A team that synced after a
  `feat:` landed got a patch bump and "ready" while the feature went
  unreleased. The second parent must now BE the released commit; otherwise the
  range falls back to the tag, which can only over-count.
- **Paths are quoted.** `docs/My Changelog.md` is a legal path, and it was
  interpolated bare into `git add` and `awk`, splitting into two arguments —
  and had `docs/My` existed, it would have staged the wrong file under a plan
  calling itself verified. Ordinary paths stay unquoted so the plan stays
  readable.
- **A tag whose name and contents disagree is no longer authoritative.** A
  `v1.0.0` cut on the wrong commit was accepted while the report printed the
  contradiction plainly; every downstream number trusts that tag.
- **Every remote is fetched, and `release.remote` selects the canonical one.**
  Tags share a single namespace, so a release published at `upstream` was
  invisible to a checkout that only fetched `origin` — a fork was offered a
  version BELOW what upstream had already published.
- **An operation already in progress halts the release.** A half-finished merge
  leaves an empty `git status` but a live `MERGE_HEAD`, and the release's own
  commit would have COMPLETED it, turning someone else's merge into the release
  commit. Merge, rebase, cherry-pick, revert, bisect and sequencer state are all
  checked.
- **A tag prefix can prefix a DIFFERENT convention.** With `tagPrefix: "v"`,
  the tag `version2.0.0` starts with `v` so it was not "foreign", and
  `ersion2.0.0` is not semver so it was not a release tag either — it fell
  through both and `2.0.0` stayed invisible, making the proposed `1.0.1` a
  rollback. Recognition is now "prefix AND parses as semver", and an
  unrecognised tag carrying a version at or above what IS recognised halts.
- **Declining to guess no longer leaves a project with no plan.** A scheme the
  tool refuses to bump (CalVer, four-part) produced "ready: preflight clean"
  and ZERO steps — nothing to run and no way to proceed. `--version <chosen>`
  supplies what the tool declined to invent, and the steps render from it.
- **Line endings no longer decide the workflow.** The rules-file frontmatter
  parser matched LF only, so a file checked out with CRLF (Windows,
  `core.autocrlf`) had its `template:` go unread — the project's declared
  workflow silently became the default one, and its own stabilization branch
  then blocked as "not dev". BOM and CRLF are normalized in both the release
  preflight and `rules-check`.
- **A stabilization branch that exists only on the remote still counts.** A
  fresh clone has no local `release/*`, so the hotfix rejoin — an invariant —
  was silently skipped in the commonest checkout of a full-flow project.
