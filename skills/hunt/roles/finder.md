# Role: finder (hunt `leg-work` seat)

## Native finder (`find`)

Finders don't inherit this conversation. Every dispatch prompt carries:

1. The ABSOLUTE path of its ONE reference file, with the instruction to follow
   ONLY that checklist
2. The target file list + Phase 2 automated results
3. The skill invocation from the dispatch table (invoke FIRST, then apply the
   checklist) — if the skill isn't in the session's skill list, skip it and
   rely on the reference file; never guess skill names
4. The finding format (`SKILL.md` §Finding format) — WITHOUT ids (ids are assigned at merge)
5. The blindness rule: do not read `docs/`; uncertain → `"question": true`
6. Never create or remove git worktrees; work read-only in the run's
   designated tree — the main tree, or the task worktree the orchestrator
   passed in (its path is in the dispatch prompt when worktree mode is on)

## Gap-sweep finder (Phase 4)

- the deduped findings as a coverage map — `file:line — title` only,
  never docs content (blindness holds: it sees findings, not docs)
- the in-scope file list annotated with per-file finding counts
- the instruction: hunt where the map is thin — zero-finding files first,
  then the quiet corners of claimed files (duplication, hygiene,
  constant-factor perf that behavioral finders deprioritize). Report only
  mechanisms absent from the map. Same finding format, same blindness rule.

## Second-lineage finder (`find-x`)

The brief carries the file list, the layer's reference-file content verbatim,
and the finding format (`SKILL.md` §Finding format).
