// Sequence descriptors — one `skills/<skill>/sequence.json` per skill, the ONLY
// home of that skill's seats and variants. Contract: references/models.md →
// "Sequence descriptors". Validated by scripts/check.ts and loaded by the broker.

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { parseJsonc } from "../../config/scripts/jsonc.ts";
import { SHIPPED_CLASSES, isShippedClass } from "../../config/scripts/multimodel.ts";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };

export const PROMISES = ["cross-lineage", "same-lineage", "none"] as const;
export type Promise_ = typeof PROMISES[number];
export const ACCESS = ["repo", "text"] as const;
export const ROSTER_CATEGORIES = ["implementers", "reviewers", "test-quality", "infra"] as const;
export const BUILTIN_INPUTS = ["brief", "artefact"] as const;

export type Node = {
  readonly id: string;
  readonly role: string;                       // built-in role id, or "roster:<category>"
  readonly class: keyof typeof SHIPPED_CLASSES;
  readonly inputs: readonly string[];
  readonly access: typeof ACCESS[number];
  readonly host?: true;                        // staffed by the host session itself, never brokered
  readonly writes?: true;                      // the ONE mutating seat of the variant
  readonly raw?: true;                         // must receive raw artefacts (every judging seat)
  readonly differentLineageFrom?: readonly string[];
  readonly differentSessionFrom?: readonly string[];
};
export type Variant = { readonly promises: Promise_; readonly nodes: readonly Node[] };
export type Descriptor = {
  readonly descriptorVersion: 1;
  readonly skill: string;
  readonly default: string;
  readonly variants: Readonly<Record<string, Variant>>;
};

const ID_RE = /^[a-z][a-z0-9-]*$/;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isIdList = (v: unknown): v is readonly string[] => Array.isArray(v) && v.every((x) => isStr(x) && ID_RE.test(x));

/** A seat that checks another seat's work: it names who it must be independent of. */
export const isJudging = (n: Node): boolean =>
  (n.differentLineageFrom?.length ?? 0) > 0 || (n.differentSessionFrom?.length ?? 0) > 0;

const checkNode = (ctx: string, v: Json, earlier: readonly Node[], allIds: ReadonlySet<string>): string[] => {
  if (!isObj(v)) return [`${ctx}: object expected`];
  const known = ["id", "role", "class", "inputs", "access", "host", "writes", "raw", "differentLineageFrom", "differentSessionFrom"];
  const earlierIds = new Set(earlier.map((n) => n.id));
  const refOk = (x: string): boolean => earlierIds.has(x);
  const inputOk = (x: string): boolean => (BUILTIN_INPUTS as readonly string[]).includes(x) || earlierIds.has(x);
  const role = v.role;
  const longContextInputs = Array.isArray(v.inputs)
    ? v.inputs.filter((x) => isStr(x) && earlier.some((n) => n.id === x && n.class === "long-context")) : [];
  return [
    ...Object.keys(v).filter((k) => !known.includes(k)).map((k) => `${ctx}: unknown key "${k}"${k === "required" || k === "optional" ? " — there are no optional nodes; optionality lives in variant choice" : k === "model" ? " — a node names a CLASS, never a model" : ""}`),
    ...(isStr(v.id) && ID_RE.test(v.id) ? [] : [`${ctx}.id: slug`]),
    ...(isStr(v.id) && earlierIds.has(v.id) ? [`${ctx}.id: duplicate "${v.id}"`] : []),
    ...(isStr(role) && (ID_RE.test(role) || (role.startsWith("roster:") && (ROSTER_CATEGORIES as readonly string[]).includes(role.slice(7))))
      ? [] : [`${ctx}.role: built-in role id or roster:<${ROSTER_CATEGORIES.join("|")}>`]),
    ...(isShippedClass(v.class) ? [] : [`${ctx}.class: shipped class (${Object.keys(SHIPPED_CLASSES).join(" | ")}) — a descriptor never names a project class; roster roles carry those`]),
    ...(!Array.isArray(v.inputs) || !v.inputs.every((x) => isStr(x) && inputOk(x))
      ? [`${ctx}.inputs: ids of EARLIER nodes, "brief" or "artefact" (edges derive from inputs; a later id would be a cycle)`] : []),
    ...(isStr(v.access) && (ACCESS as readonly string[]).includes(v.access) ? [] : [`${ctx}.access: repo | text`]),
    ...(["host", "writes", "raw"] as const).filter((k) => v[k] !== undefined && v[k] !== true).map((k) => `${ctx}.${k}: literal true or absent`),
    ...(["differentLineageFrom", "differentSessionFrom"] as const)
      .filter((k) => v[k] !== undefined && !(isIdList(v[k]) && (v[k] as string[]).every(refOk) && (v[k] as string[]).every((x) => x !== v.id)))
      .map((k) => `${ctx}.${k}: ids of EARLIER nodes this seat must be independent of`),
    ...(v.raw === true && longContextInputs.length > 0
      ? [`${ctx}: a raw-artefact seat cannot take a long-context digest as input (${longContextInputs.join(", ")}) — pass the artefact by path`] : []),
    ...(v.host === true && v.class === "judgment" ? [`${ctx}: the host cannot hold a judgment node`] : []),
    ...(v.writes === true && v.class !== "code-generation" ? [`${ctx}.writes: only a code-generation node may be the writer`] : []),
    ...(allIds.size === 0 ? [] : []),
  ];
};

const checkVariant = (ctx: string, name: string, v: Json, isDefault: boolean): string[] => {
  if (!isObj(v)) return [`${ctx}: object expected`];
  const nodesRaw = Array.isArray(v.nodes) ? v.nodes : [];
  // Nodes are checked in order against the nodes before them, so id references
  // are acyclic by construction.
  const { errors, nodes } = nodesRaw.reduce<{ errors: string[]; nodes: Node[] }>((acc, n, i) => {
    const errs = checkNode(`${ctx}.nodes[${i}]`, n, acc.nodes, new Set());
    return { errors: [...acc.errors, ...errs], nodes: errs.length === 0 ? [...acc.nodes, n as unknown as Node] : acc.nodes };
  }, { errors: [], nodes: [] });
  const writers = nodes.filter((n) => n.writes === true);
  const judging = nodes.filter(isJudging);
  const promises = v.promises;
  return [
    ...(ID_RE.test(name) ? [] : [`${ctx}: variant name is a slug`]),
    ...Object.keys(v).filter((k) => !["promises", "nodes"].includes(k)).map((k) => `${ctx}: unknown key "${k}"`),
    ...(isStr(promises) && (PROMISES as readonly string[]).includes(promises) ? [] : [`${ctx}.promises: ${PROMISES.join(" | ")}`]),
    ...(Array.isArray(v.nodes) && v.nodes.length > 0 ? [] : [`${ctx}.nodes: non-empty array`]),
    ...errors,
    ...(writers.length > 1 ? [`${ctx}: more than one writer (${writers.map((n) => n.id).join(", ")}) — one writer per checkout`] : []),
    ...(promises === "cross-lineage" && judging.some((n) => (n.differentLineageFrom?.length ?? 0) === 0)
      ? [`${ctx}: promises cross-lineage but a judging seat carries no differentLineageFrom`] : []),
    ...(promises === "cross-lineage" && judging.length === 0 ? [`${ctx}: promises cross-lineage with no judging seat — promise "none"`] : []),
    ...(promises === "none" && judging.length > 0 ? [`${ctx}: has judging seats but promises "none" — promise what the constraints reach`] : []),
    ...(isDefault && nodes.some((n) => n.class === "judgment") ? [`${ctx}: the default variant carries a judgment node — judgment roles live in enhanced variants only`] : []),
    ...nodes.filter((n) => n.class === "judgment" && n.access === "repo").map((n) => `${ctx}.nodes(${n.id}): a judgment seat is text-only (typed questions over a state string)`),
  ];
};

export const checkDescriptor = (v: Json, expectedSkill?: string): string[] => {
  if (!isObj(v)) return ["descriptor: root must be an object"];
  const variants = isObj(v.variants) ? v.variants : {};
  return [
    ...Object.keys(v).filter((k) => !["descriptorVersion", "skill", "default", "variants"].includes(k)).map((k) => `descriptor: unknown key "${k}"`),
    ...(v.descriptorVersion === 1 ? [] : ["descriptorVersion: literal 1"]),
    ...(isStr(v.skill) && ID_RE.test(v.skill) ? [] : ["skill: slug"]),
    ...(expectedSkill !== undefined && v.skill !== expectedSkill ? [`skill: "${String(v.skill)}" must equal the folder name "${expectedSkill}"`] : []),
    ...(!isObj(v.variants) || Object.keys(v.variants).length === 0 ? ["variants: non-empty object"] : []),
    ...(isStr(v.default) && variants[v.default] !== undefined ? [] : ["default: the name of one of the variants"]),
    ...Object.entries(variants).flatMap(([name, def]) => checkVariant(`variants.${name}`, name, def, name === v.default)),
  ];
};

export const loadDescriptor = (file: string): { descriptor?: Descriptor; errors: string[] } => {
  if (!existsSync(file)) return { errors: [`${file}: missing`] };
  const parsed = ((): Json | Error => { try { return parseJsonc(readFileSync(file, "utf8")) as Json; } catch (e) { return e as Error; } })();
  if (parsed instanceof Error) return { errors: [`${file}: ${parsed.message}`] };
  const errors = checkDescriptor(parsed, basename(dirname(file)));
  return errors.length > 0 ? { errors: errors.map((e) => `${file}: ${e}`) } : { descriptor: parsed as unknown as Descriptor, errors: [] };
};
