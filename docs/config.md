# config — the project configuration keeper

**Core dependency.** Keeper of the project's supermodo configuration
(`skills.config.json`) and docs scaffold. Its steady-state job is maintaining
the config; bootstrap is just what it does when there is nothing to keep yet.

## When to use

- First time onboarding a project onto the supermodo skills.
- Viewing, validating, or editing the current config ("change the coverage
  target", "add the lint command").
- Whenever another skill reports a missing or invalid `skills.config.json`.

## Modes

| Invocation | What happens |
|---|---|
| `/supermodo:config` | Show current config + validation; offer edits. **No config yet → bootstrap runs automatically.** |
| `/supermodo:config --yes` | Bootstrap with defaults + verified discovered commands, no interview (auto-selected in an empty folder) |
| `/supermodo:config --edit [field]` | Change one or more fields: interview just those, re-validate, show a before/after diff |
| `/supermodo:config --upgrade` | Migrate an existing config to the current `configVersion` |

It never re-scaffolds over a configured project: with a valid config present,
the default invocation reports and offers edits.

## The bootstrap

0. **Fast path** — in an empty folder (or with `--yes`) the interview is
   skipped: defaults plus any discovered-and-verified commands are written
   directly, then a settings summary is shown with one "change anything?"
   question, and the report points at `/supermodo:commit` as the next step.
   Writing without asking happens only when every write CREATES a new file;
   the moment any existing file would change, a compact plan is confirmed
   first. `--yes` in a non-empty project keeps the full dry-run and
   conflict rules.
1. **Interview** — a sequential wizard, one step per message, each with
   context, the question, and a default (a bare "ok" accepts it). Steps:
   project name, docs entry (the router path), commands (test/lint/coverage/…
   discovered from your `package.json`/`deno.json`/Makefile and confirmed one
   by one — each missing quality tier gets a recommendation and a
   set-up-after / give-command / skip choice), coverage target, agent team
   (optional roster for `work`), question transport, verbosity, and workspace
   (whether `work`/`flow` isolate each task in its own git worktree). A recap
   of all answers is confirmed before anything happens.
2. **Dry-run** — the complete list of files to be created or modified is
   shown and approved before a single write.
3. **Conflicts become a migration plan** — existing files are never
   overwritten silently; each conflict gets a per-file move/merge/leave
   proposal.
4. **Write + manifest** — every action is recorded to
   `.skills/supermodo/config-manifest.json` so the change is reversible.
5. **Validate** — the bundled `config-check.ts` must pass before success is
   reported.
6. **Close tooling gaps** — tiers you queued as "set up after" are set up
   one by one: current setup guidance is derived from your installed tool
   versions and live documentation (never canned recipes), every file
   change and install is approved first, and a command is only recorded in
   the config after it has been run and observed working. Declined tiers
   are remembered and not re-asked while the project's tooling is
   unchanged.
7. **Hand off pre-existing docs** — if documentation exists outside the
   scaffold, the report ends by directing you to `librarian --absorb`
   (see [librarian.md](librarian.md)).

The scaffold it creates is the strict docs convention described in
[documentation.md](documentation.md).

## The config file (v1)

```jsonc
{
  "configVersion": 1,                       // required, literal 1
  "project": { "name": "string" },          // optional
  "docs": {                                 // required for librarian/work/flow/tests
    "entry": "docs/README.md",              // the router — every skill starts here
    "conventions": "docs/CONVENTIONS.md"    // optional prose pointer
  },
  "commands": {                             // each optional; argv arrays only
    "test": ["deno","task","test"],
    "testUnit": ["..."], "testAll": ["..."],
    "lint": ["..."], "coverage": ["..."], "mutation": ["..."],
    "docsCheck": ["..."], "docsGenerate": ["..."]
  },
  "workspace": {                            // optional
    "worktree": false                       // false (default) = main tree;
                                            // true = worktree-per-task for work/flow
  },
  "coverage": { "target": 80 },             // integer 1-100
  "agents": { "dir": ".claude/agents" },    // absent → single-agent fallback
  "questions": {
    "transport": "chat",                    // "chat" (default) | "tool"
    "perSkill": { "hunt": "tool" }
  },
  "output": { "verbosity": "concise" },     // "concise" (default) | "standard"
  "confirmations": {
    "mode": "ask",                          // "ask" (default) | "auto"
    "perSkill": { "release": "auto" }
  },
  "reports": {
    "html": true,                           // default true — see reports.md
    "open": "auto"                          // "auto" (default) | "flow" | "never"
  },
  "changelog": {
    "fragments": true,                      // default true — see commit.md / release.md
    "dir": "changes"                        // fragment folder; default "changes"
  },
  "release": { /* see release.md */ }
}
```

Rules that bite: unknown fields are errors; paths are root-relative POSIX
with no `..`; commands are argv arrays executed without a shell (never shell
strings); env-var fields use the `SUPERMODO_*` namespace and never hold
secret values. The full contract lives in the protocols skill
(`skills/protocols/references/config.md`).

## Guardrails

- No git operations — `.gitignore` is edited as a normal file, nothing else.
- Writes only inside the project root, and only approved paths: the docs
  scaffold, `skills.config.json`, `.gitignore`, `.skills/supermodo/`,
  accepted agent-role files, and tooling changes you approved
  change-by-change.
- Halts and reports on any conflict you haven't approved a resolution for.
