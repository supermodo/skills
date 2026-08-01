# User-question protocol (v1)

How ANY supermodo skill asks the user something. Goal: few questions, each
pre-fought, each decidable in one read.

## Triage — three classes

- **(a) Discoverable facts** — answerable from the codebase or docs. NEVER
  reach the user. Search first; the docs router and `decisions/` usually
  answer.
- **(b) Technical tradeoffs** — consult the adversary model first (see
  cross-model protocol). Surfaces to the user ONLY on unresolved conflict
  between the models.
- **(c) Product / scope / business logic / preference** — ALWAYS reaches
  the user as an individual question, even when both models agree. Two
  models agreeing is not user consent; agreement only makes their position
  the recommended option. (Batching via the grilling protocol's settled
  table applies ONLY to agreed class-(b) technical items.)

## Three kinds of question — don't over-format

- **Decision questions** — real alternatives to weigh: a class-(b) conflict
  the models couldn't settle, or a class-(c) choice with more than one
  defensible answer (scope, design direction, which job to run, per-file
  disposition) — UNLESS a closed-menu contract (below) covers the choice;
  a defined closed menu always takes precedence. Otherwise these get the
  FULL ordered-choice format below.
- **Simple confirmations** — consent gates and yes/no checks with an
  obvious default: "commit this?", "run the release?", "tear these down?",
  "proceed?". These get ONE plain-language line stating what will happen
  and the default (declining unless stated otherwise) — NO ordered list,
  no `Claude suggests:`/`Codex counters:` framing, no numbered options.
  The user answers in their own words.
- **Closed menus** — a fixed, small, self-explanatory option set defined
  by a protocol or a skill's own contract (e.g. the tooling master's
  per-tier "set up after / give command / skip", or commit's scope menu).
  Present the domain options directly as the numbered list — the
  `Claude suggests:`/`Codex counters:` structure does not apply; the
  other rules (one question per message, recommended option marked,
  default named, answer by number or own words) do.

The ordered format exists to carry pre-fought positions; a confirmation has
nothing to pre-fight. Over-formatting trivial questions buries the real
ones — when in doubt whether something is a decision or a confirmation,
it's a confirmation.

## Presentation format — decision questions only

Per concept-group (related questions may share one explanation):

1. A plain-language explanation of the problem, 3–4 lines — describe the
   actual behavior/choice and what's at stake in words a person can judge
   directly. NO references to documents, finding ids, phases, or file paths
   as substitutes for explanation.
2. Per question, an ORDERED list of choices the user answers by number or
   in their own words:
   1. `Claude suggests: <one-line recommendation>`
   2. `Codex counters: <one-line adversarial view>` (swap names when Codex
      is the host; if the adversary is unavailable:
      `unavailable (single-model)`)
   3. `More detail` — expand: a verbose explanation with concrete links
      (file paths, doc sections, code lines, prior decisions), then
      re-present the same choices.
   4. `Your own answer` — free text.
   Plus, where deferral is acceptable: 5. `Defer — leave open` (deferred
   questions land in the report's Open Questions section).

Choosing (3) never consumes the question — explain, then ask again. A
custom answer (4) goes back through one disprove round (adversary attacks
it with concrete scenarios) before being locked; surviving objections are
shown, the user confirms or amends.

## Transport

Default: PLAIN CHAT, no question tools — portable across hosts. Config may
override globally or per skill (`questions.transport` /
`questions.perSkill.<slug>`: `"tool"`); this applies uniformly to EVERY
skill, grill included. `"tool"` has effect only where a question tool
exists (Claude Code) and openly degrades to chat elsewhere. For DECISION
questions the ordered choice list above maps onto the tool's options, with
`More detail` always among them; closed menus map their domain options
unchanged (no `More detail` added); simple confirmations stay one plain
line.

## Recording — answers compound

Every answer is recorded via librarian (or queued in the stage report for
the stage-7 librarian pass when mid-flow):

- durable decisions → an ADR in `docs/decisions/`
- task-scoped choices → the work-doc triad
- discoveries → work-doc notes

**Auto-resolution is class-scoped:** recorded facts and durable technical
decisions auto-resolve the same question in future runs (cite the record
instead of re-asking). Class-(c) product/scope/preference questions are
NEVER auto-resolved — the recorded answer may be offered as the default
suggestion, but the question still reaches the user. Questions should
decrease monotonically across runs.
