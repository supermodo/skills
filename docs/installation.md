# Installation & updating

## Claude Code (plugin — recommended)

```
/plugin marketplace add supermodo/skills
/plugin install supermodo
```

Skills appear namespaced: `supermodo:work`, `supermodo:hunt`, … — type
`/supermodo:` to see them all.

## Codex / other tools (skills CLI)

```
npx skills@latest add supermodo/skills
```

Skills install under their plain names (`work`, `hunt`, …) into the neutral
`~/.agents/skills/` location that multiple agent CLIs read.

## One toolkit, one install

The skills are a system, not a grab-bag:

- **`protocols`** (the shared brain — every protocol the skills follow) is a
  **dependency of every other skill**.
- **`config`** (the per-project configuration keeper) is required by the
  docs-driven core (`flow`, `work`, `librarian`, `tests`); the utility skills
  (`commit`, `release`, `hunt`, …) use it when present and fall back to
  sensible defaults — loudly, never silently.

Both install paths bring the whole set. Every skill verifies its dependencies
at start and tells you exactly what's missing, and `protocols` doubles as the
install doctor (`/supermodo:protocols` → "check my install").

## Updating

New versions land on `main` (see [CHANGELOG.md](../CHANGELOG.md)).

**Claude Code** (the plugin's full name is `supermodo@supermodo-skills`):

```
claude plugin marketplace update supermodo-skills
claude plugin update supermodo@supermodo-skills
```

then restart Claude Code.

**Skills CLI:**

```
npx skills@latest update
```

## Using both installs? Avoid duplicate menu entries

The skills CLI also symlinks the plain skill names into `~/.claude/skills/`,
so Claude Code would list every skill twice (`supermodo:flow` *and* `flow`).
Keep the plugin as Claude's source and drop just the Claude-side symlinks
(the `~/.agents` copies your other tools use are untouched):

```bash
cd ~/.claude/skills
for s in bug-council commit config flow grill hunt librarian next protocols \
         refactor release reports sync-configs tdd tests work; do
  [ -L "$s" ] && rm "$s"
done
```

Re-run it if a later `skills update` recreates the links.

## Checking the installation

```
/supermodo:protocols
```

and ask it to "check my install" — it verifies all skill folders are present,
the protocol masters exist, and (inside a project) that `skills.config.json`
validates and the docs convention is in place.
