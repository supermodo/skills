# Surface map — every syncable configuration surface

Ground truth for the sync-configs skill. Compiled from official docs
(code.claude.com/docs; Codex CLI source at github.com/openai/codex) as of
mid-2026. Both tools move fast — if reality contradicts this file, trust
reality and note the discrepancy.

Environment overrides: `CLAUDE_CONFIG_DIR` relocates `~/.claude`;
`CODEX_HOME` relocates `~/.codex`. Resolve these first.

## 1. Instruction files

### Claude Code (reads ONLY CLAUDE.md — never AGENTS.md natively)

| Scope | Path | Notes |
|---|---|---|
| Managed | `/Library/Application Support/ClaudeCode/CLAUDE.md` (macOS), `/etc/claude-code/CLAUDE.md` (Linux) | Loads first, cannot be excluded |
| User | `~/.claude/CLAUDE.md` | |
| Project | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Committed |
| Local | `./CLAUDE.local.md` | Gitignored personal |
| Subdir | `<subdir>/CLAUDE.md` | Lazy-loaded when Claude reads files there |

- `@path` imports, max 4 hops, relative to importing file, `~/` allowed.
  Skipped inside code spans/fences. This is the bridge mechanism to AGENTS.md.
- All files concatenate (broad → specific); nothing overrides, later wins by
  proximity in context.

### Codex

| Scope | Path | Notes |
|---|---|---|
| User | `~/.codex/AGENTS.md` (or `AGENTS.override.md`) | Loaded as user instructions |
| Project | repo root `AGENTS.md` + every dir from cwd up to root | Auto-included |
| Override | `AGENTS.override.md` probed BEFORE `AGENTS.md` in each dir | Personal shadow of committed file |
| Nested | any `AGENTS.md` deeper in tree | On-demand when working in that subtree |

- Deeper file wins on conflict. Direct prompts always override AGENTS.md.
- `project_doc_max_bytes` (config.toml) silently truncates large files —
  **check AGENTS.md size against it** and warn.
- `project_doc_fallback_filenames` can register alternate names.

### Sync pairs

- `CLAUDE.md` ↔ `AGENTS.md` (project). Target state: `AGENTS.md` holds shared
  content; `CLAUDE.md` starts with `@AGENTS.md` then Claude-only sections.
- `CLAUDE.local.md` ↔ `AGENTS.override.md` (personal shadows). Same idea.
- `~/.claude/CLAUDE.md` ↔ `~/.codex/AGENTS.md` (user). Mirror shared content.
- Subdir `CLAUDE.md` ↔ nested `AGENTS.md` — pair per directory.

## 2. Skills (the shared standard — agentskills.io)

Both tools read `SKILL.md` folders with identical required frontmatter
(`name`, `description`). Cross-compatible by design.

### Claude Code scan locations (precedence: enterprise > personal > project)

- Managed dir `.claude/skills/`
- `~/.claude/skills/<name>/SKILL.md`
- `.claude/skills/<name>/SKILL.md` (walks up to repo root; nested get
  dir-qualified names)
- Plugin `skills/` (namespaced `plugin:skill`, no conflict)

### Codex scan locations (precedence: Repo > User > System > Admin)

- Repo: `<repo>/.codex/skills/` AND `<repo>/.agents/skills/`
- User canonical: `~/.agents/skills/`  ← note `.agents`, not `.codex`
- User deprecated: `~/.codex/skills/` (back-compat only)
- System: `~/.codex/skills/.system/` (bundled — never touch)
- Admin: `/etc/codex/skills/`

### Sync strategy

- Canonical: `.agents/skills/` (project) and `~/.agents/skills/` (user).
- Claude side: symlink `~/.claude/skills/<name>` → `../../.agents/skills/<name>`
  (user) or `.claude/skills/<name>` → `../../.agents/skills/<name>` (project).
- Codex reads `.agents/skills/` directly — no work needed once canonical.
- Drift checks: skill present on one side only; real directory where symlink
  expected; two real copies diverged (diff SKILL.md + bundled files);
  anything still in `~/.codex/skills/` (propose migration).
- Frontmatter portability: both support `name`, `description`,
  `argument-hint`, `disable-model-invocation`, `user-invocable`,
  `allowed-tools`, `model`. Claude-only extras (`context: fork`, `agent`,
  `effort`, `hooks`, `paths`, dynamic `` !`cmd` `` injection) are ignored by
  Codex — flag them as "Claude-only feature in shared skill" but do not block.

## 3. Subagents

### Claude Code: `.claude/agents/*.md` (project), `~/.claude/agents/*.md` (user)

Markdown, YAML frontmatter + system-prompt body. Required: `name`,
`description`. Optional: `tools`, `disallowedTools`, `model`,
`permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`,
`background`, `effort`, `color`, `initialPrompt`.

### Codex: `~/.codex/agents/*.toml` (auto-discovered recursively) + `[agents.<role>]` in config.toml

TOML: `name`, `description`, `sandbox_mode`, `developer_instructions`
(triple-quoted body), optional `config_file` (role-specific config layer),
`nickname_candidates`. Multi-agent gated by `[features].multi_agent`.

Project-level `.codex/agents/*.toml` may exist from migration tools — verify
Codex actually loads them in the current version before relying on it; the
documented discovery dir is user-level.

### Sync pair

`.claude/agents/<n>.md` ↔ `.codex/agents/<n>.toml` (and/or user-level
equivalents). Canonical: the Claude `.md` (richer). Translate via
`references/translations.md`. Diff bodies after normalization — body drift is
the common failure.

## 4. MCP servers

### Claude Code

| Scope | Where |
|---|---|
| Project | `.mcp.json` at repo root, `mcpServers` key (committed) |
| User | `~/.claude.json` top-level `mcpServers` |
| Local | `~/.claude.json` under `projects.<path>.mcpServers` |

Fields: `type` (stdio/http/sse/ws), `command`, `args`, `env`, `url`,
`headers`, `timeout`, `alwaysLoad`. Env expansion `${VAR}` / `${VAR:-def}`.

### Codex

`[mcp_servers.<name>]` in config.toml (user or trusted-project). Fields:
`command`, `args`, `env`, `env_vars`, `cwd`; HTTP: `type = "http"`, `url`.
CLI: `codex mcp add / list`.

### Sync pair

`.mcp.json` ↔ `[mcp_servers.*]`. Canonical: `.mcp.json` for project servers.
Match by server name; compare command/args/url/env KEYS (never copy secret
values). User-scope servers in `~/.claude.json` ↔ `~/.codex/config.toml`.

## 5. Hooks

### Claude Code

`hooks` key in any settings.json layer. ~30 events. Handler types: `command`,
`http`, `mcp_tool`, `prompt`, `agent`. Command fields: `command`, `args`,
`async`, `shell`, `if`, `timeout` (sec), `statusMessage`. Scripts convention:
`.claude/hooks/`.

### Codex

`[hooks]` in config.toml. 10 events (PascalCase): `PreToolUse`,
`PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`,
`SessionStart`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`.
Array-of-tables `[[hooks.PreToolUse]]` with `matcher` + `hooks` list; handler
`type = "command"` with `command`, `command_windows`, `timeout`, `async`,
`statusMessage`. Also simpler `notify` (argv list fired on events).

### Sync strategy

Only the 10 shared events are syncable. Report-first: list hooks per side,
mark which are portable (command handlers on shared events) vs tool-specific
(Claude `http`/`prompt`/`agent` handlers, Claude-only events). Sync only on
explicit request per hook.

## 6. Permissions / approval (semantic only — no file translation)

| Concept | Claude Code | Codex |
|---|---|---|
| Default posture | `permissions.defaultMode` | `approval_policy` (untrusted / on-request / granular / never) |
| Filesystem writes | allow/deny rules (`Edit`, `Write`) | `sandbox_mode` (read-only / workspace-write / danger-full-access) |
| Network from shell | sandbox settings / deny rules | `[sandbox_workspace_write].network_access` |
| Per-rule lists | `permissions.allow/deny/ask` arrays | closest: `granular` approval config; no direct equivalent |
| Project trust | dir trust prompt | `[projects.<path>].trust_level` |

Report intent mismatches only (e.g. one side read-only, other side full
write; network allowed one side, blocked the other). Never auto-rewrite
permission config.

## 7. Model / effort / env intent

| Intent | Claude Code | Codex |
|---|---|---|
| Model | `model` in settings.json, `ANTHROPIC_MODEL` | `model` in config.toml |
| Effort | `effortLevel` (low/medium/high/xhigh) | `model_reasoning_effort` (minimal/low/medium/high) |
| Env vars | `env` object in settings.json | `[shell_environment_policy].set` |

Models are provider-specific — report tier intent only (e.g. "both on
top-tier model", "effort mismatch: high vs minimal"). Env: compare KEYS,
copy non-secret values on approval.

## 8. Deprecated command surfaces (migration proposals, not sync)

- `.claude/commands/*.md` and `~/.claude/commands/*.md` — legacy slash
  commands, merged into skills. Propose converting each to
  `.agents/skills/<name>/SKILL.md`.
- `~/.codex/prompts/*.md` — deprecated custom prompts (`/prompts:<name>`).
  Same proposal. Argument syntax differs (`$1`–`$9`, `$ARGUMENTS`,
  named `$UPPER` via `KEY=value`) — translate hints into `argument-hint`.

## 9. Tier 2 — report only

- `.claude/rules/*.md` and `~/.claude/rules/` (path-scoped via `paths`
  frontmatter) vs `~/.codex/rules/*.rules` — different mechanisms, no
  translation. List contents side by side.
- Plugins/marketplaces — both ecosystems exist but are disjoint
  (`~/.claude/plugins` + settings keys vs `[plugins.*]`/`[marketplaces.*]`).
  List installed plugins per side.
- Project `.codex/config.toml` — honored only on trusted repos; report its
  keys (commonly `approval_policy`, `sandbox_mode`) against Claude project
  settings intent.
- Claude-only, no counterpart: output styles, statusline, keybindings,
  `.claude/settings.local.json` UI prefs, checkpointing/memory settings.
  Ignore silently unless the user asks.
- Codex-only: profiles (`[profiles.*]`, `~/.codex/<name>.config.toml`),
  `personality`, TUI settings, `[features]` flags. Ignore silently.
- Size limit check: warn when project `AGENTS.md` byte size approaches
  `project_doc_max_bytes` (if set) — Codex truncates silently.
