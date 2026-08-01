---
skill: tests
status: needs-input
summary: "Unit tier green, integration tier fails on the fixture database."
questions:
  - "Should the integration tier run against the docker fixture or a temp file? Context: CI has no docker."
drift_notes:
  - "reference/export.md promises CRLF line endings but the writer emits LF (src/export.ts:88)"
---

## Tiers

| tier | command | result |
| --- | --- | --- |
| unit | `npm test` | 128 passed |
| integration | `npm run test:int` | 3 failed |

```supermodo:bars
{"title":"Coverage by package","unit":"%","series":[
  {"label":"packages/data","value":84,"state":"ok"},
  {"label":"apps/web","value":41,"state":"bad"}]}
```

```supermodo:graph
{"title":"Import cycle","nodes":[{"id":"a","label":"export.ts"},{"id":"b","label":"schema.ts"},
  {"id":"c","label":"writer.ts"}],
 "edges":[{"from":"a","to":"b"},{"from":"b","to":"c"},{"from":"c","to":"a","kind":"cycle"}]}
```

This block is deliberately broken and must render as text, not crash:

```supermodo:bars
{ not json at all
```
