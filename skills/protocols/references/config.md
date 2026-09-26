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
- **Config is READ as JSONC.** `skills.config.json` and the project's
  `release.versionFile` are parsed with `//` and `/* */` comments and trailing
  commas allowed. `deno.jsonc` and `tsconfig.json` are JSONC by definition, and
  a project is not going to strip the comments out of the file holding its
  version because a release preflight cannot parse them. Comments are the ONLY
  relaxation — every other rule here still applies to the value that results,
  and the `config` skill still WRITES strict JSON.
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
    "conventions": "docs/CONVENTIONS.md",   // optional pointer to prose conventions
    "layout": { … },                        // optional: what the places are CALLED
    "grammar": { … }                        // optional: what the fields are CALLED
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
    "dir": ".supermodo/agents"              // CANONICAL roster (single source of truth);
                                            // absent → single-agent fallback. Role files
                                            // declare `job: <class>` and no engine field
                                            // (roster-check.ts). "hosts" REMOVED: roles are
                                            // never mirrored into a host's native agents dir —
                                            // they run only through the broker (models.md).
  },
  "multimodel": {                           // optional; PROJECT POLICY for the engine layer
                                            // (models.md). Restrict-only: no model records,
                                            // assignments, pins, effort, endpoints, keys or
                                            // commands — those live in the per-user registry.
    "classes":  { "s-security-audit": { "extends": "adversary" } },   // project classes: s-<name>, one field
    "variants": { "hunt": "deep", "*": "standard" },                  // per-skill sequence variant
    "forbid":   { "reviewer": ["lineage:anthropic", "claude-fable-5-1"] }, // by role | class | "coordinator";
    "require":  { "adversary": ["lineage:openai"] },                  // values: "lineage:<slug>" or exact pins
    "concurrency": 2,                       // 1–8 external seats in flight
    "budget": { "callsPerRun": 40 }         // external calls per run
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
                                            // "mode" REMOVED: it named a workflow, so it now lives in
                                            // .supermodo/rules/release.md frontmatter (`template:`).
                                            // "githubRelease" REMOVED: whether/how a release is published
                                            // is process, so it lives in the rules file, in the project's
                                            // own words — no forge is enumerated here.
    "branches": {                           // optional; defaults shown
      "main": "main",                       // released states only — what installers/users consume
      "dev": "dev"                          // integration branch (nvie git-flow calls it "develop")
    },
    "versionFile": "package.json",          // file holding the version — JSON/JSONC, or TOML/YAML/
                                            // properties/VERSION (matched by shape, reported as such) (this repo: ".claude-plugin/plugin.json")
    "versionPath": "version",               // dot-path to the version string inside versionFile
    "changelog": "CHANGELOG.md",            // Keep-a-Changelog file; latest "## [x.y.z]" must match versionFile
    "tagPrefix": "v",                       // tag = <tagPrefix><version>
    "tagStyle": "lightweight",              // "lightweight" (default) | "annotated" | "signed"
                                            // — compliance processes that require signed tags
    "remote": "origin",                     // which remote this project releases to; every remote
                                            // is fetched regardless, since tags share one namespace
    "mergeStrategy": "squash",              // "squash" (default) | "merge" for dev → main
    "versionPattern": "^version = \"(.+)\"", // optional; ONLY when the version lives somewhere no
                                            // known shape finds it. Regex, group 1 = the version.
                                            // JSON files use versionPath; TOML/YAML/properties/
                                            // __version__/bare VERSION files are matched by shape.
    "alphaPolicy": "demote"                 // 0.x: "demote" (default: breaking → minor) | "strict"
  },
  "vcs": {                                  // optional; read by commit and release
    "issueKey": {                           // tracker linkage derived from the branch name
      "pattern": "^(?:feature|fix)/([A-Z]+-[0-9]+)-",  // regex; group 1 IS the key
      "template": "[{key}] {type}: {subject}"          // tokens: {key} {type} {scope} {subject}
    }
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
- `agents.dir` is the CANONICAL roster (default `.supermodo/agents/`):
  supermodo skills read role files from it on every host and seat them
  through the broker only (`models.md`). A role file declares `job: <class>`
  and never an engine field; files without `job:` are not roles and are left
  alone. Roles are never mirrored into a host's native agents directory
  (`agents.hosts` is REMOVED and reported as such).
- `multimodel` absent → no project classes, every skill runs its descriptor's
  default variant, no forbid/require, concurrency 2, no call budget. The
  section can only restrict; whether anything is SEATED is decided by the
  user's approved registry assignments, never by this file.
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

- `vcs` absent → no issue-key linkage. A skill whose materialized process
  (`rules.md`) names `vcs.issueKey.pattern` with no `vcs` section configured
  HALTS naming the field; it never guesses a pattern from branch names it
  happens to see. `pattern` must compile and must expose at least one
  capturing group — group 1 is the key. **`template` may not contain quotes,
  backslashes, shell metacharacters or control characters**: it is composed
  into a commit subject that `commit` prints as a literal single-quoted
  `git commit -m '…'` line, so a `'` in a committed config would close that
  quote. That is the "never interpolate config values into a shell string"
  rule applied to the one field whose whole purpose is to shape a message.

## Secrets

Secrets never live in config — only env var NAMES (SUPERMODO_*). Never
`source` a dotenv file. If a `.env` must be read, parse strict `KEY=VALUE`
lines only (reject anything containing `$`, backticks, `(`, `;`) without
shell evaluation, and read only the variables config names.

## `docs.layout` and `docs.grammar` — the project's own names

Both are optional and every key defaults, so a project that sets neither
behaves exactly as the shipped convention describes. They exist so a team can
keep its own vocabulary without giving up the checks.

**`docs.layout`** names the places: `root`, `work`, `decisions`, `reference`,
`archive`, `backlog`, `triad.{spec,plan,tasks,findings}`,
`program.{readme,frontmatterKey,initiativeDigits}`, `adr.{prefix,digits}`,
`archivePrefix`, `splitThresholdKb`.

**`docs.grammar`** names the fields and tokens: `priority.{label,levels,
separator,requireClassification,unsetLevel}`, `prioritySource.{label,
derivedValue}`, `mixed.label`, `created.label`, `dependsOn.{label,backlogLabel}`,
`promotion.{fromLabel,idsLabel}`, `task.{markerPrefix,states}`,
`question.{markerPrefix,heading}`, `generated.{fileMarker,navStart,navEnd}`,
`adrStatuses`, `finding.requiredSections`, and `extraRequired.{spec,backlog}`.

Three rules govern them, and `config-check` enforces all three:

1. **Rename freely.** Any name or token may be changed. `docs-check` and
   `docs-generate` are built from the resolved values, and every message they
   print speaks the project's vocabulary.
2. **Add freely.** `extraRequired.spec` / `.backlog` make additional fields
   mandatory on every triad spec and every LIVE backlog entry. They are checked
   for presence and never interpreted, so a project can require `Owner:` or
   `Jira:` without the package knowing what those mean.
3. **Never remove.** A key some skill parses may not be blanked to `null`,
   `""` or `[]`. The error names the skills that would have broken, because the
   damage otherwise appears somewhere else entirely — an empty board, a
   mis-derived version — with nothing pointing back at the config.

What is NOT configurable, because it is structure rather than spelling: the
two-level depth cap, that priority levels are ORDERED (index 0 outranks index
1), that task states are a four-way partition whose incomplete half is
pending ∪ in-progress, that a triad is identified by one marker file, and that
promoted ids must resolve by exact set. See `docs-convention.md`.

## `vcs.commit` and `release.alphaPolicy`

`vcs.commit` holds the commit vocabulary `commit` writes with and `release`
derives the semver bump from — one key, two skills: `types`, `minorTypes`,
`breakingMarker`, `breakingFooter`, `subjectSoftCap`, `subjectHardCap`. Every
entry of `minorTypes` must appear in `types`.

`release.alphaPolicy` is `"demote"` (default — on 0.x a breaking change bumps
MINOR, because 0.x promises nothing) or `"strict"` (it bumps MAJOR).

