# Hunt seating — the broker, the second-lineage finders, the cross-check

Hunt's seats live in `../sequence.json` (variants `standard`, `same-lineage`,
`deep`) and are resolved by the broker from the user's approved assignments
(`../../protocols/references/models.md`). This skill never names a model and
never composes a CLI call. `<skills>` = the installed supermodo skills
folder; `<host>` = `claude` or `codex`.

**Second-lineage finders (`find-x`)**: for five layers — semantic, async,
data-integrity (where semantic blind spots cost most), plus structure and perf
(single-finder lanes get out-sampled when only the loud layers are doubled) —
a finder of ANOTHER lineage hunts the same files in the same parallel wave.
It is the `find-x` seat (`leg-work`, `differentLineageFrom: find`), resolved
by the broker from the user's approved assignments at Phase 0 (this file); this
skill never names a model and never composes a CLI call. One batched dispatch
per layer:

`node <skills>/protocols/scripts/broker.ts dispatch --plan <planFile> --seat find-x --brief <layer brief file> --schema <skills>/protocols/schemas/findings.schema.json`

The brief is `../roles/finder.md` (this skill's folder), section
"Second-lineage finder (`find-x`)"; the schema is the JSON findings array. Native
and second-lineage findings merge identically in Phase 4. A `find-x` dispatch
returning `status: failed` stops the hunt (report seat / pin / cause); an
`unreviewed` result (no parseable findings) is "no findings from this seat",
recorded in the report — never a reason to substitute another model.

**Phase 0 — seats.** Before the fleet: `node <skills>/protocols/scripts/broker.ts plan --skill hunt --project-root <root> --host <host> --host-pin <your exact model id> [--variant <v>]`.
`proposal` non-null → ONE approval table (approve all / change rows by
number / decline; persist with `node <skills>/config/scripts/models.ts approve <proposalFile> --project-root <root>`,
plan again). `staffed: false` → **staff it / run a fully staffed variant /
abort**; the `same-lineage` variant runs one lineage and reports "reviewed,
not independent". Unattended → `needs-input`.

The `cross-check` seat (verification) is run per `verification.md`.
