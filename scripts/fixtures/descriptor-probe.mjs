// Descriptor probe — run by scripts/check.ts. Validates in-memory descriptors
// against the schema (a valid one must pass; each defect must be named) and
// every shipped skills/*/sequence.json (must load). Exit 0 = all hold.
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { checkDescriptor, loadDescriptor } from "../../skills/protocols/scripts/descriptor.ts";

const skillsDir = new URL("../../skills/", import.meta.url).pathname;

const valid = {
  descriptorVersion: 1,
  skill: "example",
  default: "standard",
  variants: {
    floor: { promises: "none", nodes: [{ id: "impl", role: "implementer", class: "code-generation", inputs: ["brief"], access: "repo", host: true }] },
    standard: {
      promises: "cross-lineage",
      nodes: [
        { id: "impl", role: "implementer", class: "code-generation", inputs: ["brief"], access: "repo", host: true },
        { id: "review", role: "roster:reviewers", class: "adversary", inputs: ["impl"], access: "repo", raw: true, differentLineageFrom: ["impl"] },
      ],
    },
    deep: {
      promises: "cross-lineage",
      nodes: [
        { id: "gather", role: "context-gatherer", class: "long-context", inputs: ["brief"], access: "repo" },
        { id: "impl", role: "implementer", class: "code-generation", inputs: ["gather"], access: "repo", host: true },
        { id: "route", role: "router", class: "judgment", inputs: ["brief"], access: "text" },
        { id: "review", role: "reviewer", class: "adversary", inputs: ["impl"], access: "repo", raw: true, differentLineageFrom: ["impl"] },
      ],
    },
  },
};

const withVariant = (name, v) => ({ ...valid, variants: { ...valid.variants, [name]: v } });

const defects = [
  ["default variant carries a judgment node", withVariant("standard", { promises: "cross-lineage", nodes: [...valid.variants.standard.nodes, { id: "route", role: "router", class: "judgment", inputs: ["brief"], access: "text" }] }), "default variant carries a judgment node"],
  ["required/optional flag", withVariant("x", { promises: "none", nodes: [{ id: "a", role: "r", class: "lead", inputs: ["brief"], access: "repo", required: true }] }), "there are no optional nodes"],
  ["node names a model", withVariant("x", { promises: "none", nodes: [{ id: "a", role: "r", class: "lead", inputs: ["brief"], access: "repo", model: "opus" }] }), "a node names a CLASS, never a model"],
  ["forward input = cycle", withVariant("x", { promises: "none", nodes: [{ id: "a", role: "r", class: "lead", inputs: ["b"], access: "repo" }, { id: "b", role: "r", class: "lead", inputs: ["brief"], access: "repo" }] }), "ids of EARLIER nodes"],
  ["two writers", withVariant("x", { promises: "none", nodes: [{ id: "a", role: "r", class: "code-generation", inputs: ["brief"], access: "repo", writes: true }, { id: "b", role: "r", class: "code-generation", inputs: ["brief"], access: "repo", writes: true }] }), "more than one writer"],
  ["cross-lineage promised without the constraint", withVariant("x", { promises: "cross-lineage", nodes: [{ id: "a", role: "r", class: "lead", inputs: ["brief"], access: "repo" }, { id: "b", role: "reviewer", class: "adversary", inputs: ["a"], access: "repo", differentSessionFrom: ["a"] }] }), "carries no differentLineageFrom"],
  ["raw seat fed a digest", withVariant("x", { promises: "none", nodes: [{ id: "g", role: "gatherer", class: "long-context", inputs: ["brief"], access: "repo" }, { id: "b", role: "reviewer", class: "adversary", inputs: ["g"], access: "repo", raw: true }] }), "cannot take a long-context digest"],
  ["judgment seat with repo access", withVariant("x", { promises: "none", nodes: [{ id: "r", role: "router", class: "judgment", inputs: ["brief"], access: "repo" }] }), "text-only"],
  ["project class in a descriptor", withVariant("x", { promises: "none", nodes: [{ id: "r", role: "sec", class: "s-security-audit", inputs: ["brief"], access: "repo" }] }), "never names a project class"],
  ["unknown default", { ...valid, default: "nope" }, "default: the name of one of the variants"],
];

const validErrors = checkDescriptor(valid);
const defectMisses = defects.filter(([, d, needle]) => !checkDescriptor(d).some((e) => e.includes(needle))).map(([name]) => name);
const shipped = readdirSync(skillsDir)
  .map((slug) => join(skillsDir, slug, "sequence.json"))
  .filter((f) => existsSync(f))
  .map((f) => ({ f, ...loadDescriptor(f) }));
const shippedErrors = shipped.flatMap((s) => s.errors);

validErrors.forEach((e) => console.error(`descriptor-probe: valid descriptor rejected: ${e}`));
defectMisses.forEach((n) => console.error(`descriptor-probe: defect not named: ${n}`));
shippedErrors.forEach((e) => console.error(`descriptor-probe: ${e}`));
console.log(`descriptor-probe: valid ok=${validErrors.length === 0}, ${defects.length - defectMisses.length}/${defects.length} defects named, ${shipped.length} shipped descriptor(s) load`);
process.exit(validErrors.length + defectMisses.length + shippedErrors.length === 0 ? 0 : 1);
