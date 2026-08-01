# skills.config.json — the supermodo config contract (v1)

Contents: dependency levels · hard rules · schema (v1) · defaults when a
section is absent · secrets. Partial readers: the schema starts ~line 40,
defaults ~line 105 — read the whole file before writing a config.

Supermodo skills read `skills.config.json` at the target project root.
This file is the ONLY place project-specific strict values live. Prose
(conventions, domain notes, agent role descriptions) lives in the project's
docs; config fields point at it.

**Two dependency levels** — each skill's own `Requires` line is authoritative:

- **Config-required** (docs-driven): `librarian`, `work`, `flow`, `tests`
  — halt without a valid config, pointing at `config`.
- **Config-optional**: `commit`, `release`, `grill`, `hunt`, `tdd`,
  `refactor`, `sync-configs` — use the config when present (validated
  first), otherwise run on their documented defaults and SAY so. Optional
  never means silent: an invalid config present is still a halt, never
  ignored.

## Hard rules

- **Version:** skills support exactly `configVersion: 1`. Lower → halt, tell
  the user to run `config --upgrade`. Higher → halt, tell the user to
  update the installed supermodo skills. An older config skill never
  rewrites a newer config.
- **Validation before use:** run the `config` skill's bundled `config-check.ts` (or apply its
  rules by hand) before acting on any config value. Missing or invalid config
  → halt with a clear error naming the field; suggest running `config`. Never guess.
- **Unknown fields are errors** (`additionalProperties: false` semantics).
- **Paths** are project-root-relative, POSIX separators, no `..` segments.
- **Commands are argv arrays** (`["deno", "task", "test"]`), never shell
  strings. Execute without a shell. The FIRST use of each configured command in
  a session must be shown to the user and explicitly approved; rejection
  aborts that step. Never interpolate config values into a shell string.
- **Env var indirection is namespaced:** fields ending in `Env` name
  environment variables, and the value MUST start with `SUPERMODO_`. Never
  read arbitrary env var names from config.

## Schema (v1)

```jsonc
{
  "configVersion": 1,                       // required, literal 1
  "project": {                              // optional
    "name": "string"                        // display name
  },
  "docs": {                                 // required for librarian/work/flow/tests
    "entry": "docs/README.md",              // the router; default "docs/README.md"
    "conventions": "docs/CONVENTIONS.md"    // optional pointer to prose conventions
  },
  "commands": {                             // each optional; argv arrays only
    "test": ["string"],                     // fast test suite
    "testUnit": ["string"],                 // full unit suite (coverage-capable)
    "testAll": ["string"],                  // full validation incl. integration/E2E
    "lint": ["string"],                     // format + lint + type-check
    "coverage": ["string"],                 // coverage report generation
    "mutation": ["string"],                 // mutation testing (enables mutation probes)
    "docsCheck": ["string"],                // override of librarian's bundled docs-check.ts
    "docsGenerate": ["string"]              // override of librarian's bundled docs-generate.ts
  },
  "workspace": {                            // optional; how work/flow use the filesystem
    "worktree": false                       // default false: run in the main working tree.
                                            // true = worktree-per-task: work/flow create one
                                            // dedicated git worktree + branch per task (shared by
                                            // all subagents, never one per subprocess), merged into
                                            // the dev branch and removed at release. The --worktree /
                                            // --no-worktree flags override per invocation.
  },
  "coverage": {                             // optional
    "target": 80                            // integer 1-100; flow stage-5 gate.
                                            // Measured as the coverage tool's overall
                                            // summary percentage; reports state which
                                            // number governed when a tool prints several.
  },
  "agents": {                               // optional
    "dir": ".claude/agents",                // CANONICAL roster (single source of truth);
                                            // absent → single-agent fallback
    "hosts": ["claude", "codex"]            // optional; hosts whose native agent dirs
                                            // sync-configs mirrors FROM dir (one-way);
                                            // requires dir
  },
  "questions": {                            // optional
    "transport": "chat",                    // "chat" (default) | "tool"
    "perSkill": { "hunt": "tool" }          // per-skill override (applies uniformly, grill included)
  },
  "output": {                               // optional
    "verbosity": "concise"                  // "concise" (default) | "standard"
  },
  "confirmations": {                        // optional; consent-gate policy
    "mode": "ask",                          // "ask" (default) | "auto"
    "perSkill": { "release": "auto" }       // per-skill override
  },
  "reports": {                              // optional; HTML projection of .skills/supermodo/ reports
    "html": true,                           // default true: render a page beside every report
                                            // plus the archive index; false = markdown only
    "open": "auto"                          // "auto" (default: every skill opens its own page) |
                                            // "flow" (only flow runs open) | "never" (print the link)
  },
  "changelog": {                            // optional; changelog fragments (commit + release)
    "fragments": true,                      // default true: `commit` writes a fragment per commit,
                                            // `release` consumes them; false = off (or per-run --no-changelog)
    "dir": "changes"                        // fragment folder, project-root-relative; default "changes"
  },
  "release": {                              // optional; used by the release skill
    "mode": "light",                        // "light" (default: dev → main squash) | "full" (adds release/* and hotfix/* branches)
    "branches": {                           // optional; defaults shown
      "main": "main",                       // released states only — what installers/users consume
      "dev": "dev"                          // integration branch (full mode: nvie "develop")
    },
    "versionFile": "package.json",          // JSON file holding the version (this repo: ".claude-plugin/plugin.json")
    "versionPath": "version",               // dot-path to the version string inside versionFile
    "changelog": "CHANGELOG.md",            // Keep-a-Changelog file; latest "## [x.y.z]" must match versionFile
    "tagPrefix": "v",                       // tag = <tagPrefix><version>
    "mergeStrategy": "squash",              // "squash" (default) | "merge" for dev → main
    "githubRelease": true                   // publish a GitHub Release from the changelog entry after tagging
  }
}
```

## Defaults when a section is absent

- `docs.entry` → `docs/README.md`
- `questions.transport` → `chat`; `"tool"` only has effect on hosts with a
  question tool (Claude Code) and openly degrades to chat elsewhere; the
  override applies uniformly to every skill, grill included.
- `output.verbosity` → `concise`: "be extremely concise and sacrifice grammar
  for the sake of concision." Applies to CHAT REPORTING ONLY. Never applies
  to generated artifacts (docs, ADRs, reports, commit messages — convention
  formats win), never shrinks protocol-mandated formats (grill explanations,
  question loops), never compresses safety output (warnings, destructive
  confirmations, mutation previews).
- `workspace.worktree` → `false`: `work` and `flow` run in the main working
  tree. `true` opts every `work`/`flow` run into worktree-per-task isolation
  (see the worktree-mode contract in `handoff.md`); the per-run `--worktree` /
  `--no-worktree` flags override the config default either way.
- `reports.html` → `true`, `reports.open` → `auto` (see the HTML projection
  section of `reports.md`). A browser is NEVER opened without a TTY, with `CI`
  set, or over SSH without a display — the `file://` link is printed instead,
  whatever the setting says.
- `agents.dir` absent or empty → skills use their single-agent fallback.
- `agents.dir` is the CANONICAL roster: supermodo skills read agents from
  it on every host; edits go there, never to a mirror. `agents.hosts`
  lists the hosts whose native dirs (`claude` → `.claude/agents/`,
  `codex` → `.codex/agents/`) `sync-configs` derives one-way from the
  canonical dir so each host's harness finds them natively — mirrors are
  generated files, never hand-edited, and a host slug equal to the
  canonical dir's own host is simply already satisfied. `hosts` absent →
  no mirroring.
- `commands.docsCheck` / `commands.docsGenerate` absent → librarian runs its
  bundled scripts, resolved RELATIVE TO THE INSTALLED SKILL FOLDER (never a
  config-supplied path to the bundle).
- A skill needing an absent required section halts and points at `config`.
- `changelog.fragments` → `true` (ON by default, configured project or not);
  `changelog.dir` → `changes`. The `commit` skill writes one fragment file
  per commit (bump hint + Keep-a-Changelog section + `scope` path list —
  the candidate key for cross-invocation reuse; identity additionally
  requires the fragment prose to still describe the current diff — + 1–3
  user-facing sentences, authored while the full context is live) and
  `release` builds
  the changelog entry from fragments, falling back to commit subjects for
  fragment-less commits, then deletes consumed fragments in the release
  commit. Opt out via `"fragments": false` or the per-invocation
  `--no-changelog` flag on `commit`.
- `confirmations.mode` → `ask`. `"auto"` skips CONSENT gates only
  (ask-to-commit, release execute): the skill proceeds without asking but
  still prints every action it takes. Auto NEVER skips: judgment questions
  (class-(c) product/scope/preference per the questions protocol), preflight
  blockers, or the **first-use approval of configured commands** (that gate
  guards against a hostile committed config and stays on in every mode);
  and it never applies to remote-irreversible operations unless the skill
  performing them is named explicitly in `perSkill` — the global switch
  alone is not enough there.

## Secrets

Secrets never live in config — only env var NAMES (SUPERMODO_*). Never
`source` a dotenv file. If a `.env` must be read, parse strict `KEY=VALUE`
lines only (reject anything containing `$`, backticks, `(`, `;`) without
shell evaluation, and read only the variables config names.
