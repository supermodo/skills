# The documentation model

Documentation is the toolkit's backbone: every skill navigates the project
through the docs, so they must stay true. One skill —
[librarian](librarian.md) — is the **single documentation owner**: only it
creates, moves, or edits docs. Every other skill just reports drift ("code
says X, doc says Y") and the librarian resolves it once. That's what keeps
the docs trustworthy enough to drive development from.

## Designed for LLM navigation

The structure is built for **minimum token cost**. An agent should never
have to scan the repo or read three documents to find the one it needs:
every lookup starts at one router, every path is predictable from the
convention, active work is separated from cold history, and each file has
one job — reading it loads exactly the needed context and nothing else. Fast
to search, cheap to read — for models first, and for humans as a happy side
effect.

## The layout

```
docs/
├── README.md          THE ROUTER — single entry point, every skill starts here
├── CONVENTIONS.md     prose conventions for this project
├── work/
│   ├── BACKLOG.md     dated ideas; history struck through, never erased
│   └── <task-slug>/   one folder per active task — "the triad":
│                        spec.md (what & why) · plan.md (how) · tasks.md (checklist)
├── decisions/         ADRs — durable decisions, immutable once accepted
├── reference/         promoted, VERIFIED contracts ("how it IS")
└── archive/           completed work folders, moved verbatim
```

(The root and router are configurable — `docs.entry` in the config — but the
shape is fixed.)

## The rules that make it work

- Task checklist items carry **immutable inline IDs** — never identified by
  position or title.
- Navigation sections are **generated**, never hand-edited.
- Specs and plans are **never treated as evidence** — only code and
  verification results get promoted into `reference/`.
- The archive is cold storage, read only for provenance.
- ADR bodies are immutable once accepted; only lifecycle fields (superseded,
  rejected) ever change.

The full convention (task states, backlog grammar, work metadata, generated
markers) is the master in
`skills/protocols/references/docs-convention.md`; what to work on next — the
priority scale, ordering and suggestions — is its own master,
`skills/protocols/references/worklist.md` (see [next](next.md)).

## Conventions we build on

- **[Architecture Decision Records](https://adr.github.io/)**
  ([Nygard's original](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions))
  for `docs/decisions/` — sequential `ADR-NNNN` ids, immutable bodies,
  explicit supersession.
- **[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)**
  for every commit message ([commit](commit.md) writes them;
  [release](release.md) derives the version bump from them).
- **[Semantic Versioning](https://semver.org/)** and
  **[Keep a Changelog](https://keepachangelog.com/)** for the release
  skill's version bumps and changelog entries.

The docs layout itself is supermodo's own strict convention — opinionated on
purpose, so every skill (and every model) always knows where things are.
