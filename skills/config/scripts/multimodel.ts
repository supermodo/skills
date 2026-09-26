// Multi-model engine layer — the shared vocabulary and the project-policy
// validator. Contract: skills/protocols/references/models.md.
//
// This module is the ONE place the shipped engine classes are listed: the
// config validator, the registry validator, the descriptor check and the
// broker all import it, so a class added here is a class everywhere.

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };

const isObj = (v: Json | undefined): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: Json | undefined): v is string => typeof v === "string" && v.length > 0;

/** Shipped engine classes — one row each; adding a row is a MINOR. */
export const SHIPPED_CLASSES = {
  "lead": "generative",
  "adversary": "generative",
  "leg-work": "generative",
  "long-context": "generative",
  "code-generation": "generative",
  "judgment": "judgment",
} as const;

export type ClassKind = "generative" | "judgment";
export type ShippedClass = keyof typeof SHIPPED_CLASSES;

export const isShippedClass = (v: unknown): v is ShippedClass =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(SHIPPED_CLASSES, v);

/** Project-defined classes: `s-<name>`; the package never ships an `s-` class. */
export const PROJECT_CLASS_RE = /^s-[a-z0-9-]+$/;
export const isProjectClassName = (v: unknown): v is string =>
  typeof v === "string" && PROJECT_CLASS_RE.test(v);

/** The fixed coordinator role (the host) — forbiddable, never assignable. */
export const COORDINATOR = "coordinator";

const SLUG_RE = /^[a-z][a-z0-9-]*$/;
const VARIANT_RE = /^[a-z][a-z0-9-]*$/;
const LINEAGE_RE = /^lineage:[a-z][a-z0-9-]*$/;
/** An exact provider model id (a pin), e.g. `gpt-6-astra`, `claude-opus-5`, `jev-1.13.0`. */
const PIN_RE = /^[a-z0-9][a-z0-9._-]*$/;

/** Keys that belong to the per-user registry and must never appear in a committed policy. */
const REGISTRY_ONLY_KEYS = ["models", "jobs", "assignments", "endpoint", "endpoints", "keyEnv", "command", "commands", "argv", "pin", "pins", "effort"];

const unknownKeys = (obj: Obj, allowed: readonly string[], ctx: string): string[] =>
  Object.keys(obj).filter((k) => !allowed.includes(k)).map((k) => `${ctx}: unknown key "${k}"`);

/** Resolve a class name to its kind, through `extends` for project classes. */
export const classKind = (name: string, projectClasses: Readonly<Record<string, string>>): ClassKind | undefined =>
  isShippedClass(name) ? SHIPPED_CLASSES[name]
    : isProjectClassName(name) && isShippedClass(projectClasses[name]) ? SHIPPED_CLASSES[projectClasses[name] as ShippedClass]
    : undefined;

/** `multimodel.classes` → { "s-name": "<shipped class it extends>" } or [] on any error. */
export const projectClassMap = (classes: Json | undefined): Record<string, string> =>
  !isObj(classes) ? {} : Object.fromEntries(
    Object.entries(classes).flatMap(([k, v]) =>
      isProjectClassName(k) && isObj(v) && isShippedClass(v.extends) ? [[k, v.extends]] : []));

const checkClasses = (v: Json | undefined): string[] =>
  v === undefined ? [] : !isObj(v) ? ["multimodel.classes: object of \"s-<name>\" → { \"extends\": <shipped class> }"] :
    Object.entries(v).flatMap(([k, def]) => [
      ...(isShippedClass(k)
        ? [`multimodel.classes.${k}: "${k}" is a shipped class and cannot be redefined — project classes are named s-<name>`]
        : !isProjectClassName(k)
          ? [`multimodel.classes.${k}: project class names match ^s-[a-z0-9-]+$`]
          : []),
      ...(!isObj(def)
        ? [`multimodel.classes.${k}: object with exactly one field, "extends"`]
        : [
          ...unknownKeys(def, ["extends"], `multimodel.classes.${k}`),
          ...(isShippedClass(def.extends) ? []
            : [`multimodel.classes.${k}.extends: one of ${Object.keys(SHIPPED_CLASSES).join(" | ")} (a project class inherits its base class's kind and placements — never permissions or assignments)`]),
        ]),
    ]);

const checkVariants = (v: Json | undefined): string[] =>
  v === undefined ? [] : !isObj(v) ? ["multimodel.variants: object of <skill> | \"*\" → variant name"] :
    Object.entries(v).flatMap(([k, name]) => [
      ...(k === "*" || SLUG_RE.test(k) ? [] : [`multimodel.variants.${k}: skill slug or "*"`]),
      ...(isStr(name) && VARIANT_RE.test(name) ? [] : [`multimodel.variants.${k}: variant name (lowercase slug) declared by that skill's sequence descriptor`]),
    ]);

const isPolicyTarget = (k: string, projectClasses: Readonly<Record<string, string>>): boolean =>
  k === COORDINATOR || isShippedClass(k) || Object.prototype.hasOwnProperty.call(projectClasses, k) || SLUG_RE.test(k);

const checkModelList = (ctx: string, v: Json): string[] =>
  !Array.isArray(v) || v.length === 0
    ? [`${ctx}: non-empty array of "lineage:<slug>" or exact model pins`]
    : v.flatMap((x, i) =>
      isStr(x) && (LINEAGE_RE.test(x) || PIN_RE.test(x)) ? []
        : [`${ctx}[${i}]: "lineage:<slug>" or an exact provider model id (never a registry id, never a vendor name)`]);

const checkPolicyMap = (field: "forbid" | "require", v: Json | undefined, projectClasses: Readonly<Record<string, string>>): string[] =>
  v === undefined ? [] : !isObj(v) ? [`multimodel.${field}: object of <role | class | "coordinator"> → [models]`] :
    Object.entries(v).flatMap(([k, list]) => [
      ...(isPolicyTarget(k, projectClasses) ? [] : [`multimodel.${field}.${k}: a role name, a class name, or "coordinator"`]),
      ...checkModelList(`multimodel.${field}.${k}`, list),
    ]);

const checkBudget = (v: Json | undefined): string[] =>
  v === undefined ? [] : !isObj(v) ? ["multimodel.budget: object"] : [
    ...unknownKeys(v, ["callsPerRun"], "multimodel.budget"),
    ...(v.callsPerRun !== undefined && !(Number.isInteger(v.callsPerRun) && (v.callsPerRun as number) >= 1)
      ? ["multimodel.budget.callsPerRun: integer ≥ 1"] : []),
  ];

/**
 * `skills.config.json` → `multimodel` (project policy). Policy may only
 * RESTRICT: class definitions, variant selection, forbid/require by pin or
 * lineage, concurrency, budget. Model records, assignments, credentials,
 * endpoints and commands live in the per-user registry and are rejected
 * here by name so the error says where they belong.
 */
export const checkMultimodel = (v: Json | undefined): string[] => {
  if (v === undefined) return [];
  if (!isObj(v)) return ["multimodel: object expected"];
  const misplaced = REGISTRY_ONLY_KEYS.filter((k) => v[k] !== undefined)
    .map((k) => `multimodel.${k}: not a policy key — model records, assignments, pins, effort, endpoints and keys live ONLY in the per-user registry (config --models); a committed policy names models by exact pin or "lineage:<slug>" inside forbid/require`);
  const projectClasses = projectClassMap(v.classes);
  return [
    ...misplaced,
    ...unknownKeys(v, ["classes", "variants", "forbid", "require", "concurrency", "budget", ...REGISTRY_ONLY_KEYS], "multimodel"),
    ...checkClasses(v.classes),
    ...checkVariants(v.variants),
    ...checkPolicyMap("forbid", v.forbid, projectClasses),
    ...checkPolicyMap("require", v.require, projectClasses),
    ...(v.concurrency !== undefined && !(Number.isInteger(v.concurrency) && (v.concurrency as number) >= 1 && (v.concurrency as number) <= 8)
      ? ["multimodel.concurrency: integer 1–8"] : []),
    ...checkBudget(v.budget),
  ];
};
