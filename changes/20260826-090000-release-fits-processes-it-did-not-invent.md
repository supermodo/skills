---
bump: minor
section: Fixed
scope: ["skills/release/scripts/release-check.ts", "skills/config/scripts/config-check.ts", "skills/config/scripts/config-check.ts", "skills/protocols/references/config.md", "scripts/fixtures/release-state-probe.mjs", "scripts/check.ts", "skills.config.json"]
---

An adversarial pass found the release preflight still assuming `v` + `x.y.z` +
`dev → main` were facts about git rather than one project's names. Seven
failures, four of which produced a confident wrong number instead of an error.

- **Version files that are not JSON now work.** `Cargo.toml`,
  `pyproject.toml`, `gradle.properties`, a Python `__version__`, a bare
  `VERSION` file — previously every one of them reported "cannot read version",
  excluding most of Rust, Python and the JVM. JSON still uses `versionPath`;
  everything else is matched by shape, and the shape that matched is reported
  so a guess is visible as a guess. `release.versionPattern` overrides both.
- **Prereleases are understood.** `1.2.3-rc.1` parses and orders per semver.
  This mattered most for TAGS: a prerelease tag was invisible, so the preflight
  reported "no tags" and derived the bump from the entire history. It now
  suggests no next version for a prerelease and says why — rc.1 → rc.2 or
  rc.1 → release is the project's decision, not a derivable one.
- **Single-branch projects can release.** No `dev` branch is a process, not an
  error; the release happens on the main branch with nothing to merge or
  back-merge.
- **Tags that do not match `tagPrefix` are a HALT.** They used to yield zero
  tags silently, which made the unreleased range the whole history and let the
  suggested version land BELOW something already published — a monorepo tagging
  `pkg-a@1.0.0` was offered `0.1.0`. The blocker now names the tag it found.
- **The first release is the declared version.** With nothing tagged, a project
  declaring `0.1.0` was told to release `0.2.0` — a version with no changelog
  entry.
- **CI owning versioning halts the run.** release-please, semantic-release and
  changesets were detected and then noted in passing while the preflight still
  reported "ready" above a manual sequence that would fight them.
- **A shallow clone halts.** Every number here comes from history, and a
  truncated clone silently reported a shorter unreleased range.
- **Calendar and custom version schemes are supported rather than refused.**
  `2026.08.1` used to parse as semver — leading zeros are invalid per the spec —
  and a "minor bump" produced `2026.9.0` under "ready: preflight clean". Such a
  version is now read and reported, no next version is invented, and the checks
  that need ordering are named as SKIPPED rather than quietly passing.
- **A dependency's version is no longer mistaken for the package's.** In a
  sectioned file (`Cargo.toml`, `.cfg`, INI) the section in `versionPath` is
  honoured, so `package.version` no longer matches whichever dependency happens
  to be declared above `[package]`.
- **A changelog heading a version twice is flagged**, because the notes
  extraction stops at the next heading and would publish only the first block.
- **Two hostile config values are refused.** A `versionPattern` with nested
  quantifiers (`^((a+)+)$`) backtracks exponentially — it burned 19 seconds of
  CPU with the preflight merely appearing to hang, and JavaScript has no regex
  timeout, so `config-check` now rejects that shape. And a `versionFile` or
  `changelog` that reaches outside the project through a SYMLINK is blocked:
  the previous check rejected `..` and absolute paths, which a symlinked
  directory walks straight past.
