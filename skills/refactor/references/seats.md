# Refactor seats — critique before approval, review after the diff

Refactor's seats live in `../sequence.json` (variants `standard`,
`same-lineage`) and are resolved by the broker from the user's approved
assignments (`../../protocols/references/models.md`). This skill never names
a model and never composes a CLI call. `<skills>` = the installed supermodo
skills folder; `<host>` = `claude` or `codex`.

## Phase 1 start — plan the seats

`node <skills>/protocols/scripts/broker.ts plan --skill refactor --project-root <root> --host <host> --host-pin <your exact model id> [--variant <v>]`.
`proposal` non-null → ONE approval table (approve all / change rows by number
/ decline; persist with `node <skills>/config/scripts/models.ts approve <proposalFile> --project-root <root>`,
plan again). `staffed: false` → **staff it / run a fully staffed variant /
abort**, never a silent downgrade. Unattended → `needs-input`.

The `plan` and `implement` seats are the host: after each produces its
output, ledger it with
`node <skills>/protocols/scripts/broker.ts dispatch --plan <planFile> --seat <plan|implement> --brief <file> --result <output>`
(status `host`), so the report's seating table and independence come from
the ledger like every other seat.

## Phase 2 — the `critique` seat, before the user sees the plan

An `adversary` seat of another lineage attacks the plan before the user
approves it. With the plan written to its report file:
`node <skills>/protocols/scripts/broker.ts dispatch --plan <planFile> --seat critique --brief <file> --schema <skills>/protocols/schemas/review-verdict.schema.json`
— the brief is `roles/adversary.md` (this skill's folder).
Surviving objections are folded into the plan (each with a disposition:
accepted and changed, or rebutted with a codebase reference) BEFORE the user
sees it; the report names the critique seat's model and its verdict. A
dispatch returning `status: failed` stops here (seat / pin / cause); nothing
is substituted.


## Phase 4z — the `review` seat, after the last extraction

After the last extraction step and a green Phase 4h, an `adversary` seat of
another lineage reviews the WHOLE diff against the approved plan, read-only:
the orchestrator runs the configured test tiers and writes command · exit
status · output to a file; the brief is `roles/reviewer.md` (this skill's folder).
`node <skills>/protocols/scripts/broker.ts dispatch --plan <planFile> --seat review --brief <file> --schema <skills>/protocols/schemas/review-verdict.schema.json`.
Dispose of every finding (accept and change, or rebut with a codebase
reference); on REVISE, fix, re-run the tiers and dispatch the same seat with
`--resume` and a delta brief — at most two rounds, then the user decides with
both positions verbatim. The reviewer reports; it never rewrites. A `failed`
dispatch stops the refactor with "verification absent" in the report;
`unreviewed` output is no verdict, never approval; a `same-lineage` variant
reports "reviewed, not independent".

