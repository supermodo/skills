---
bump: patch
section: Fixed
scope: ["docs/commit.md", "skills/commit/SKILL.md", "skills/release/SKILL.md"]
---

`commit` and `release` now print every `git commit -m` with the message in
single quotes. An interactive shell reads a `!` inside double quotes as a
history expansion and refuses the line, so the commands carrying a breaking
change were exactly the ones that would not run when pasted.
