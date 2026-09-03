---
bump: minor
section: Changed
scope: ["skills/release/scripts/release-check.ts", "skills/release/SKILL.md", "skills/release/rules-templates/pull-request.md", "skills/release/rules-templates/light.md", "skills/config/scripts/config-check.ts", "skills/protocols/references/config.md", "skills/protocols/references/rules.md", "docs/release.md", "scripts/fixtures/release-state-probe.mjs", "scripts/check.ts"]
---

The release preflight now works out your process ONCE, and gathers only state
on every run after that.

**State, every run.** It establishes the version from git before it looks at
your checkout: every release tag, both long-lived branches and their
remote-tracking counterparts, with the version file and changelog resolved at
each — refreshing the remote first. That catches what a checkout cannot see,
each as a blocker with its repair command beside it: a hotfix tagged on the
main branch while you stand on dev, a branch behind its remote, a missing
back-merge, and a version file declaring less than something already
published. Under a squash workflow the unreleased range is bounded by the last
back-merge rather than the last tag, so a `feat:` released three versions ago
no longer inflates today's patch into a minor. There is no flag to skip the
fetch — offline degrades to a warning that says only local refs were checked.

**Process, once.** With no `.supermodo/rules/release.md` the preflight
proposes your process — branches, tag prefix, merge strategy, version file,
changelog, forge, whether the main branch looks protected, and what your CI
already does — each line carrying the evidence it was read from. If CI owns
versioning (release-please, semantic-release, changesets) that is called out,
because a manual release would fight it. You confirm or correct, it is written
to the rules file and the config, and later runs read it instead.

**Commands are rendered; their order is yours.** The preflight emits named
steps with your real branch names, remote, version, tag and paths already
substituted. When you have a rules file it names the order and no default
order is offered beside it; without one, the shipped default applies.

**The skill renders git; it does not invent your forge's commands.** Every
command it prints is pure git (plus a POSIX `awk` that extracts the changelog
entry for whatever publishes it), rendered from your real branch names,
remote, version, tag and paths. The steps it cannot render honestly —
publishing a release, opening a change request, waiting for an approval — are
marked as yours and carry no commands, because the set of forges is not
enumerable and a `gh` command guessed at a Gitea project reads as verified
right up until it fails. Instead the preflight reports the evidence: every
remote URL verbatim, what your CI already does, whether merges on the main
branch look like requests, and any release documentation the repository
already has. You write those steps into the rules file once, in your own
words. A `request-based` template ships as a starting point for a protected
main branch.
