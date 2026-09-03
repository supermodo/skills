# Bug Council — intake

Steps of the `bug-council` procedure. The rules that govern them are in
`../SKILL.md`; this file is the detail for these steps only.

## Contents

- 1. Infer context before asking questions
- 2. Ask only the missing questions
- 3. Detect the available council
- 4. Select the hunt mode
- 5. Create the immutable bug dossier

## 1. Infer context before asking questions

Inspect the current conversation and the user's bug description first.

Then inspect the repository when available:

```bash
git rev-parse --show-toplevel
git status --short
```

Read applicable instructions and discover relevant commands from files such as:

```text
AGENTS.md
CLAUDE.md
README.md
CONTRIBUTING.md
package.json
deno.json
pyproject.toml
Cargo.toml
go.mod
Makefile
justfile
docker-compose.yml
compose.yml
```

Determine, where possible:

- actual behavior;
- expected behavior;
- exact reproduction;
- failure frequency;
- error messages, logs, traces, or failing assertions;
- affected component;
- suspected change;
- last known good revision;
- relevant test, lint, typecheck, and build commands;
- whether the working tree is dirty;
- actions that appear safe or unsafe;
- available native subagent capabilities;
- available external coding-agent commands.

Do not ask the user for information that already exists in the conversation, repository, issue description, logs, or current environment.

## 2. Ask only the missing questions

Ask one compact batch containing no more than five questions.

Accept `unknown` as a valid answer.

Normally ask only the missing parts of these questions:

1. **Behavior**

   What happens, and what should happen instead?

   Request the exact observable difference, assertion, error, or undesired state.

2. **Reproduction**

   What exact command or steps trigger the problem?

   Ask whether it is deterministic or flaky and, for a flaky failure, approximately how frequently it occurs.

3. **Scope and history**

   What component, file, request, service, release, commit, or recent change is suspected?

   Ask for the last known good state only when it is not already discoverable.

4. **Permissions and boundaries**

   May the hunt:
   - run local tests, builds, typechecks, and linters;
   - access required local services;
   - access the network;
   - start containers;
   - add temporary instrumentation;
   - create temporary Git worktrees;
   - edit code after diagnosis?

   Ask the user to identify prohibited commands, files, systems, data, or services.

5. **Budget**

   Ask for `quick`, `standard`, or `deep` only when the user has expressed a cost, speed, token, or provider constraint.

   Otherwise select the mode automatically.

Use wording similar to:

```text
I need only the missing details before starting:

1. What is the exact actual behavior, and what should happen instead?
2. What command or steps reproduce it, and is it deterministic or intermittent?
3. Is there a suspected component/change or a known-good revision?
4. May I run local tests/builds, use local services or the network, create temporary worktrees, and edit code after diagnosis? Please list any prohibited actions.

“Unknown” is acceptable for any item.
```

When enough information is already available, ask no questions and start immediately.

After the answers arrive, do not ask for another confirmation unless a later action crosses a previously unspecified safety boundary.

## 3. Detect the available council

Prefer one independent seat from each available provider:

- Codex;
- Claude;
- Kimi;
- native subagents exposed by the current host.

Use the current host's native subagent mechanism for its own provider whenever possible. Avoid launching a nested copy of the host CLI merely to create another seat.

For example:

- when running inside Codex, prefer a native Codex subagent for the Codex seat;
- when running inside Claude Code, prefer a native Claude subagent for the Claude seat;
- when running inside Kimi Code, prefer a native Kimi subagent for the Kimi seat.

Detect external CLIs without assuming they exist:

```bash
command -v codex || true
command -v claude || true
command -v kimi || true
```

Inspect the installed CLI help before constructing a non-interactive command:

```bash
codex --help
claude --help
kimi --help
```

Use only flags supported by the installed version.

External investigators must:

- run with the repository as their working directory;
- receive the same immutable dossier;
- operate in read-only or approval-restricted mode during diagnosis;
- write their response to a separate temporary file;
- receive no other investigator's initial report;
- avoid including secrets or unrelated files in their prompts.

A command named `claude` may be configured to route to Kimi or another provider. Do not count it as an independent Anthropic seat unless its configuration actually uses an Anthropic model.

Likewise, identify provider independence by the real model/provider configuration rather than by the executable name alone.

When fewer providers are available, fill the remaining seats with fresh native subagents using distinct evidence scopes.

Do not create decorative personas that all inspect the same evidence.

## 4. Select the hunt mode

Choose automatically unless the user explicitly selected a mode.

### Quick

Use when the bug is:

- deterministic;
- local;
- low-risk;
- narrowly scoped;
- inexpensive to reproduce.

Configuration:

- 2 blind investigators;
- no debate unless their findings materially conflict;
- one adjudicator or coordinator evidence review;
- one implementer;
- one independent verifier.

### Standard

Use as the default for an unclear codebase bug.

Configuration:

- 3 blind investigators;
- one adversarial falsification round;
- a fresh independent judge;
- one implementer;
- a separate verifier.

### Deep

Use when the bug involves one or more of:

- intermittent or flaky behavior;
- concurrency or ordering;
- caching or stale state;
- lifecycle behavior;
- cross-service interactions;
- security;
- data loss or corruption;
- production-only behavior;
- no reliable reproduction;
- a large blast radius;
- an expensive regression;
- several plausible surviving causes.

Configuration:

- 4 blind investigators;
- one falsification round;
- one rebuttal round;
- discriminating experiments;
- a fresh independent judge;
- one implementer;
- a separate verifier;
- at least one boundary, mutation, or counterexample check.

Escalate:

- from `quick` to `standard` when the reports materially disagree or lack direct evidence;
- from `standard` to `deep` when several hypotheses survive experiments or the likely patch has a high blast radius.

Do not add agents merely because more agents are available.

## 5. Create the immutable bug dossier

Create a temporary hunt directory outside the repository when possible:

```bash
REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
HUNT_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/bug-council/$(basename "$REPO")-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$HUNT_DIR/private" "$HUNT_DIR/public" "$HUNT_DIR/experiments"
```

Create `dossier.json`:

```json
{
  "observed_behavior": "...",
  "expected_behavior": "...",
  "reproduction": {
    "steps": ["..."],
    "command": "...",
    "frequency": "deterministic | intermittent | N/M | unknown"
  },
  "evidence": [
    "error",
    "stack trace",
    "log",
    "failing assertion",
    "observable incorrect state"
  ],
  "environment": [
    "operating system",
    "runtime",
    "dependency versions",
    "relevant configuration"
  ],
  "suspected_scope": ["files", "modules", "services", "commits", "or unknown"],
  "last_known_good": "commit, release, date, or unknown",
  "working_tree_status": ["..."],
  "working_tree_is_part_of_bug": false,
  "allowed_actions": ["read repository", "run selected tests"],
  "prohibited_actions": ["..."],
  "test_commands": ["..."],
  "non_goals": [
    "unrelated refactoring",
    "formatting unrelated files",
    "dependency upgrades"
  ],
  "mode": "quick | standard | deep"
}
```

Treat the dossier as immutable after the investigation starts.

Corrections must be recorded as separate amendments rather than silently replacing previous facts.
