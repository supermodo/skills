---
bump: patch
section: Fixed
scope: ["skills/protocols/scripts/broker.ts", "scripts/check.ts"]
---

Claude review seats running Opus are no longer rejected as "ran Haiku". The
identity check now looks for the requested model among every model the Claude
CLI reports, not just the first one, which is often a Haiku side call the CLI
makes on its own.
