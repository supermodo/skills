# Translation tables — exact field mappings

Rules for converting between Claude Code and Codex formats. Use these both
for normalization-before-diff (Phase 2) and for writing (Phase 5).

## 1. Subagents: Claude `.md` ↔ Codex `.toml`

Claude `.claude/agents/<name>.md`:

```markdown
---
name: infrastructure
description: Use this agent when ...
model: opus
color: cyan
tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"]
---
<system prompt body>
```

Codex `agents/<name>.toml`:

```toml
name = "infrastructure"
description = "Use this agent when ..."
sandbox_mode = "workspace-write"
developer_instructions = """<system prompt body>"""
```

Verbatim means verbatim: byte-identical apart from quoting/escaping. Do not
fix typos, tighten wording, or "modernize" paths while translating — the
description is what routes agent selection at runtime, and the body is the
agent's actual behavior. If content genuinely needs improving, that is a
separate proposal to make on the canonical file, never a silent side effect
of translation.

| Claude frontmatter | Codex TOML | Rule |
|---|---|---|
| `name` | `name` | verbatim |
| `description` | `description` | verbatim (escape quotes) |
| body (below frontmatter) | `developer_instructions` | verbatim; triple-quoted; unwrap hard-wrapped lines only if diffing, never when writing |
| `tools` | `sandbox_mode` | heuristic: tools include Write/Edit/Bash → `workspace-write`; read-only set (Read/Grep/Glob) → `read-only` |
| `model`, `color`, `effort`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory` | — | no Codex equivalent; drop on md→toml, preserve on toml→md round-trip by keeping the .md canonical |
| — | `config_file`, `nickname_candidates` | Codex-only; preserve existing values when regenerating a .toml |

Diff procedure: extract Claude body and Codex `developer_instructions`,
normalize whitespace (collapse runs of spaces/newlines), then diff. Report
`description` mismatches separately — they are the routing surface and matter
most.

Write direction: Claude `.md` is canonical → regenerate the `.toml`,
preserving any Codex-only keys already present in the old file.

## 2. MCP: `.mcp.json` ↔ `[mcp_servers.*]`

`.mcp.json`:

```json
{ "mcpServers": { "context7": {
    "type": "stdio", "command": "npx",
    "args": ["-y", "@upstash/context7-mcp"],
    "env": { "API_KEY": "${CONTEXT7_KEY}" } } } }
```

config.toml:

```toml
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
env = { API_KEY = "..." }
```

| `.mcp.json` field | config.toml key | Rule |
|---|---|---|
| server key name | table name `[mcp_servers.<name>]` | verbatim |
| `type: "stdio"` (default) | (absent — stdio is default) | omit |
| `type: "http"` / `"sse"` | `type = "http"`, `url` | Codex supports http; sse/ws may not round-trip — flag |
| `command` / `args` | `command` / `args` | verbatim |
| `env` | `env` | compare KEYS only; NEVER copy values that look secret (`*KEY*`, `*TOKEN*`, `*SECRET*`) — write a placeholder and tell the user to fill it |
| `${VAR}` / `${VAR:-def}` expansion | not expanded by Codex the same way | if a value uses `${VAR}`, prefer Codex `env_vars` (list of env-var references) or leave literal + warn |
| `headers`, `headersHelper`, `timeout`, `alwaysLoad` | — | no direct equivalent; note in report |

Match servers across sides by name. "Same server" = same command+args (stdio)
or same url (http); differing args = divergent.

## 3. Hooks: settings.json ↔ `[hooks]` TOML

Shared events (only these sync): `PreToolUse`, `PostToolUse`,
`PermissionRequest`, `PreCompact`, `PostCompact`, `SessionStart`,
`UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`.

Claude settings.json:

```json
{ "hooks": { "PreToolUse": [
    { "matcher": "Bash", "hooks": [
        { "type": "command", "command": "./check.sh", "timeout": 30 } ] } ] } }
```

Codex config.toml:

```toml
[[hooks.PreToolUse]]
matcher = "Bash"
  [[hooks.PreToolUse.hooks]]
  type = "command"
  command = "./check.sh"
  timeout = 30
```

| Claude field | Codex field | Rule |
|---|---|---|
| event key | event key | identical PascalCase on shared events |
| `matcher` | `matcher` | verbatim (regex both sides) |
| `type: "command"` handler | `type = "command"` | portable |
| `type: "http" / "mcp_tool" / "prompt" / "agent"` | — | Codex has `prompt`/`agent` handler types too, but semantics differ — report, do not auto-sync |
| `command`, `timeout`, `async`, `statusMessage` | `command`, `timeout`, `async`, `statusMessage` | verbatim |
| `shell` | `command_windows` | different mechanism (shell choice vs per-OS command); report |
| `${CLAUDE_PROJECT_DIR}` in commands | — | Codex does not expand it; rewrite to a relative path or warn |

Claude-only events (`SessionEnd`, `Notification`, `PostToolUseFailure`, etc.)
stay Claude-side; list them in the report as non-portable.

## 4. Instructions: the `@AGENTS.md` bridge

Target state for project root:

```markdown
<!-- CLAUDE.md -->
@AGENTS.md

# Claude Code specifics
<only content meaningless to other tools: skill/agent references,
Claude-specific tool names, output-style notes>
```

Conversion procedure when CLAUDE.md currently holds everything:

1. Split CLAUDE.md into shared content (project facts, commands, architecture,
   coding rules) vs Claude-specific content (mentions of Claude tools, skills,
   subagents, hooks, plugin names, permission modes).
2. Merge shared content into AGENTS.md. If AGENTS.md already has its own
   version of a section, diff section-by-section; prefer the newer file's
   wording, ask when both changed.
3. Rewrite CLAUDE.md as `@AGENTS.md` + the Claude-specific remainder.
4. Verify: byte size of resulting AGENTS.md vs Codex `project_doc_max_bytes`.

Note: `@import` is skipped inside code fences — make sure the import line is
at top level. Max import depth 4.

Same procedure applies to `~/.claude/CLAUDE.md` ↔ `~/.codex/AGENTS.md`, and
`CLAUDE.local.md` ↔ `AGENTS.override.md`.

## 5. Skills symlink conversion

To convert a real directory to the canonical layout (example, project scope):

```bash
# skill exists only in .claude/skills/foo → move to canonical, link back
mkdir -p .agents/skills
mv .claude/skills/foo .agents/skills/foo
ln -s ../../.agents/skills/foo .claude/skills/foo
```

User scope: `ln -s ../../.agents/skills/foo ~/.claude/skills/foo`
(relative target matching the existing convention in `~/.claude/skills/`).

If both sides have real diverged copies: diff `SKILL.md` and every bundled
file, merge (newer wins per file, ask on conflict), place merged result in
canonical dir, then link.

## 6. Permission intent mapping (report vocabulary)

Express both sides in a common vocabulary, then compare:

| Intent axis | Derive from Claude | Derive from Codex |
|---|---|---|
| write-access | any allow rule for Edit/Write/NotebookEdit, or defaultMode auto/acceptEdits | `sandbox_mode` = workspace-write or danger-full-access |
| network-from-shell | deny rules on curl/wget absent + sandbox settings | `[sandbox_workspace_write].network_access` |
| approval friction | `defaultMode` (ask/default vs auto/dontAsk/bypassPermissions) | `approval_policy` (untrusted vs on-request vs never) |
| trust | project trusted in `~/.claude.json` | `[projects."<path>"].trust_level` |

Output example: "Claude: auto-edits allowed, network unrestricted. Codex:
workspace-write, network_access = false. Mismatch on network axis."
