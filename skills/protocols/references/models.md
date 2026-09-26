# Multi-model engine layer — the contract (v1)

Contents: the four layers · engine classes · the per-user registry · sequence
descriptors · roles · the broker · approval and staffing · independence ·
seat classes and adapters · judgment seats · the patch path · project policy ·
ledger and reports · invariants · migration. Operational detail for running an
external seat (preflight, hung detection, honesty) is in `cross-model.md`; the
evidence behind every rule is in `multimodel-knowledge.md`.

Every supermodo skill that seats any model besides the host reads this file.
Nothing here is duplicated elsewhere: a skill's own SKILL.md names its roles,
variants and constraints in its descriptor and points here for the mechanics.

## The four layers

| layer | owned by | lives in | says |
| --- | --- | --- | --- |
| **sequence descriptor** | package | `skills/<skill>/sequence.json` | which roles run, in which variants, with which per-seat constraints |
| **roles** | project (committed) or package (built-in) | `agents.dir` role files · the descriptor | the expertise: instructions, checklist, scope — and the ENGINE CLASS the role needs (`job:`) |
| **engine classes** | package (open vocabulary) + project (`s-*`) | this file · `skills.config.json` → `multimodel.classes` | what kind of engine a seat needs |
| **models** | user (never committed) | the per-user registry | which concrete engines this user enrolled, with pins and effort, assigned to classes |

A **seat** is a role × a model, chosen by the broker for one descriptor node.
A role never names a model. A model never names a role. The class is the join.

## Engine classes

Shipped classes (each is one row; adding a row is a MINOR):

| class | engine need | kind |
| --- | --- | --- |
| `lead` | the strongest reasoner available; PRODUCES the plan, diagnosis or design others build on | generative |
| `adversary` | a strong reasoner the user trusts to JUDGE other models' work; always read-only | generative |
| `leg-work` | cheap, fast, parallel; narrow bounded tasks whose output is verified downstream | generative |
| `long-context` | a large input window at low cost per token; returns an INDEX (paths, line ranges, reasons), never a summary that stands in for the source | generative |
| `code-generation` | authors code, tests or patches as TEXT; the class grants no write access — who applies the result is a seat constraint | generative |
| `judgment` | typed answers only (choice, yes/no probability, score on described levels); fast; may only escalate, order, flag or propose | judgment |

Rules:

- Write permission and lineage independence are **seat constraints** in the
  descriptor, never properties of a class. `adversary` grants no
  independence; `code-generation` grants no writes.
- **Project-defined classes** are declared in `skills.config.json` under
  `multimodel.classes`, named `s-<name>` (`^s-[a-z0-9-]+$`), and declare
  exactly one field: `extends: <shipped class>`. The package never ships an
  `s-` class. A project class inherits the base class's kind and placements
  and never its model assignments or any permission. A key equal to a shipped
  class is a validation error.
- A role's `job:` (or a descriptor node's `class`) must resolve to a shipped
  class or a declared `s-` class; anything else — including a misspelling —
  fails validation. A reference never creates a class.
- A judgment-only model in a generative class is a validation error. A
  generative model may hold a `judgment` assignment only through an adapter
  that enforces the required output schema; its answers are labelled
  `uncalibrated`.

## The per-user registry

Location: `$XDG_CONFIG_HOME/supermodo/` when set, else `~/.config/supermodo/`;
Windows `%APPDATA%\supermodo\`. Written ONLY by `config --models`; every read
validates it as untrusted input (it is hand-editable). Never committed, never
inside a project. Nothing in it is a command: the schema has no argv field.

`registry.json`:

```jsonc
{
  "registryVersion": 1,
  "models": {                                  // id → definition; id ^[a-z0-9][a-z0-9-]*$
    "astra": { "lineage": "openai", "transport": "adapter", "adapter": "codex", "pin": "gpt-6-astra" },
    "opus5": { "lineage": "anthropic", "transport": "adapter", "adapter": "claude", "pin": "claude-opus-5" },
    "flash": { "lineage": "google", "transport": "http-chat",
               "endpoint": "https://…/v1/chat/completions", "keyEnv": "SUPERMODO_GEMINI_KEY", "pin": "gemini-3.8-flash" },
    "jev":   { "lineage": "typesafe", "transport": "http-typed",
               "endpoint": "https://api.typesafe.ai/v1/systemone", "keyEnv": "SUPERMODO_TYPESAFE_KEY", "pin": "jev-1.13.0" },
    "sonnet-native": { "lineage": "anthropic", "transport": "native", "host": "claude", "alias": "sonnet" }
  },
  "jobs": {                                    // class → ORDERED assignments (first = preferred)
    "lead":      [{ "model": "opus5", "effort": "medium" }],
    "adversary": [{ "model": "astra", "effort": "xhigh" }],
    "leg-work":  [{ "model": "flash", "effort": "high" }, { "model": "sonnet-native" }],
    "judgment":  [{ "model": "jev" }]
  },
  "projects": {                                // assignments for project classes, scoped by project id
    "<project-id>": { "jobs": { "s-security-audit": [{ "model": "astra", "effort": "xhigh" }] } }
  },
  "decisions": {                               // persisted declines: never re-suggested while the pool is unchanged
    "adversary|opus5|medium": { "declined": "2026-09-22", "poolHash": "…" }
  }
}
```

- `lineage` is the training lineage (`anthropic`, `openai`, `google`,
  `typesafe`, …) or `unknown`. `unknown` never counts toward independence.
- `pin` is the exact provider model id and is REQUIRED for `adapter`,
  `http-chat` and `http-typed` transports. `native` models carry `alias`
  instead and no `pin`; an assignment referencing a native model carries no
  `effort`. A native seat is therefore ineligible wherever a pin or effort is
  required (D9) and is always ledgered `native / version unverified`.
- `effort` sits on the ASSIGNMENT, so one model definition serves several
  efforts without duplicating its pin or endpoint. Allowed values per
  adapter are listed in `cross-model.md`.
- `keyEnv` names an environment variable that either starts with
  `SUPERMODO_` (config contract) or is one of the shipped provider key names
  (`TYPESAFE_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
  `OPENROUTER_API_KEY`) — never an arbitrary name. Endpoints exist only in
  this file — a project can forbid `http` transports per role but can never
  declare one.
- **Guides:** `<registry-dir>/guides/<model-id>.md`, tool-written, ≤ 4 KB,
  path contained in the registry dir. Loaded only for a model that is
  actually seated, appended to that seat's brief. A guide shapes HOW a model is
  briefed; it never influences eligibility, selection, pins, flags or
  identity.
- Project id for `projects`: the project's `project.name` when set, else the
  repository's canonical path hash — `config --models` reports which.

## Sequence descriptors

One JSON file per skill, `skills/<skill>/sequence.json`, validated by
`scripts/check.ts`. It is the ONLY home of that skill's seats: a rules
template selects a variant and refers to node ids, never restates the graph.

```jsonc
{
  "descriptorVersion": 1,
  "skill": "grill",
  "default": "standard",
  "variants": {
    "standard": {
      "promises": "cross-lineage",                        // cross-lineage | same-lineage | none
      "nodes": [
        { "id": "plan-a", "role": "planner", "class": "lead", "inputs": ["brief"], "access": "repo" },
        { "id": "plan-b", "role": "planner", "class": "lead", "inputs": ["brief"], "access": "repo",
          "differentLineageFrom": ["plan-a"] },
        { "id": "attack-a", "role": "adversary", "class": "adversary", "inputs": ["plan-b"], "access": "repo",
          "differentLineageFrom": ["plan-b"] },
        { "id": "attack-b", "role": "adversary", "class": "adversary", "inputs": ["plan-a"], "access": "repo",
          "differentLineageFrom": ["plan-a"] }
      ]
    },
    "same-lineage": { "promises": "same-lineage", "nodes": [ /* differentSessionFrom instead */ ] },
    "deep": { "promises": "cross-lineage", "nodes": [ /* more seats, distinct jobs */ ] }
  }
}
```

Node fields:

- `id` — unique within the descriptor, stable across releases (templates refer to it).
- `role` — a built-in role id whose brief the package owns, or `roster:<category>` (`implementers` · `reviewers` · `test-quality` · `infra`) to fan out over the project's roster agents of that category whose `job:` equals the node's `class`.
- `class` — a shipped or `s-` class.
- `inputs` — ids of nodes (or `brief`, `artefact`) whose OUTPUT this node receives; edges derive from `inputs`. A node's inputs are always passed by path, never summarised.
- `access` — `repo` (repo-reading seat: admitted adapters only) or `text` (artefacts on stdin, no repository access).
- `writes` — `true` on at most ONE node per variant: the seat that mutates the checkout (host or broker-applied patch). Absent = read-only.
- `differentLineageFrom` / `differentSessionFrom` — ids this seat must not share a lineage / a session with. Explicit, never derived from "judges" (grill's two blind planners need it though neither judges the other).
- `raw` — `true` on a seat that must receive raw artefacts (every judging seat: adversary, reviewer, verifier, adjudicator); a `long-context` digest may feed only nodes without it.

Variant fields: `promises` states the independence level the variant can
reach when fully staffed; `check.ts` verifies it against the constraints
(a variant promising `cross-lineage` must carry a `differentLineageFrom` on
every judging seat). A skill may ship several variants of its own sequence;
`default` names the middle one; heavier ones are selected per project
(`multimodel.variants`) or per run (`--variant`). A host-only "floor" variant
(no lineage/session constraint, no judgment-only node) is allowed, never
required — a skill whose purpose is cross-model checking ships none and does
not start until a second lineage is enrolled. There are NO optional nodes:
optionality lives in variant choice.

## Roles

- **Roster roles** (`agents.dir`, default `.supermodo/agents/`): one file per
  role; frontmatter carries `job: <class>` and category metadata; it carries
  NO engine field — `model:`, `effort:` or any alias in a file that declares
  `job:` is a validation error. Roster roles are never mirrored into a
  host's native agents directory and are never invoked outside the broker.
  Agents that are not supermodo roles (no `job:`) are untouched by any of this.
- **Built-in roles**: the package owns the brief (`skills/<skill>/roles/<role>.md`
  or the SKILL.md section the descriptor names); their class is the node's.
- For an EXTERNAL seat a role contributes only its instruction body; a
  roster file's tool list never reaches the seat — the adapter's read-only
  flags always win. For a NATIVE seat the host launches a general subagent
  with the role's instructions and the approved alias; the ledger records it
  `native / version unverified`.
- The **coordinator** (the skill's moderator/orchestrator) is always the host
  — the model the user launched the session in. It is not assignable. A
  project may forbid a host (`forbid.coordinator`); the skill then stops at
  preflight with a restart hint, since a skill cannot switch its own session's
  model.

## The broker

`skills/protocols/scripts/broker.ts` (zero-dependency TypeScript, run with
`node`). The host LLM never composes a seat's command line and never holds a
delegate's argv; it calls the broker and reads its structured result.

1. **Validate** the registry, the project policy, the descriptor and the host
   identity — all as untrusted input.
2. **Select the variant** (per-run flag → project `multimodel.variants` →
   descriptor `default`) and, for `flow`, take the union of every stage that
   will run.
3. **Solve the whole variant before launch**: candidates per node =
   `jobs[class]` in order (through `extends` for `s-` classes), minus
   project `forbid`, intersected with `require`, filtered by seat class and
   adapter capability; deterministic backtracking over the constraints, the
   user's array order as preference — so planner `[A,B]` / adversary `[A]`
   resolves to B→A instead of dead-ending. The result is the seating plan.
4. **Approval** (below). Nothing launches before it.
5. **Preflight** once per workflow per selected seat (`cross-model.md`).
6. **Dispatch** every external seat itself: `execFile`, no shell, the brief
   on stdin (never in argv, so it can smuggle no flag and is not size-capped), wall-clock timeout, read-only re-asserted on every call including
   resumed sessions; write the ledger entry; return the parsed, validated
   output (or `unreviewed`). Host and native seats: the moderator launches
   them itself (a subagent with the role's brief) and hands the output back
   with `dispatch --result <file>`; the ledger entry carries status `host`.
   The moderator writes each `--brief` file with a file-write tool or a quoted
   heredoc (`<<'EOF'`): briefs quote code, and an unquoted heredoc runs every
   backtick span as a shell command, silently dropping it from the brief.
7. **Re-validate at run time**: each dispatch is checked against the solved
   plan and the ledger; a seat failing mid-run stops the run (below) and never
   silently breaks a constraint.

## Approval and staffing

- **Nothing is seated without the user's approval.** An empty assignment
  array grants nothing; the host model is a proposable row, never an
  automatic choice; no automatic fallback of any kind.
- **First use** (or a changed pool): the broker solves the WHOLE variant
  provisionally against every eligible enrolled model, seats nothing, and
  shows ONE numbered table holding exactly the rows that staff it — a class
  the variant needs in two lineages takes two rows, so one approval never
  leads to a second gate. Each row: class · the seats it fills · proposed
  model + effort (the effort the user already approved for that model
  elsewhere, else the adapter's default) · flags (`native, version
  unverified`, `same lineage as host`, `http: sends task text, paths,
  snippets, diffs off-machine`, `no combination of enrolled models staffs
  this variant`). Closed menu: **approve all /
  change numbered rows / decline** (default decline). Changing a row offers
  the eligible enrolled models plus "leave unassigned". Persisted per row via
  `config --models approve`; re-asked only when the pool of enrolled models
  changes. `flow` asks once at step 0 for the union of its stages. Unattended
  first use → `needs-input` with the proposal; nothing launches. Explicit bulk
  escape, run by the user beforehand: `config --models --accept-proposed`.
- **A declined suggestion** is recorded (`decisions`) and the class stays
  unassigned until the user confirms a model; the rejected assignment is not
  re-suggested while the pool is unchanged.
- **Staffing gate**: a skill starts only when the solve seats EVERY node of
  the chosen variant with an approved model. "Staffed" is the result of the
  solve, not a non-empty array — one approved model that cannot satisfy a
  lineage, pin or capability constraint leaves the role unstaffed, and the
  report says why ("1 approved model for `adversary`, none with lineage ≠
  anthropic"). Unstaffed → closed menu: **staff it / run a fully staffed
  variant / abort**. Never an automatic downgrade. `flow` refuses to start
  with an unstaffed late-stage role — learn it at minute 0, not at stage 6.
- **Run-time failure of an approved seat** (rate limit, outage, retired pin,
  malformed output after bounded retries of the same assignment) stops the
  run: resumable artefacts are preserved, the report names seat / requested
  pin / cause / missing verification. It is never a revoked approval and
  never a substitution; a retired pin needs explicit reassignment.
- A `router` judgment may raise depth only to a variant that is already
  staffed; the step-0 table lists the raise target's classes marked "only if
  raised"; an unstaffed target → the run continues at the chosen depth and
  reports "raise recommended, variant X unstaffed".

## Independence

Three levels, one of which appears in every report and every verdict:

| level | meaning | earned when |
| --- | --- | --- |
| `cross-lineage` | independent verification | every judging seat has a KNOWN lineage different from the producer's, computed from the ledger (for a broker-applied patch: the PATCH AUTHOR's lineage, not the host's) |
| `same-lineage` | reviewed, not independent | the judging seat is a fresh session (`differentSessionFrom`) of the producer's lineage |
| `none` | verification absent | the variant has no judging seat, or a judging seat failed and the run stopped |

Version variants (Fable 5 / 5.1), effort variants (medium / xhigh), a seat of
`unknown` lineage and any typed-judgment seat never count as independent.
Absent verification is never self-verification (the implementer never grades
its own work). Two models agreeing is never user consent.

## Seat classes and adapters

- `repo` seats run only through an **admitted adapter**: a CLI whose own flag
  or sandbox enforces no-write for the whole session, re-asserted by the
  package on every call including resume, proven by
  `skills/protocols/scripts/canary.ts`. A disposable copy plus a post-run
  tree check is defense in depth, never admission. Admitted for `repo`:
  `claude`, `codex`. **Sandbox-confined `repo`** (a separate tier, never
  silent): `agy` (Antigravity) has no native read-only mode, so a repo seat
  runs `--sandbox=true` in a disposable copy the broker builds — committable
  files only (git: tracked + untracked-not-ignored; else a default exclude
  list), plus the files the brief names, no `.git`, no symlinks — where the OS
  sandbox denies every read and write outside the copy (verified: `operation
  not permitted`). Writes inside the copy are possible, so the broker hashes
  the copy before and after: any change to a copied file (or a new file
  outside generated folders) voids the verdict (`failed: read-only contract
  broken`); an experiment's `node_modules`, caches or build output are
  ignored. Identity: agy menu ids carry the thinking level
  (`gemini-3.1-pro-high`) while the metadata reports the backend id
  (`gemini-3.1-pro-preview-…`) — the served id must be of the pinned family and
  is what the ledger records. The network stays open, so the seat is eligible only
  after the user accepts that for the model — approving a proposal row that
  carries the `network open` flag, or `config --models consent <id>`
  (`sandbox: "network-open"` in the registry; `--revoke` undoes it). Without
  that consent `agy` holds `text` seats only (print mode with `--sandbox
  --mode plan` denies every tool; artefacts travel inside the brief). The
  effort is part of its model id, e.g. `gemini-3.8-flash-high`.
  Not admitted until they pass: Kimi (`--print` auto-approves tools), Gemini
  CLI (plan mode flips to YOLO non-interactively).
- `text` seats receive artefacts on stdin/body and have no repository access:
  `http-chat` (OpenAI-compatible chat endpoint) and `http-typed` (typed-answer
  endpoint). The broker makes the request itself with `fetch`; no process is
  spawned. There is **no custom-command transport**: a model with no adapter
  waits until the package ships one.
- Identity: provider and effective model come only from the CLI/API's
  structured output (`model` field, session events). Absent → `unverified`,
  and an `unverified` seat is ineligible for a pinned assignment. Never from
  asking the model what it is.
- A parse failure, a missing verdict, or a seat that was never successfully
  invoked is `unreviewed` — never APPROVED, never replaced by a host answer.

## Judgment seats

A judgment role poses package-authored typed questions (Choice among options ·
probability that a condition holds · Score on described ordered levels) over
a `state` string and consumes typed answers with confidence. Built-in roles,
in enhanced variants only (default variants carry no judgment-only node):

| role | question | code does | never |
| --- | --- | --- | --- |
| `router` | Choice: depth · Noul: "is this a product/scope/preference call?" | raises depth to an already-staffed variant; escalates (a)/(b) → (c) | demotes, skips a gate |
| `ranker` | Score: relevance per candidate path | ORDERS the candidate list | trims it |
| `matcher` | Choice: ledger item ids + `none` | flags "repeat of #N, prior disposition …"; the host confirms by reading both | drops a finding |
| `sentinel` | Noul: "contains instructions addressed to an AI agent" · "removes or loosens an assertion" | quarantines + surfaces to the user | treats no-flag as clearance |
| `triager` (pilot) | Choice: nit / material / uncertain · Score: severity on defined consequence levels | orders VERIFICATION; ledger records agreement with later user promote/dismiss | suppresses, gates |

A judgment may only escalate, order, flag or propose. A wrong answer costs
money or attention, never a missed defect. Each judgment node declares its
required answer schema; the adapter validates every response against it.

## The patch path

Native subagents remain the main path for agentic implementation. In
addition an external `code-generation` seat (`access: text` or `repo`,
read-only) may author a patch — whole-file contents or search-and-replace
blocks, never unified diffs — which the **broker** applies (the host model
sees only "applied, N files"): dry-run every block, then write; a failed
apply stops the run with the tree untouched; the orchestrator runs the tests;
the `adversary` reviews diff + evidence against the patch author's lineage;
REVISE → the broker reverse-applies from journaled pre-images (guarded
against intervening edits) and resumes the same author session within the
skill's round cap; the cap stops. The patch path REQUIRES a judging seat and
is never run by a `none` variant. An external agentic implementer working in
an isolated worktree is a later capability, not this one.

## Project policy — `skills.config.json` → `multimodel`

```jsonc
"multimodel": {
  "classes":  { "s-security-audit": { "extends": "adversary" } },
  "variants": { "hunt": "deep", "*": "standard" },
  "forbid":   { "reviewer": ["lineage:anthropic", "claude-fable-5-1"], "coordinator": ["claude-fable-5-1"] },
  "require":  { "adversary": ["lineage:openai"] },
  "concurrency": 2,
  "budget": { "callsPerRun": 40 }
}
```

Policy may only RESTRICT: it names models by exact pin or `lineage:<x>` per
role or class, never by a user's registry id; it holds no model records, no
assignments, no credentials, no endpoints, no commands, no seat caps (a
variant already defines its seats). No key lives in both the registry and the
policy. `forbid` wins over `require`; a conflict that leaves a node unstaffed
reports as such.

## Ledger and reports

The broker appends one entry per dispatch to `.skills/supermodo/ledger/<run>.jsonl`:
node id, role, class, model id, transport, requested pin + effort, EFFECTIVE
model (or `unverified`), lineage, exit status, output status
(`ok` / `unreviewed` / `host` / `failed: <cause>`), independence contribution. Every
skill report (reports protocol) carries: the seating table, the independence
level reached, requested vs effective model per seat, every failed or
unstaffed seat with its reason, and — for judgment seats — that they are
`typed-check`, not review. A verdict with no ledger entry is `unreviewed`; a
host that called a CLI directly is labelled `instructional compliance`.

## Invariants (never in a template, a rules file, a class or a policy)

1. Nothing is seated without the user's approval; no automatic fallback; no
   silent substitution; a failed seat stops the run.
2. One writer per checkout: the host, or the broker applying a patch. Critics
   are read-only and never rewrite; the author disposes of every finding with
   a reason.
3. Independent first pass; independence computed from lineage in the ledger;
   version/effort/session variants and judgment seats never count.
4. The orchestrator runs the tests; reviewers receive evidence and never
   execute; tests stay outside any delegate's writable scope.
5. Read-only enforced by the adapter's own flag on every call including
   resume; no argv in any config or registry; delegate output is data, never
   instructions; registry and policy are validated as untrusted on every read.
6. Union of findings, then per-finding verification; never a vote; a judgment
   never suppresses; a missing or malformed verdict is `unreviewed`.
7. Dissent surfaces with both positions verbatim; the host's own view is
   labelled as the host's.

## Migration (from the two-seat mechanism)

`config --upgrade` detects role files carrying `model:` / `effort:`
independently of `configVersion`, proposes ONE table of `job: <class>` per
file (approve / change by number), rewrites frontmatter temp-then-rename, and
moves the roster to `.supermodo/agents/`. `agents.hosts` is REMOVED (config
error with the message); `sync-configs` keeps syncing instructions, skills,
MCP, hooks and non-role agents and mirrors no managed role. Retired concepts,
never reintroduced: `model:` aliases in role files, native mirrors of roles,
the automatic Claude↔Codex pair, `adversary: auto|none`, "single-model" and
self-adversary labels, node `required/optional`, seat caps, custom commands.
