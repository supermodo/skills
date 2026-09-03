// Prints the grammar defaults as a flat {dotted-key: string} map, so
// scripts/check.ts can compare them against the names docs-convention.md
// prints without importing TypeScript into its own process.
import { DEFAULTS } from "../../skills/config/scripts/grammar.ts";

const flat = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? flat(v, `${prefix}${k}.`)
      : [[`${prefix}${k}`, String(v)]]);

console.log(JSON.stringify(Object.fromEntries(flat(DEFAULTS))));
