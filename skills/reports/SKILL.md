---
name: reports
description: "Renders the reports supermodo has written — every flow run, every standalone skill report, every release — as self-contained HTML pages plus a four-tab archive index, and opens them in the browser. Use whenever the user asks to see a run in the browser, wants the report page, the archive, the history of what supermodo has done in this project, what is waiting on them, or asks to re-render or reopen a report. Also invoked by other skills to render the report they just wrote. Triggers on 'show me the run', 'open the report', 'the archive', 'in the browser', 'what needs my attention', 're-render the reports'."
---

# reports — reports as web pages

> **Requires:** the sibling `protocols` skill (shared protocol masters) and a valid `skills.config.json` (create with the `config` skill). Missing either → halt with that exact pointer; never guess.

A THIN wrapper around a deterministic script. The page structure, the visual
block grammar and the report format all live in
`../protocols/references/reports.md`. Follow that master exactly; this file
adds only invocation and policy.

Read `../protocols/references/reports.md` and validate config FIRST per
`../protocols/references/config.md`.

**The HTML is a projection, never the source.** `.md` files stay the source of
truth — machine-readable, hashable, the medium other stages read. Deleting
every generated `.html` loses nothing; the next render recreates it byte for
byte.

## Invocation

`reports [--run <run-id> | --report <path.md>] [--open | --no-open]`

| form | behavior |
| --- | --- |
| `reports` | render everything under `.skills/supermodo/`, refresh the index, open the index |
| `--run <run-id>` | render that run's page, refresh the index, open the run page |
| `--report <path.md>` | render that one report, refresh the index, open it |
| `--open` / `--no-open` | override the configured open policy for this invocation |

All of it is the script:

```
node <skill-dir>/scripts/render.ts [flags]
```

Never hand-write HTML, never edit a generated `.html`, never render from
inside another skill's prose — every caller invokes this script.

## Behavior

1. Resolve the project root and `.skills/supermodo/`. Absent → nothing to do;
   say so and stop (an unconfigured project is not an error).
2. `reports.html: false` in config → render nothing, say so, stop.
3. Run the script. It writes `index.html` plus one `.html` beside each report
   it rendered.
4. Print the paths it wrote. Open per policy (below).

## Open policy

From `reports.open` in `skills.config.json` — `auto` (default) | `flow` |
`never`, per `../protocols/references/config.md`.

**Never open** — print the `file://` link instead — when there is no TTY, when
`CI` is set in the environment, or over SSH without a display. These guards
override every setting including an explicit `--open`.

## Failure policy

Rendering is best-effort and MUST NOT fail its caller.

- A report that will not parse renders as a row marked *unreadable*; the
  orchestrator already failed that stage, the renderer only shows it.
- A malformed visual block renders as its own source text with a warning
  badge.
- Any other error → warn on stderr, skip that item, continue, exit 0.

A non-zero exit from this skill inside a flow is a bug. The pipeline's verdict
never depends on whether a page rendered.

## Called by other skills

The reports protocol requires every skill to invoke this script after writing
a report. Callers pass `--report <path>` (or `--run <id>` for flow) and do
nothing else — no HTML, no formatting decisions, no open logic of their own.

Flow renders and opens its run page once after stage 1, then re-renders after
every stage; the page self-refreshes while the run is live.

## Report

Concise per `output.verbosity`. Name what was written and the path opened —
this skill writes no report of its own (rendering the archive is not an event
worth archiving).
