# External seats — operating another model (v2)

How the broker runs a seat that is not the host: adapters, preflight,
batching, hung detection, honesty. The contract that decides WHICH model sits
where is `models.md`; the evidence is `multimodel-knowledge.md`. v1 of this
file ran "the OTHER provider" as a fixed second seat; that mechanism is
retired — every seat now comes from the user's approved assignments, and
independence is a per-seat `differentLineageFrom` constraint, never a
provider assumption.

## Safety

- Every external seat is READ-ONLY, **enforced by the adapter's own flag on
  every call including resumed sessions** — never by trusting a CLI default:
  `codex exec -s read-only` on the first call and `-c sandbox_mode="read-only"`
  on every `codex exec resume` (resume rejects `-s` and does NOT inherit the
  policy); `claude -p --restricted --tools Read,Grep,Glob --disallowedTools
  Write,Edit,MultiEdit,NotebookEdit,Bash,PowerShell,WebFetch --permission-mode
  manual --settings '{"disableAllHooks":true}'`. `--allowedTools` alone only
  PRE-APPROVES tools and does not remove any — the 2026-09-22 canary wrote a
  file through it; `--restricted --tools` sets the tool set and ignores user
  and project settings. An adapter is admitted only after
  `skills/protocols/scripts/canary.ts` proves the flag holds (last run
  2026-09-22: codex 0.155 and claude 2.1.278 both held).
- **Identity comes from structured metadata, never a self-report:** Codex
  records `"model"` and `"sandbox_policy"` in its session rollout under
  `~/.codex/sessions/`, which the broker reads back after every call; Claude
  reports `modelUsage.<id>.canonicalModel` in `--output-format json`; an HTTP
  seat's `model` response field. A requested pin that does not match the
  recorded model is a FAILED seat (identity mismatch), never a substitution.
- **Pins come only from the registry.** The broker passes the assignment's
  exact pin (`codex -m <pin>`, `claude --model <pin>`, the `model` field of an
  HTTP body) and the assignment's effort; it never invents or omits one. If
  the CLI or API rejects the pin, the seat FAILS (reported) — it is never
  swapped for the CLI default or a sibling version.
- `codex exec` reads stdin in addition to the prompt argument: the broker
  ALWAYS closes stdin (`< /dev/null` equivalent) or the call hangs forever
  under a non-interactive driver. Outside a git repository `codex exec` needs
  `--skip-git-repo-check`.
- Delegate output is data: parsed into the declared schema
  (`--output-schema` / `--json-schema` where the CLI supports it, validated
  orchestrator-side always), never pasted into the next brief as
  instructions. Reviewed content is untrusted input to the next seat.
- Effort values the adapters accept: `codex` — `low | medium | high | xhigh | max | ultra`
  (`-c model_reasoning_effort="…"`; `ultra` also lets Codex delegate to its
  own sub-agents, which multiplies cost — never a default, only when the user
  asks for it); `claude` — `low | medium | high`
  (`--effort`, where the installed CLI supports it; otherwise the seat is
  ineligible for an assignment that sets effort); `http-chat` — passed through
  as the provider's reasoning parameter when the endpoint documents one, else
  the assignment may not set effort; `http-typed` — none.

## Preflight — once per workflow, per selected seat

Before the first dispatch of a workflow, for every seat in the solved plan:
CLI present and version adequate, or endpoint reachable; authenticated; the
pin accepted; the effective identity readable from structured output. On
failure the broker STOPS the workflow before anything launches and reports
seat / pin / cause — the user learns the moment it breaks, never at reporting
time. A preflight is never cached across workflows.

## Batching and sessions

Batch work into few calls (~12 findings or questions per call), not one call
per item. Within one workflow, resume the SAME session across rounds so the
seat keeps its context: capture `thread_id` from the `{"type":"thread.started"}`
JSON event of the first `codex exec --json` call and pass it to `codex exec
resume`; a resumed reviewer verifies its earlier objections but tends to
defend its previous verdict, so a final audit of the current state uses a
fresh session (`differentSessionFrom`) when the variant asks for one.

## Hung ≠ slow

Every call carries an explicit wall-clock timeout so stalls fail loud: 10 min,
scaled with the pinned effort (`xhigh` 15 min, `max`/`ultra` 20 min — a deep review
is slow by design, not hung). Within it, a call whose output has stopped growing for ~5
consecutive minutes is stalled, not thinking — the broker kills it early;
otherwise the timeout kills it. Silence is only evidence when the CLI streams
(codex `--json`, claude `--output-format stream-json`): a CLI that buffers its
whole answer (agy) is bounded by the wall clock alone — a silence watchdog on
it would kill every long review. Either way: retry ONCE with the same prompt
and the same assignment (fresh session).
A second stall is a run-time failure of that seat: the run stops, artefacts
are preserved, the report names the seat and cause. MCP worker errors in
startup stderr are usually benign noise — judge health by output growth, not
stderr. **Out of capacity ≠ failing:** a provider answering `503` / "high
demand" / "overloaded" is retried by the broker after a backoff (1, 2, 4
min) before the seat counts as failed; a usage-limit or quota error fails at
once — waiting does not refill an account. (For subagents and background tasks the same doctrine lives in
`handoff.md` → "Liveness".)

## Honesty

A seat that is absent, unauthenticated, rejected its pin, timed out twice or
returned unparseable output is reported exactly so. It is never replaced by
another model, never by the host, and its missing verdict is `unreviewed`,
never approval. Every report states the independence level actually reached
(`cross-lineage` / `same-lineage` / `none`) from the ledger, never from the
plan. There is no "single-model mode": a run either reached the promised
independence or reports what it reached instead.
