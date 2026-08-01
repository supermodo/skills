# Getting started in a project

First use of the toolkit in a repository is three steps, in order.

## 1. Set up the project — `config`

In the project root:

```
/supermodo:config
```

With no config present it bootstraps the project: it scans the repo first
(scripts, tasks, Makefile targets, project name) and asks you only to confirm
the prefilled answers and a few preferences — one step at a time, defaults
offered at every step. Then it scaffolds the docs convention — or, if a
`docs/` already exists, proposes a migration into it (dry-run, file-by-file
approval, nothing overwritten silently) — and writes `skills.config.json`.

Afterwards it stays the keeper you use to view, validate, and edit that
config. See [config.md](config.md) for the full schema and modes.

## 2. Let the librarian meet the repo

```
/supermodo:librarian
```

The first lifecycle pass walks the code and existing docs, reconciles them
(promotes what's verified, flags drift, repairs links, regenerates
navigation), and reconciles your agent instructions (`CLAUDE.md` /
`AGENTS.md`) with reality. On a fresh scaffold it's quick; on a repo with
history it's the cleanup that makes every later skill trustworthy — they all
navigate from `docs/README.md`.

If the repo already had documentation scattered around (a root
`ARCHITECTURE.md`, `notes/`, wiki exports…), `config` will have pointed you
to the one-time sweep that pulls it into the convention:

```
/supermodo:librarian --absorb
```

For every file found it asks two things — is the content worth keeping in the
docs (and where), and can the original be deleted (after showing you
everything that still depends on it). Nothing moves without your per-file
approval. See [librarian.md](librarian.md).

## 3. Start working

Go straight into your first run and let flow suggest the job (or seed the
backlog first — see [documentation.md](documentation.md)):

```
/supermodo:flow
```

From then on the loop is: ideas land in the backlog, `flow` takes the next
one from spec to commit, `librarian` keeps the docs true. Flow's quality
gates run the tiers you configured in step 1 — a test command is the hard
minimum; lint/coverage gate only if you have them, and missing tiers are
reported honestly as residual risk rather than failing the run.

See [flow.md](flow.md) for the pipeline, entry stages, and job sources.
