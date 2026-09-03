---
bump: patch
section: Fixed
scope: ["skills/config/scripts/jsonc.ts", "skills/config/scripts/config-check.ts", "skills/config/scripts/grammar-load.ts", "skills/reports/scripts/render.ts", "skills/release/scripts/release-check.ts", "skills/protocols/references/config.md"]
---

Config and version files are now read as JSONC — `//` and `/* */` comments and
trailing commas are accepted. A project whose version lives in a `deno.jsonc`
or a `tsconfig.json` could not be released at all: the preflight reported
"cannot read version" for a file its own toolchain considers perfectly valid.
The same now applies to `skills.config.json`, so a commented config reads the
same way in every supermodo skill. Comments are the only relaxation — every
other config rule still applies, `config` still writes strict JSON, and a
genuine syntax error still reports the line and column it occupies in the
original file.
