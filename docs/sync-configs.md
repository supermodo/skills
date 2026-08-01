# sync-configs — Claude Code ↔ Codex CLI configuration sync

Both tools configure the same concepts — instructions, skills, subagents,
MCP servers, hooks, permissions — in different files and formats. Edits land
on one side and silently drift from the other. This skill makes drift
visible and repairable in one pass.

## When to use

- "Are my Claude and Codex setups aligned?"
- After editing one tool's config and wanting the other to match — "sync
  this skill to codex", "I changed my-agent.md, mirror it".
- Migrating configuration from one tool to the other.

## Modes

| Invocation | Mode |
|---|---|
| `/supermodo:sync-configs` | **Full audit** — every surface, user + project scope |
| `/supermodo:sync-configs <item>` | **Targeted** — one named skill, agent, file, or surface; nothing else scanned |

## How the full audit works

1. **Locate** everything in both scopes (`~/.claude`, `~/.codex`,
   `~/.agents/skills`, project `.claude/`, `.codex/`, `.agents/skills/`,
   `.mcp.json`, CLAUDE.md/AGENTS.md).
2. **Scan each surface pair** for drift: missing on one side, divergent
   content, structural problems (real dir where a symlink belongs,
   deprecated locations, broken links), semantic mismatches (permission or
   sandbox intent), and size limits that would silently truncate.
   Cross-format pairs (agents md↔toml, MCP json↔toml) are normalized before
   diffing so format noise never buries real drift.
3. **Report** — one numbered drift table plus short decisive diffs.
4. **Approve** — you pick which numbered actions to apply; nothing you
   didn't select is touched. Anything overwritten is backed up first.
5. **Apply and re-verify** each surface.
6. **Adversarial cross-verification** — the *opposite* provider reads the
   result read-only and tries to refute that the sync is correct and
   complete (it's also the tool that will consume the derived config, so it
   verifies from the consumer's seat).

## Conventions it follows

- **Shared-source:** content lives in the neutral location (`AGENTS.md`,
  `.agents/skills/`) and tool-specific files derive from it — but an
  existing deliberate inverse convention in your repo is respected, not
  "fixed".
- **Verbatim fidelity:** names, descriptions, and bodies are copied exactly
  when translating — descriptions are the routing surface both tools use,
  so rewording changes runtime behavior.
- **Never syncs secrets** (auth files, keys, tokens — reported, never
  copied), never deletes your content, never touches git state.

Requires: `protocols`; uses `skills.config.json` when present.
