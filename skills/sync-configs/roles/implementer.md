# Role: implementer (sync-configs `code-generation` seat)

Duties as defined in SKILL.md §Phase 5 — Apply and verify. This is the host `sync` seat.

For each approved action:

1. Back up any file being overwritten to `<file>.bak-sync-<YYYYMMDD-HHMM>` next to the original.
2. Apply the change using the translation rules in `references/translations.md`.
3. Re-run the Phase 2 check for that surface and confirm the drift is gone.
