---
bump: minor
section: Added
scope: ["README.md", "docs/flow.md", "skills/flow/SKILL.md", "skills/flow/evals/evals.json", "skills/flow/rules-templates/standard.md", "skills/flow/roles/plan-author.md", "skills/flow/roles/plan-reviewer.md", "skills/flow/sequence.json", "skills/protocols/references/models.md", "skills/protocols/references/reports.md", "skills/reports/scripts/lib/scan.ts"]
---

**Plan review before any code.** `flow` gains a mandatory stage 1b: right
after intake writes the plan, a model of another lineage reviews it read-only.
On REVISE the plan is revised and re-reviewed, up to five rounds, then you
decide. If the reviewer cannot run, flow offers a replacement you pick — an
equivalent model first, or a same-lineage one clearly labelled as weaker.
The shipped `flow` rules template changes accordingly (new `--from
plan-review` entry too).
