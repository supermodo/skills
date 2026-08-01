---
name: hunt
description: Systematic bug hunting across a full-stack TypeScript application. Finds semantic bugs, async issues, data integrity problems, security vulnerabilities, performance hotspots, and UI/browser issues — producing a prioritized report with evidence and fix suggestions. Use when the user says /hunt, asks to "find bugs", "audit this", "check for issues", "scan for problems", wants a code review focused on correctness rather than style, mentions specific concerns like "are there race conditions", "check for security issues", "find performance problems", or wants to validate code quality before a release. Also triggers on "what's wrong with this", "anything broken", "smell check", or any request to systematically find problems in code.
---

# Hunt

> **Requires:** the sibling `protocols` skill (shared protocol masters); uses `skills.config.json` when present. Missing protocols → tell the user to install the full supermodo package.

Systematic bug hunting: automated scans → parallel blind finders → gap sweep →
adversarial verification (Claude skeptics × Codex cross-check × docs
adjudication) → open questions answered by the user (transport per config) →
verified report at the location the repo's docs contract dictates →
teardown (ask, then clean up).
Report-only — never code changes.

**Never escalates on its own.** Findings go to `tdd --debug` to be fixed. The
`bug-council` skill is explicit-invocation only and is never chained into
from here — not for one finding, and certainly not for a list of them. If a
confirmed finding later resists an actual fix attempt, hunt may SUGGEST
convening the council in one line and wait for the user's yes.

The pipeline is **find blind, judge informed**. Finders never read `docs/` —
a finder that knows "this is documented as intentional" stops reporting real
bugs hiding behind stale docs. Judges (verify phase) read everything and must
cite evidence to kill or resolve a finding. No unverified finding reaches the
report.

## Invocation

```
/hunt <path>                    # focused: auto-detect relevant layers
/hunt <path> --<layer>          # focused: specific layer only
/hunt --<layer>                 # project-wide: sweep for one layer
/hunt .                         # full project: all layers
/hunt --diff [base]             # only files changed vs base (default: merge-base with main)
```

### Layer flags

| Flag | Finders dispatched | Reference files |
|------|--------------------|-----------------|
| `--bugs` | semantic, async, error-handling, structure, comparison | `semantic.md`, `async.md`, `error-handling.md`, `structure.md` |
| `--data` | data-integrity, type-safety | `data-integrity.md`, `type-safety.md` |
| `--perf` | performance | `perf.md` |
| `--security` | security | `security.md` |
| `--frontend` | frontend (code-level) | `frontend.md` |
| `--browser` | browser (runtime) | `browser.md` |

No `--layer` given → auto-detect:
- Utility/backend code → `--bugs --perf`
- Data pipeline code → `--bugs --data --perf`
- React/frontend code → `--bugs --frontend --perf --browser`
- API handlers → `--bugs --security --perf`
- Full project → all layers
- `--diff` → detect per changed file, union the results

## Core Principles

### Evidence Over Opinion
Every finding must include: file path and line number, code snippet or
screenshot, why it's a problem (impact), and a suggested fix. No evidence =
not a finding. This applies to verification verdicts too: a skeptic kills a
finding only with a citation (code line, type guard, or doc quote).

### Finders Are Blind
Finder dispatch prompts must NOT include `docs/` content, paths to design
docs, or "this is intentional" context. Uncertain findings get
`"question": true` — the verify phase answers them from docs, the finder
never self-censors.

### Severity — calibrated anchors
Claiming a severity means naming the concrete consequence at that level. Can't
name it → drop one level.

- **Critical**: data loss, security breach reachable in production, a wrong
  domain calculation reaching a result users trust (e.g., a correction factor
  applied twice)
- **High**: silent failure hiding real errors (`catch → return []`), race
  condition with a plausible trigger, O(n²) on a large-input hot path
- **Medium**: divergent sibling implementations, missing tests on a money
  path, structural issue that will breed bugs
- **Low**: dead exports, naming collisions, minor type looseness, style

### Cross-Layer Notes
Even in single-layer mode, an obvious critical bug from another layer gets
flagged as **informational** — "out of scope but noted". A perf audit isn't
blind to correctness.

---

## Phase 1: Scope & Detect

1. Resolve targets: for `--diff`, `git diff --name-only <base>...HEAD` plus
   uncommitted changes; otherwise the given path(s)
2. Determine code type per the auto-detect table (imports React/Hono JSX →
   frontend+browser; queries a SQL/columnar store → data; HTTP routes →
   security; always bugs+perf)
3. List files in scope with line counts
4. Assign the run-stamp `YYYYMMDDHHmmss` — used later for finding ids

## Phase 2: Automated Scans

Objective signals, gathered once, included in every finder dispatch.

Run the project's configured `commands.test` / `commands.lint` (argv arrays
from `skills.config.json` — the first use of each in a session needs the
user's approval per the config contract); fall back to the project's own
task runner when no config is present. Capture counts and failures.

```bash
# Tests + static checks — use the configured commands, e.g.:
#   commands.test  → fast suite
#   commands.lint  → format + lint + type-check

# Pattern greps
grep -rn 'catch.*return \[\]\|catch.*return null\|catch.*return 0' <target>
grep -rn '\blet\b\|: any\|as unknown as' <target>

# Repeated construction (5+ hits of one shape → flag prominently)
grep -rc '\.push({' <target>

# Duplicated computation (same math cluster in 2+ functions → flag)
grep -rn 'Math\.pow\|Math\.min\|Math\.max\|Math\.random\|Math\.floor' <target>

# Usage tracing: for each export, grep callers; flag zero-caller exports
grep -rn '^export' <target>
```

Adapt the grep patterns and static-check commands to the project's toolchain
and language.

## Phase 3: Finders — one parallel batch

Dispatch ALL finders for all active layers in ONE parallel batch via the Agent
tool — never inline, never sequential. Each finder reads ONE reference file
and checks only those patterns; dedup happens at merge, so overlap between
finders is cheap and missed coverage is not. While the batch runs, apply the
liveness protocol (`../protocols/references/handoff.md`, "Liveness"): check
each finder periodically for output growth; a stalled finder is killed and
retried once, a second stall drops it with the gap recorded in the report.

### Dispatch table

Subagent types below are the generic defaults. When the project configures an
agent roster (`agents.dir` in `skills.config.json`), prefer a matching
specialist from that roster for a lane (e.g. a domain-data reviewer for
data-integrity, a UI reviewer for frontend/browser); with no roster, every
lane uses `general-purpose`. The "skill to invoke first" column is optional
polish — invoke it only if it's in the session's skill list, otherwise skip
it and rely on the reference file; never guess skill names.

| Finder | subagent_type | model | Skill to invoke first (optional) |
|--------|---------------|-------|------------------------|
| semantic | `general-purpose` | inherit | — |
| async | `general-purpose` | inherit | — |
| error-handling | `general-purpose` | inherit | — |
| structure | `general-purpose` | `sonnet` | a YAGNI/duplication-audit skill, if available, on top of structure.md |
| comparison | `general-purpose` | inherit | — (no reference file; lens described below) |
| data-integrity | `general-purpose` (or a domain-data reviewer from `agents.dir`) | inherit | — (read-only; its checklist + data-integrity.md) |
| type-safety | `general-purpose` | `sonnet` | — |
| perf | `general-purpose` | inherit | — |
| security | `general-purpose` | inherit | — |
| frontend | `general-purpose` (or a UI reviewer from `agents.dir`) | inherit | a UI/UX audit skill, if available |
| browser | `general-purpose` (or a UI reviewer from `agents.dir`) | inherit | a browser-automation skill (`claude-in-chrome` or equivalent); an accessibility skill for a11y items |

**Comparison finder** (part of `--bugs`): group sibling functions (similar
names, shared config types, same module) and hunt divergence — same formula
implemented differently, one sibling returns Result while another throws, one
respects a config field its twin hardcodes, different assumptions about shared
mutable state. These bugs live between functions; per-file finders miss them.
Feed it the Phase 2 math-operation grep locations.

**Dual-model finders**: run a Codex finder alongside the Claude one for five
layers — semantic, async, data-integrity (where semantic blind spots cost
most), plus structure and perf (single-finder lanes get out-sampled when only
the loud layers are doubled: their long tail of duplication and constant-factor
findings is a lottery draw one finder can't cover). One batched read-only CLI
call per layer, in the same parallel wave:

```bash
codex exec -s read-only --json -o "$D/codex-<layer>.json" "
Hunt for <layer> bugs in these files: <file list>.
Checklist: <paste the layer's reference file content>.
Report ONLY a JSON array of findings:
[{\"severity\": \"...\", \"category\": \"...\", \"file\": \"...\", \"line\": N,
  \"title\": \"...\", \"evidence\": \"...\", \"impact\": \"...\", \"fix\": \"...\",
  \"question\": false}]
Every finding needs file:line + evidence. No evidence = don't report it."
```

Codex and Claude findings merge identically in Phase 4. If `codex --version`
fails, skip the Codex finders and note "single-model hunt" in the report —
never silently degrade.

### Finder dispatch prompt (every finder)

Finders don't inherit this conversation. Every dispatch prompt carries:

1. The ABSOLUTE path of its ONE reference file, with the instruction to follow
   ONLY that checklist
2. The target file list + Phase 2 automated results
3. The skill invocation from the dispatch table (invoke FIRST, then apply the
   checklist) — if the skill isn't in the session's skill list, skip it and
   rely on the reference file; never guess skill names
4. The finding format below — WITHOUT ids (ids are assigned at merge)
5. The blindness rule: do not read `docs/`; uncertain → `"question": true`
6. Never create or remove git worktrees; work read-only in the run's
   designated tree — the main tree, or the task worktree the orchestrator
   passed in (its path is in the dispatch prompt when worktree mode is on)

**Fallbacks** (user-level skill — environments differ): unregistered
subagent_type → `general-purpose` with the same prompt. Agents with restricted
tools can't invoke skills — the table already accounts for this.

### Finding format

```json
{
  "severity": "critical|high|medium|low",
  "category": "Layer > Subcategory",
  "file": "path/to/file.ts",
  "line": 123,
  "title": "Short description",
  "evidence": "Code snippet or explanation",
  "impact": "What breaks and for whom",
  "fix": "Suggested approach",
  "question": false
}
```

### Browser finder (if --browser active)

Requires the app's dev server running — check its URL with
`curl -s -o /dev/null -w "%{http_code}" <url>` first; if not running, tell the
user. Follow `references/browser.md`.

## Phase 4: Merge, Gap Sweep & Dedup

1. Collect all finder outputs (Claude + Codex)
2. Deduplicate: same file:line → keep the most specific finding; note when
   both models found it independently (that's corroboration — record it)
3. **Gap sweep** — blind parallel finders converge on the loudest code;
   mechanisms in quiet corners, and the polish tail of loud files, go
   unclaimed. Dispatch ONE more finder (`general-purpose`, inherit) carrying:
   - the deduped findings as a coverage map — `file:line — title` only,
     never docs content (blindness holds: it sees findings, not docs)
   - the in-scope file list annotated with per-file finding counts
   - the instruction: hunt where the map is thin — zero-finding files first,
     then the quiet corners of claimed files (duplication, hygiene,
     constant-factor perf that behavioral finders deprioritize). Report only
     mechanisms absent from the map. Same finding format, same blindness rule.
   Merge and dedup its output like any finder's.
4. Assign ids: `HNT-<run-stamp>-<seq>` in severity order, sequential. Ids are
   final from here — verification annotates them, never renumbers
5. Sort by severity, then file path

## Phase 5: Verify — no finding skips this

Read `references/verification.md` and follow it. Summary: every finding
(every severity) gets an adversarial Claude skeptic — one per finding for
small lists, subsystem clusters of 6-12 above ~25 — attacking it: not
reproducible / impossible by construction / documented-intentional /
severity inflated. Each skeptic's verdicts are persisted to a file the
moment they return. A batched Codex cross-check attacks the same list
independently. Questions get answered from `docs/` with citations. Verdicts
merge mechanically; disputes are kept and shown, never silently resolved.

**Open questions are answered live, not shipped.** After both verify legs
return and the merge matrix leaves questions OPEN (docs silent on both sides),
ask the user — batched, max 4 questions per call — on the configured transport
(`AskUserQuestion` only when `questions.perSkill.hunt`/`questions.transport` = `"tool"`; default plain chat) — BEFORE
writing the report. First present each question per the mandatory format in
`references/verification.md` (which defers to `../protocols/references/questions.md`): a
plain-words explanation (max 4 lines, no doc/id/phase references), a one-line
Claude suggestion, a one-line Codex adversarial counter. Each answer: (a) is
recorded via the librarian in the project's `decisions/` convention so the
next hunt resolves it from docs, and (b) becomes the citation that re-resolves the
finding (Documented / Confirmed / Refuted per the answer). Only questions the
user explicitly defers ("skip" / "decide later") reach the report's Open
Questions section.

The point: finder output is inflated by construction (blind finders,
overlap-tolerant dispatch). Verification is where precision comes from —
skipping it ships the inflation to the user.

## Phase 6: Report

1. **Resolve the report location and format from the project's own docs contract
   before writing — never assume `docs/audits/`.** Many repos put audits
   somewhere specific with mandatory front-matter, a size cap, and a fixed
   template; writing to the wrong path or shape fails their docs checks.
   - Read the project's docs router (`docs.entry` from `skills.config.json`,
     default `docs/README.md`) first, and follow the convention it points at
     exactly: the required directory (often `docs/work/<initiative>/` or a
     standalone `docs/work/<scope>-hunt/`), the filename
     (`audit-YYYY-MM-DD-<scope>.md` is common), the front-matter keys, the
     finding-id scheme (e.g. `F-NN`), the per-finding disposition, and any size
     cap. Compact the report at birth — a bloated "full report" draft must
     never be committed anywhere, and never park hunt output in an `archive/`
     folder (archives are for retired work, not fresh evidence). Ship the
     machine-readable findings as JSONL shards beside the report in a
     `findings/` folder, split by disposition so a fix agent loads only the
     actionable set: `findings-confirmed-<severity>.jsonl` — one file per
     severity (critical/high/medium/low, omit empty ones; id, F, severity,
     category, file, line, title, evidence, impact, fix per line, severity
     matching the file name; file:line must point at a real repo location —
     runtime-only observations set locus: "runtime" instead of a fake
     line 0), `findings-disputed.jsonl` (adds both models' verdicts
     + evidence verbatim), `findings-other.jsonl` (adds verdict:
     resolved|documented|doc-drift|refuted, + resolution citation). Keep
     each shard ≤100KB (overflow → `findings-<shard>-2.jsonl`).
   - Resolve the live location with the project's own docs tooling when it
     exists (a `docs:find`/`docs:check` command in config, or grep for prior
     `audit-*.md` / "Hunt Report"). Mirror the most recent existing hunt
     report's structure.
   - Hunt ALWAYS writes its report + shards under
     `.skills/supermodo/hunt/YYYY-MM-DD-<target-name>.md` (reports
     protocol) — never directly into `docs/`, never a new `docs/audits/`
     folder. When the project's docs contract dictates an audit location
     inside `docs/`, that location is honored THROUGH librarian: hand the
     finished report over (invoke librarian, or flag it for its next pass)
     and let it place a copy or pointer at the contract's location. The
     contract decides WHERE the audit lives; librarian remains the only
     writer under `docs/`.
   - After librarian places anything, run the project's docs validator if it
     has one (`commands.docsCheck`, or the librarian's bundled `docs-check.ts`) and
     fix what it flags.
2. **If the project runs a findings ledger** (a configured or documented
   findings-filing tool), file every CONFIRMED critical and high finding to it:
   `dimension` = category, `blast_radius` = impact, `owner_hint` = the agent
   best placed to fix (from the project's `agents.dir` roster). Refuted /
   documented / disputed findings are never filed. Filing must be idempotent —
   re-running never double-files (dedupe on the finding id). Projects without
   such a ledger skip this step.
3. Print one line: `Hunt complete: N confirmed (C crit, H high), N refuted, N documented, N disputed, N open questions. Report: <path>`

## Phase 7: Teardown

After the report ships, inventory what the hunt left running: background
subagents still alive, background Bash shells (Codex `exec` calls, log tails,
dev servers started for --browser), browser tabs opened by the browser finder.
Then ask the user (transport per `questions.transport`/`perSkill.hunt`) — one
question listing exactly what is still up — whether to tear it all down. On yes: stop background tasks
(TaskStop), kill lingering shells, close hunt-opened browser tabs. On no:
leave everything and list what stayed up so nothing lingers silently. Never
tear down without asking — the user may want a finder's transcript or a
running dev server.

### Report format

```markdown
# Hunt Report: <target>
Generated: YYYY-MM-DD HH:MM

## Summary
| Verdict | Critical | High | Medium | Low | Total |
|---------|----------|------|--------|-----|-------|
| Confirmed | | | | | |
| Disputed | | | | | |
| Documented (intentional) | | | | | |
| Refuted | | | | | |
Open questions: N

## Automated Results
Tests / lint / type-check / dead-export counts. "Single-model hunt" note if
Codex was unavailable.

## Confirmed
### HNT-<run-stamp>-<seq>: <title>
- **File**: `path:line`
- **Category** / **Evidence** / **Impact** / **Fix**
- **Verification**: <strongest surviving evidence; "corroborated by both models" when true>

## Disputed
(verdicts disagreed — both arguments quoted verbatim, user decides)

## Documented (intentional)
(finding + the doc citation that resolves it — informational, not filed)

## Doc Drift
(code contradicts docs/ — either the code or the doc is wrong; user decides which)

## Open Questions
(should be empty — docs-silent questions are asked to the user before the
report is written. Only questions the user explicitly deferred land here.
Answers live in the project's `decisions/` convention — the next hunt's verify
phase resolves them automatically instead of re-asking)

## Refuted (appendix, collapsed)
(what was checked and killed, with the killing citation — documents coverage)

## Browser Findings (if --browser)
Console / network / accessibility / performance / memory / interactions
```

---

## Flow integration

When invoked by the `flow` orchestrator, hunt is **stage 3** (bug audit,
optional) running as a subagent with its own context:

- **Write the stage report** per `../protocols/references/reports.md` to
  `.skills/supermodo/runs/<run-id>/03-hunt.md` — YAML frontmatter with
  `skill: hunt`, `status` (`ok` | `failed` | `needs-input` | `skipped`),
  `summary` (compressed outcome + the confirmed-finding counts), `drift_notes`
  (docs that promise behavior the code doesn't match — DOC-DRIFT verdicts go
  here), `decisions`, and `questions` (only when `status: needs-input`). The
  full report + JSONL shards ship to the RUN DIRECTORY (beside the stage
  report) — in flow, nothing is written under `docs/` at stage 3; if the
  project's docs contract wants the audit placed in `docs/`, queue that
  placement as a `decisions` entry for the stage-7 librarian pass.
- **Never mutate documentation — in ANY mode.** Standalone: record answers
  and doc-worthy decisions in the hunt report (under `.skills/supermodo/`)
  and hand them to librarian (invoke it, or flag them for its next pass) —
  hunt never writes ADRs or any `docs/` file itself. In flow: emit them as
  `decisions` / `drift_notes` in the stage report — the stage-7 librarian
  pass persists them. Drift notes only; no doc writes.
- **Read prior stage reports** from the run directory for context — the
  stage-2 `work` report scopes the audit to the changed feature.
- **Questions mid-flow** don't call AskUserQuestion: unresolved OPEN questions
  go in the report's `questions` frontmatter with `status: needs-input`; the
  orchestrator routes them and continues this subagent with the answers.

## Layer Reference Files

| File | Patterns | Focus |
|------|----------|-------|
| `semantic.md` | Stale closures, stale accumulators, divergent representations, config-behavior mismatch, off-by-one, predicates, dead code | Logic correctness |
| `async.md` | Missing await, race conditions, uncaught exceptions in wrappers, promise leaks, timer leaks | Concurrency |
| `error-handling.md` | Silent swallowing, pattern catalog, consistency, error type granularity, logging audit | Error patterns |
| `structure.md` | Repeated construction, exact/near duplication, circular deps, dead exports, unused variables | Code organization |
| `data-integrity.md` | Domain invariants, temporal, entity resolution, completeness, floating point, SQL bugs, N+1 queries | Domain data |
| `type-safety.md` | any leakage, name collisions, loose types, assertion safety, schema drift | Type system |
| `perf.md` | O(n) hotspots, recomputation, allocations, memory, iteration tradeoffs, SQL performance | Runtime speed |
| `security.md` | OWASP injection, access control, data exposure, misconfiguration, dependencies | Security |
| `frontend.md` | React state, hydration, component patterns, accessibility | UI code |
| `browser.md` | Console, network, visual, Lighthouse, performance, memory, interactions | Runtime testing |
