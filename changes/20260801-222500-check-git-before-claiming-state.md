---
bump: patch
section: Fixed
scope: ["skills/commit/SKILL.md", "skills/release/SKILL.md"]
---

`commit` and `release` no longer describe your repository from memory. If a
commit plan went unanswered, or a release stopped halfway, the skill now reads
git — `HEAD`, the working tree, local and remote tags, published releases —
before saying what has or has not happened. Previously an unanswered proposal
was treated as proof that nothing had changed, so work you had already
committed yourself could be reported as still pending, and a release step that
had already run could be offered again — which is how a tag gets moved or a
release gets duplicated.
