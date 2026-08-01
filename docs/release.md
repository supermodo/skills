# release — versioned releases with git-flow discipline

Runs a versioned release as a deliberate, gated act. The core idea: **`main`
only ever contains released states** (it is what installers and users
consume). Everything scriptable is scripted; git mutations pass a consent
gate that defaults to an explicit per-release yes.

## When to use

"Cut a release", "ship a version", "bump the version", "publish vX.Y.Z",
"hotfix production" — whenever accumulated work should become a tagged,
published version.

## The three steps

1. **Preflight (deterministic, read-only).** A bundled script verifies:
   right branch, clean tree, version file readable, version ↔ changelog
   consistency — and computes the **suggested semver bump from the
   Conventional Commits since the last tag** (`!`/BREAKING → major, `feat` →
   minor, others → patch; on 0.x, breaking demotes to minor). It also
   detects a pre-bumped tree (release the declared version, never re-bump)
   and the no-signal case (you choose). When the config defines them, the
   quality tiers also run: `commands.testAll` (fallback `commands.test`)
   and `commands.lint` — a red tier blocks the release; an absent tier is
   reported as "not gated", never assumed green. Blockers stop the release
   — never worked around silently.
2. **Propose (judgment, no mutations).** The bump suggestion with the commit
   list as evidence (you may override), plus a drafted changelog entry. The
   entry is built **fragments-first**: the changelog fragments
   [commit](commit.md) wrote (default ON) carry user-facing prose authored
   while the full context was live and are used near-verbatim; commit
   subjects since the last tag fill in for fragment-less commits — grouped
   Added/Changed/Fixed, written for users, not a raw log dump. You approve
   or edit both.
3. **Execute (consent-gated, shown-then-run).** The complete command
   sequence is shown first, then run command by command, stopping at the
   first failure with exact state reported — half-done releases are visible,
   never papered over. Includes the GitHub release (`gh release create` from
   the changelog entry) when configured, and the required back-merge into
   dev after a squash release.

## Modes

- **Light** (default): `dev` → `main` squash (or merge), tag, push, GitHub
  release, back-merge into dev.
- **Full git-flow**: adds `release/*` stabilization branches (only fixes
  land while dev keeps moving) and `release --hotfix <slug>` for patching
  production without dragging dev along.

## Configuration

The `release` section of `skills.config.json` (all optional — defaults
apply): `mode`, `branches.main`/`branches.dev`, `versionFile` +
`versionPath` (where the version lives — `package.json:version`, a plugin
manifest, …), `changelog`, `tagPrefix`, `mergeStrategy`
(`squash`/`merge`), `githubRelease`. With `confirmations.mode: "auto"` the
sequence runs without the per-release yes — every command still printed,
blockers still halt.

## Hard rules

Never `push --force`, never rebase published branches, never amend published
commits, never delete tags. Version bump and changelog entry always travel
in the same commit — and consumed fragments are deleted in that same commit,
so a fragment is never counted into two releases. The outcome (including declined or half-done releases)
is persisted so it survives session loss.

Not a commit generator (that's [commit](commit.md)), not CI, not a
substitute for your project's own checks.

Requires: `protocols`; uses `skills.config.json` when present.
