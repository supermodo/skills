---
name: sync-configs
description: Audit and sync Claude Code and Codex CLI configurations so both tools share the same instructions, skills, subagents, MCP servers, hooks, and permission intent. Accepts an optional argument naming one skill, agent, or config file to sync just that item without a full audit. Use this whenever the user mentions config drift, syncing/aligning Claude and Codex, AGENTS.md vs CLAUDE.md differences, keeping skills or agents consistent across AI CLIs, or after editing one tool's config and wanting the other to match — e.g. "sync this skill to codex", "I changed my-agent.md, mirror it". Also use when the user asks "are my Claude and Codex setups aligned?" or wants to migrate config from one tool to the other.
disable-model-invocation: false
---

# sync-configs — Claude Code ↔ Codex CLI configuration sync

> **Requires:** the sibling `protocols` skill (shared protocol masters); uses `skills.config.json` when present. Missing protocols → tell the user to install the full supermodo package.

Audit every configuration surface shared between Claude Code and Codex CLI,
report drift, propose per-item sync actions, apply only what the user
approves, then have the *opposite* provider adversarially verify the result.
Never commit or push — leave all changes in the working tree.

## Modes

- **Full audit** (no argument) — run the whole Workflow below, every surface,
  both scopes.
- **Targeted sync** (argument given) — the user named one thing: a path
  (`.claude/agents/reviewer.md`, `.agents/skills/tests/`, `.mcp.json`), a bare
  name (`the tests skill`, `reviewer agent`), or a surface (`mcp`, `hooks`).
  Sync only that item; do NOT scan or report on anything else. See "Targeted
  mode" below.

## Why this skill exists

Both tools configure the same concepts (instructions, skills, subagents, MCP
servers, hooks, permissions) in different files and formats. Edits land on one
side and silently drift from the other. This skill makes drift visible and
repairable in one pass.

The two vendors converged on one shared standard: the **Agent Skills spec**
(`SKILL.md` folders) and the neutral **`.agents/skills/`** directory, which
both tools read. Everything else requires translation (JSON ↔ TOML) or
semantic mapping (permission models). The canonical-source rules below follow
the **shared-source convention**: keep content in the neutral/shared location
and derive tool-specific files from it.

## Canonical-source rules

| Surface | Canonical | Derived |
|---|---|---|
| Project instructions | `AGENTS.md` | `CLAUDE.md` = `@AGENTS.md` import + Claude-only section below |
| User instructions | `~/.codex/AGENTS.md` | `~/.claude/CLAUDE.md` (mirror shared content; Claude-only extras stay) |
| Skills (user) | `~/.agents/skills/<name>/` | `~/.claude/skills/<name>` → symlink into canonical |
| Skills (project) | `.agents/skills/<name>/` | `.claude/skills/<name>` → symlink; Codex reads `.agents/skills/` natively |
| Subagents | `.claude/agents/*.md` (richer format) | `.codex/agents/*.toml` and/or `~/.codex/agents/*.toml` generated via translation table |
| MCP (project) | `.mcp.json` | `[mcp_servers.*]` in Codex `config.toml` |
| Hooks | report-first; sync only the ~10 shared events on request | — |
| Permissions | no canonical — semantic report only | — |
| Model/effort/env | report intent drift only (values are provider-specific) | — |

**`skills.config.json` overrides the subagent row.** When the project config
defines `agents.dir` (+ optional `agents.hosts` — see
`../protocols/references/config.md`), that dir IS the canonical subagent
roster, whatever its path: mirror one-way from it to the native agent dir
of every host listed in `agents.hosts` (`claude` → `.claude/agents/*.md`,
`codex` → `.codex/agents/*.toml` via the translation table). Mirrors are
generated derivatives — never treat an edit in a mirror as canonical;
report it as drift to fold back into `agents.dir` (with the user's
approval) or overwrite (backup first, as always). A host slug whose native
dir equals the canonical dir is already satisfied — skip it.

Conflict rule when both sides changed independently: show the diff, prefer the
newer file, but always ask before overwriting content that exists only on the
losing side.

**Respect an existing convention.** Before proposing the canonical layout
above, detect what the repo already does deliberately. If it runs the
*inverse* convention (e.g. `CLAUDE.md` is canonical and `AGENTS.md` is a thin
adapter pointing at it, or skills intentionally forked per tool with
tool-specific idioms), that is a choice, not drift. Audit *within* the
existing convention (are the two sides consistent under their own rules?) and
mention the shared-source alternative once as an option — never propose
flipping an established convention as a "fix". Signals of deliberate
convention: an adapter file that references the other ("read CLAUDE.md"),
migration reports, systematic tool-specific rewording across many files.

**Verbatim fidelity.** When translating (agent md→toml, skill copies, MCP
entries), copy `name`, `description`, and body content *verbatim* — never
"improve", summarize, or re-flavor the wording. Descriptions are the routing
surface both tools use to decide when to invoke; rewording changes runtime
behavior, not just style. The only permitted transformations are the
mechanical ones in `references/translations.md` (escaping, quoting, format
wrapper).

## Workflow

### Phase 1 — Locate scopes

Detect what exists. Check both **user scope** and **project scope**:

- User: `~/.claude/` (CLAUDE.md, settings.json, skills/, agents/, rules/,
  keybindings.json), `~/.codex/` (AGENTS.md, config.toml, agents/, prompts/,
  rules/, skills/), `~/.agents/skills/`, `~/.claude.json` (user-scope MCP).
- Project: `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `AGENTS.override.md`,
  `.claude/` (settings.json, settings.local.json, skills/, agents/, commands/,
  rules/, hooks/), `.codex/` (config.toml, agents/, skills/), `.agents/skills/`,
  `.mcp.json`.

Honor `CLAUDE_CONFIG_DIR` and `CODEX_HOME` if set. Read
`references/surface-map.md` for the full path inventory, precedence rules, and
per-surface details before scanning — it is the ground truth for this skill.

### Phase 2 — Scan each surface pair

For each surface in the surface map, compute drift. Drift categories:

- **missing** — exists on one side only (e.g. an agent defined for Claude but
  not Codex)
- **divergent** — both exist, content differs beyond the expected
  transformation (e.g. agent body text differs between `.md` and `.toml`)
- **structural** — real directory where a symlink is expected, deprecated
  location in use (`.claude/commands/`, `~/.codex/prompts/`), broken symlink
- **semantic** — permission/model intent mismatch (e.g. Codex
  `sandbox_mode = "read-only"` while Claude allows Edit/Write)
- **limit** — AGENTS.md exceeds Codex `project_doc_max_bytes` (content would
  be truncated for Codex silently)

For divergent pairs that involve a format translation (agents md↔toml, MCP
json↔toml, hooks), normalize both sides through the mapping in
`references/translations.md` before diffing — never diff raw files across
formats, the noise buries real drift.

### Phase 3 — Drift report

Print one table, grouped by scope (project first, then user):

```
| # | Surface | Claude side | Codex side | Drift | Proposed action |
```

Every row gets a number so the user can approve by number. Below the table,
for each divergent item, show a short content diff (a few decisive lines, not
full files). Include Tier 2 report-only findings (rules dirs, plugins,
deprecated prompts/commands, trust config, output styles) in a separate
"Report only — no sync action" section so they inform without prompting.

If nothing drifted, say so plainly and stop.

### Phase 4 — Approval

Ask the user which numbered actions to apply (all / none / a subset), on the
transport set by `questions.transport`/`perSkill.sync-configs` (`AskUserQuestion`
only when `"tool"`; default is plain chat — see
`../protocols/references/questions.md`). Never
apply anything the user did not select. Destructive-looking actions
(overwriting a divergent file, replacing a real directory with a symlink) must
name the file that will lose content and where the backup goes.

### Phase 5 — Apply and verify

For each approved action:

1. Back up any file being overwritten to `<file>.bak-sync-<YYYYMMDD-HHMM>`
   next to the original.
2. Apply the change using the translation rules in
   `references/translations.md`.
3. Re-run the Phase 2 check for that surface and confirm the drift is gone.

### Phase 6 — Adversarial cross-verification (opposite provider)

After applying changes, have the *other* tool's model try to refute the work.
The same model that wrote a translation will overlook its own mistakes; a
different provider reading the same files has no such blind spot — and it is
also the tool that will actually *consume* the derived config, so it verifies
from the consumer's seat.

Pick the verifier by where you are running:

- Running inside **Claude Code** → verify with Codex. Write the prompt to a
  temp file first, then invoke with stdin explicitly closed — `codex exec`
  falls back to reading the prompt from stdin and will hang forever if the
  harness leaves stdin open:
  ```bash
  PROMPT_FILE="$(mktemp)"   # never a fixed /tmp path: predictable names can
                            # be pre-created as hostile symlinks and collide
                            # across concurrent runs
  cat > "$PROMPT_FILE" <<'EOF'
  You are an adversarial reviewer. Configuration for Claude Code and Codex
  CLI in this repo was just synced. Try to REFUTE that the sync is correct
  and complete. Check: <list the surfaces and files changed in Phase 5>.
  Look for: content lost relative to backups, reworded (not verbatim)
  names/descriptions/bodies, invalid TOML/JSON, broken symlinks, drift the
  sync missed on any surface, Claude-only constructs that Codex will
  misread. Report each finding with file and evidence, or state explicitly
  that you could not refute the sync.
  EOF
  codex exec --sandbox read-only "$(cat "$PROMPT_FILE")" </dev/null; rm -f "$PROMPT_FILE"
  ```
  If it produces no output within ~2 minutes, kill it and use the fallback
  below rather than waiting.
- Running inside **Codex** → verify with Claude Code:
  ```bash
  claude -p --permission-mode plan "<same adversarial prompt>"
  ```

Practical notes:

- These commands can take several minutes — run with a generous timeout and
  in the background if available. Read-only mode is mandatory: the verifier
  reviews, it never fixes.
- If the opposite CLI is missing or not authenticated, fall back to a fresh
  subagent of the current tool with **no conversation context** and the same
  refutation prompt — independence matters more than provider diversity, so
  say in the summary which verifier was actually used.
- Triage findings: real defects → fix and re-run Phase 5 verification for
  that surface (one re-verify round; if the verifier still objects, surface
  the disagreement to the user instead of looping); style opinions or
  convention disagreements → report, do not churn.

Finish with a short summary: what changed, what was skipped, backups created,
and the cross-verification verdict (who verified, what it found).
Remind the user that nothing was committed.

## Targeted mode

When the invocation names a specific file, folder, or surface, the user
already knows what drifted — the value of this mode is skipping the full scan,
not skipping care. Run a scoped version of the workflow:

1. **Resolve the item.** Map the argument to exactly one surface pair using
   `references/surface-map.md` (read it — same ground truth as the full
   audit). A path identifies its surface directly (`*/agents/*.md` → subagent
   pair, `*/skills/<name>/` → skill pair, `.mcp.json` → MCP pair, a
   CLAUDE/AGENTS file → instructions pair). A bare name may match several
   candidates (a skill and an agent named `tests`, or the same skill in user
   and project scope) — if so, list the matches and ask which one; never
   guess. If the argument matches nothing on either side, say so and stop —
   do not fall back to a full audit uninvited.
2. **Diff only that pair.** Run the Phase 2 check for the resolved pair alone
   (normalize across formats first, as usual). Report what you found in a
   couple of sentences — no drift table needed for one item.
3. **Apply.** Naming the item counts as the user's selection, so skip the
   Phase 4 menu — but two situations still require asking first, exactly as
   in the full workflow: overwriting a divergent file where the losing side
   has unique content, and structural changes (replacing a real directory
   with a symlink). Backups per Phase 5, always.
4. **Verify proportionally.** Re-run the pair's drift check to confirm it is
   clean. For a single mechanical copy or symlink, a scoped opposite-provider
   check (Phase 6 prompt narrowed to just the touched files) is optional —
   offer it rather than defaulting to it; a multi-file translation (agent
   md→toml, MCP block) still deserves the cross-check.
5. **Report.** What changed, backup locations, one-line confirmation that the
   pair now matches. Mention nothing about other surfaces — you did not look,
   so do not imply you did.

If the pair is already in sync, say so and stop.

## Persist and publish

Standalone runs write this report to
`.skills/supermodo/sync-configs/<YYYYMMDD-HHMMSS>.md` per
`../protocols/references/reports.md` — a result living only in chat dies with
the session. Then publish it:

```
node <skills>/reports/scripts/render.ts --report <that path>
```

and NAME the page in your final message. Inside a `flow` run this does not
apply: the stage report is the artifact and the orchestrator renders the one
run page.

## Guardrails

- Never commit, merge, or push. Never touch git state.
- Never delete user content. Overwrite only with a backup; merging is always
  preferred over replacing when both sides carry unique content.
- Never sync secrets: skip `auth.json`, API keys, `env` values that match
  `*KEY*`, `*TOKEN*`, `*SECRET*`. Report their existence, never copy values.
- Skills marked deprecated locations (`~/.codex/skills/`, `.claude/commands/`,
  `~/.codex/prompts/`) get a **migration proposal** to the canonical skill
  location, not a sync-in-place.
- Symlinks: when converting a real directory to a symlink, move the real
  content to the canonical location first, verify the move, then link.
- If a tool's config format has clearly changed beyond what
  `references/surface-map.md` describes (unknown keys, new locations), say so
  and verify against current docs before acting — both CLIs move fast.

## References

- `references/surface-map.md` — complete path inventory for both tools:
  every file, format, precedence chain, and which pairs sync. Read during
  Phase 1.
- `references/translations.md` — exact field mappings for agents (YAML
  frontmatter ↔ TOML), MCP (JSON ↔ TOML), hooks (event/handler mapping),
  permissions (semantic intent table), and the CLAUDE.md `@AGENTS.md` import
  pattern. Read before Phase 2 diffing and Phase 5 writes.
