# Cross-model adversary operations (v1)

How supermodo skills run the OTHER provider's CLI as an independent
adversary. Host-neutral: under Claude Code the adversary is `codex exec`;
under Codex the adversary is `claude -p`. Never substitute a same-provider
agent and call it a second model.

## Safety

- Adversary sessions are ALWAYS read-only, ENFORCED BY FLAGS — never by
  trusting the user's CLI defaults: `codex exec -s read-only` (resumed
  sessions: `-c sandbox_mode="read-only"` — resume rejects `-s`);
  `claude -p --allowedTools "Read,Grep,Glob"` (an explicit allowlist of
  read-only tools; write-capable tools such as Bash/Edit/Write must not
  appear in it). The adversary never modifies files.
- Never pin a model (`-m`): the user's CLI config default applies. Pinned
  `-codex` variants 400 on ChatGPT-account auth.
- `codex exec` reads stdin in addition to the prompt arg: ALWAYS redirect
  `< /dev/null` or it hangs forever under a non-interactive driver.
- Outside a git repo, `codex exec` needs `--skip-git-repo-check`.

## Preflight

Before the first adversary call of a workflow: CLI present, version
adequate, authenticated. On failure STOP and ask the user: fix and retry /
continue single-model / abort. **Never silently degrade a two-model
guarantee to one** — the user learns the moment it breaks, not at reporting
time. Single-model results always say so.

## Batching

Batch work into few calls (~12 findings/questions per call), not one call
per item. Resume the SAME session across rounds so the adversary keeps its
context (`codex exec resume <thread_id>`); capture `thread_id` from the
`{"type":"thread.started",...}` JSON line on the first call.

## Hung ≠ slow

(For SUBAGENTS and background tasks the same doctrine lives in
`handoff.md` → "Liveness" — this section governs adversary CLI processes.)

Give every call a generous explicit timeout (10 min) so stalls fail loud.
Within that window, a call whose output file has stopped growing AND whose
process sits near zero CPU for ~5 consecutive minutes is stalled, not
thinking — you may kill it early; otherwise the timeout kills it. Either
way: retry once with the same prompt (fresh session). Second stall → fall
back to single-model for that batch, annotate "no adversary verdict",
record the failure. MCP worker errors in startup stderr are usually benign
noise — judge health by output growth, not stderr.

## Degradation honesty

If the adversary is unavailable (CLI absent, unauthenticated, both retries
stalled): say so, proceed single-model with explicitly labeled self-review,
and mark every affected result "single-model". Never fake a second opinion.
