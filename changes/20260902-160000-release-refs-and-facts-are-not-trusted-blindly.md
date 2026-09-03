---
bump: minor
section: Fixed
scope: ["skills/release/scripts/release-check.ts", "skills/config/scripts/config-check.ts", "scripts/fixtures/release-state-probe.mjs", "scripts/check.ts"]
---

A final adversarial pass found six more defects, one of them a security issue
in the part of the skill whose whole purpose is to be pasted into a shell.

- **A ref is not a shell token.** `git-check-ref-format` permits `;`, `$`, `&`,
  `|`, `<`, `>`, `(`, `)`, `!` and quotes in a branch name, so `dev;id>/tmp/x`
  is a branch git creates without complaint — and the plan rendered
  `git merge --squash dev;id>/tmp/x` for someone to paste. Refs are now quoted
  exactly as paths are, config validation rejects shell syntax in a ref, and
  the repair lines (which print even when blocked) are quoted too.
- **Facts and commands must describe one repository.** An inherited `GIT_DIR`,
  `GIT_WORK_TREE` or `GIT_INDEX_FILE` silently redirects every git call, so the
  reported state would describe one repository while the commands act on
  another. Now a blocker.
- **A configured `release.remote` that does not exist** is a blocker rather
  than a plan full of pushes to nothing.
- **A branch checked out in another worktree** is a blocker: git refuses to
  switch to it, so the plan would stop at its first command.
- **Tag integrity covers the changelog too.** The tagged commit's changelog was
  read and then never compared with the tag's own name.
- **A signed-tag policy reports on its own baseline.** `tagStyle: "signed"`
  with a lightweight last tag now says so, rather than implying a compliance it
  never checked.
