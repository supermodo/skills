# supermodo/skills

A coherent, opinionated toolkit for documentation-driven development with
twin-model adversarial checks, usable as a **Claude Code plugin** or via the
**skills CLI** (Codex and other agent CLIs).

## Install

**Claude Code (plugin — recommended):**

```
/plugin marketplace add supermodo/skills
/plugin install supermodo
```

**Codex / other tools (skills CLI):**

```
npx skills@latest add supermodo/skills
```

Both paths install the whole toolkit — the skills are a system, not a
grab-bag, and every skill verifies its dependencies at start. Updating,
running both installs side by side, and the install doctor:
[docs/installation.md](docs/installation.md).

## Quick start (first use in a project)

Three steps, in order:

```
/supermodo:config          # 1. bootstrap: interview, docs scaffold, skills.config.json
/supermodo:librarian       # 2. first lifecycle pass: reconcile docs with reality
/supermodo:flow            # 3. work: flow suggests the job and runs it spec → commit
```

From then on the loop is: ideas land in the backlog, `flow` takes the next
one from spec to commit, `librarian` keeps the docs true. Full walkthrough
(including absorbing pre-existing docs):
[docs/getting-started.md](docs/getting-started.md).

## The skills

Each name links to its full documentation (what it does, when to use it,
flags, behavior).

| Skill | What it does |
| --- | --- |
| [`config`](docs/config.md) ⚙︎ | **Core dependency.** Config keeper: show/validate/edit `skills.config.json`; bootstraps the project when none exists |
| [`protocols`](docs/protocols.md) ⚙︎ | **Core dependency.** The shared protocols every skill follows + package help & install doctor |
| [`flow`](docs/flow.md) | Thin orchestrator: runs the 8-stage pipeline in full or `--from` any stage, with a context-aware next-job suggestion |
| [`next`](docs/next.md) | The worklist board: everything open by priority, with effort, status, blockers — plus a shortlist of 3-5 things to do now |
| [`grill`](docs/grill.md) | Twin-agent adversarial interview (Claude + Codex plan independently, disprove each other, you answer only real conflicts) |
| [`librarian`](docs/librarian.md) | Sole owner of documentation: lifecycle pass, backlog ops, task intake, `--absorb` onboarding |
| [`work`](docs/work.md) | Lead implementer: docs router → context chain → team or solo → implement → cross-provider verify |
| [`tests`](docs/tests.md) | Fix failing tests, audit suite quality with a specialist fleet + two-model verification, push coverage |
| [`hunt`](docs/hunt.md) | Systematic bug hunt with adversarially verified findings |
| [`bug-council`](docs/bug-council.md) | Last resort for ONE stubborn bug the ordinary fix already lost to — blind multi-provider council, explicit invocation only |
| [`tdd`](docs/tdd.md) | Test-driven, both senses: red-green-refactor by default; `--debug` for hypothesis-testing bug fixing |
| [`refactor`](docs/refactor.md) | Deep functional refactoring for purity, testability, modularity |
| [`reports`](docs/reports.md) | Every run and report as a self-contained web page — stage rail, charts, and an archive index; opens as skills finish |
| [`commit`](docs/commit.md) | Conventional Commits message from the diff; commits only on your explicit yes |
| [`release`](docs/release.md) | Versioned releases with git-flow discipline: suggested bump, drafted changelog, gated squash/tag/publish |
| [`sync-configs`](docs/sync-configs.md) | Keep Claude Code and Codex CLI configurations aligned |

## The pipeline

`flow` drives one task through eight stages, each in its own context,
handing off through report files — the main conversation stays tiny and
every run is inspectable afterwards:

```
librarian --task → work → hunt → tdd --debug → tests ⛔ → refactor → verify ⛔ → librarian → commit
```

(⛔ = mandatory gate; optional stages skipped only as recorded residual
risk.) Job sources, entry stages, and examples:
[docs/flow.md](docs/flow.md).

## Documentation-driven

Every skill navigates the project through a strict docs convention — one
router, work triads, ADRs, verified reference contracts — designed for LLM
navigation at minimum token cost, with `librarian` as the single
documentation owner. The layout and rules:
[docs/documentation.md](docs/documentation.md).

## Core ideas

- **Docs convention, strict:** one router, immutable task IDs, generated
  navigation, one documentation owner — everyone else reports drift.
- **`skills.config.json`:** versioned, hard-validated, argv-array commands
  (no shell strings).
- **Two models, honestly:** the other provider (Codex ⇄ Claude) plans,
  reviews, and verifies adversarially — read-only, evidence-cited, with
  loud degradation when unavailable (never a silent single-model result).
- **Questions that earn their interruption:** facts get answered from code
  and docs; tradeoffs get pre-fought between the models; only conflicts and
  product/scope choices reach you — and answers are recorded so they're
  never asked twice.

## Repo layout

```
.claude-plugin/     plugin + marketplace manifests
skills/<slug>/      one folder per skill (SKILL.md + references/ + scripts/)
docs/               user documentation (one file per skill + guides)
scripts/check.ts    repo self-check (manifests, frontmatter, protocol references, fixtures)
```

## License

MIT — see [LICENSE](LICENSE). Third-party adaptations: see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
