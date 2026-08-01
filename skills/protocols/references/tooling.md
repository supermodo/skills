# Tooling protocol — command tiers, gap closing, freshness method

How supermodo treats a project's quality commands: what each tier means, why
missing tiers are gaps worth closing, and how to propose setup WITHOUT this
file ever holding a recipe that can go stale.

## Command tiers

`commands` in `skills.config.json` (argv arrays, run without a shell — see
`config.md`) maps the project onto these tiers:

| Tier | Meaning | Consumed by |
| ---- | ------- | ----------- |
| `test` | Fast default test run (unit-level, seconds not minutes) — the in-loop, after-every-change command | tdd, tests, work, flow |
| `testUnit` | Full unit suite (coverage-capable) — the completion gate | tdd, tests, work |
| `testAll` | The full suite: integration/e2e included | tests, flow, release |
| `lint` | Static quality gate — format check + lint + type-check | work, flow, release |
| `coverage` | Coverage report comparable to `coverage.target` | tests, tdd gates |
| `mutation` | Mutation-testing run (score over the tested code) | tests (deep audits) |
| `docsCheck` / `docsGenerate` | Override the bundled docs scripts | librarian |

The package's opinion: a project is healthiest with `test`, `testAll`,
`lint`, and `coverage` all present; `mutation` is strongly recommended where
the ecosystem supports it. A missing tier is a GAP to surface — never a
reason to invent a command that was not seen working.

## Gap handling (config interview step 3, `config --edit commands`)

For every tier with no discovered candidate, show ONE recommendation line:
what the tier buys, and that setup guidance is available — then ask, per the
questions protocol: **skip** (records a decline) / **give command** (user
supplies it; verify it, below) / **set up after** (queued for the
post-bootstrap tooling phase). Never stall the interview with setup work.

**Decline memory.** A skipped tier is recorded in the manifest
(`.skills/supermodo/config-manifest.json`) as per-tier metadata carrying
its grounds — the candidate set observed at decline time and the discovery
sources (manifest/aggregator paths with content hashes):

```jsonc
"tooling": { "declined": {
  "mutation": { "candidates": [], "sources": { "package.json": "<sha256>" } }
} }
```

It is not asked about again WHILE those grounds hold. A decline expires
(ask again, once) when a later discovery pass sees different local truth:
a new candidate for that tier, a changed/added/removed source hash, or an
explicit user edit of `commands`. Steady-state `config` may report
declined/missing tiers as a single informational line — a nudge, never a
repeated question.

## Freshness method — no recipes, ever

Per-stack setup instructions rot the day they are written, so this master
holds NONE. Derive guidance at runtime, in this order:

1. **Local truth first (never rots).** Interrogate the project itself:
   lockfiles and manifests for exact tool versions, existing tool configs,
   `<tool> --help` output. The installed version's own help text beats any
   document about it.
2. **Live documentation second.** For the detected tool AND version, fetch
   current official setup guidance with whatever the host provides (docs
   MCP, web search). Search for "<tool> <version> <tier> setup" — never
   recite a remembered incantation for a tool you have not checked.
3. **Verify before recording.** Any command destined for
   `skills.config.json` must be RUN and observed exiting 0 (or failing only
   on genuine findings, e.g. a lint error the user should see) before it is
   written — and its exact argv shown to and approved by the user before
   its first execution (the config contract's first-use rule). A stale or wrong suggestion fails here, visibly, in front of
   the user — never silently in a config nobody tested.

## Aggregator rule

If the project routes commands through an aggregator (`Makefile`, `justfile`,
`package.json` scripts, `deno.json` tasks), propose adding missing tiers as
targets THERE and record the aggregator invocation in the config (e.g.
`["make","coverage"]`) — one entry point for humans and skills alike, instead
of raw tool calls only the config knows about.

## Safety

Tooling setup mutates the user's project (build files, scripts, dev
dependencies), so it follows the config skill's invasiveness rules in full:
dry-run enumeration of every file change and every install command, explicit
approval, manifest recording, no overwrites of non-generated content. Suggest,
confirm, verify — never invent, never install silently.
