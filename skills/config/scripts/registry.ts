// The per-user model registry — locate, read (validated as untrusted), write.
// Contract: skills/protocols/references/models.md → "The per-user registry".
//
// Written ONLY by `config --models` (models.ts); read by the broker and every
// skill that seats a model. Never committed, never inside a project.

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { parseJsonc } from "./jsonc.ts";
import { SHIPPED_CLASSES, isProjectClassName, isShippedClass } from "./multimodel.ts";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };

export const TRANSPORTS = ["adapter", "http-chat", "http-typed", "native"] as const;
export type Transport = typeof TRANSPORTS[number];
/** Admitted adapters and the seat access each can hold (cross-model.md → Safety). */
export const ADAPTERS = ["claude", "codex", "agy"] as const;
export const ADAPTER_ACCESS: Readonly<Record<string, readonly ("repo" | "text")[]>> = {
  claude: ["repo", "text"],
  codex: ["repo", "text"],
  agy: ["text", "repo"],                       // repo only sandboxed, with the user's network-open consent (below)
};
/**
 * Adapters without a native read-only mode: a repo seat runs `--sandbox` in a
 * disposable copy of the project (committable files only, no .git), which the
 * OS confines for reads and writes but not for the network. Such a seat is
 * eligible only once the user has accepted that (`sandbox: "network-open"`).
 */
export const SANDBOXED_REPO_ADAPTERS: readonly string[] = ["agy"];
export const SANDBOX_CONSENTS = ["network-open"] as const;
export const needsSandboxConsent = (m: Model): boolean =>
  m.transport === "adapter" && SANDBOXED_REPO_ADAPTERS.includes(m.adapter ?? "") && m.sandbox !== "network-open";
export const HOSTS = ["claude", "codex"] as const;
/** Effort vocabularies per transport/adapter. `native` and `http-typed` accept none. */
export const EFFORTS: Readonly<Record<string, readonly string[]>> = {
  codex: ["low", "medium", "high", "xhigh", "max", "ultra"],
  claude: ["low", "medium", "high"],
  agy: [],                                     // effort is part of the agy model id (gemini-3.8-flash-high)
  "http-chat": ["low", "medium", "high", "xhigh"],
};
/** Provider key names accepted in `keyEnv` besides SUPERMODO_*. */
export const KNOWN_KEY_ENVS = ["TYPESAFE_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"] as const;
export const GUIDE_CAP_BYTES = 4096;

export type Model = {
  readonly lineage: string;
  readonly transport: Transport;
  readonly adapter?: string;
  readonly endpoint?: string;
  readonly keyEnv?: string;
  readonly pin?: string;
  readonly host?: string;
  readonly alias?: string;
  readonly sandbox?: typeof SANDBOX_CONSENTS[number];
};
export type Assignment = { readonly model: string; readonly effort?: string };
export type Decision = { readonly declined: string; readonly poolHash: string };
export type Registry = {
  readonly registryVersion: 1;
  readonly models: Readonly<Record<string, Model>>;
  readonly jobs: Readonly<Record<string, readonly Assignment[]>>;
  readonly projects: Readonly<Record<string, { readonly jobs: Readonly<Record<string, readonly Assignment[]>> }>>;
  readonly decisions: Readonly<Record<string, Decision>>;
};

export const EMPTY_REGISTRY: Registry = { registryVersion: 1, models: {}, jobs: {}, projects: {}, decisions: {} };

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const LINEAGE_RE = /^[a-z][a-z0-9-]*$/;
const PIN_RE = /^[a-z0-9][a-z0-9._-]*$/;
const ALIAS_RE = /^[a-z][a-z0-9-]*$/;
const PROJECT_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Registry directory: SUPERMODO_REGISTRY_DIR (tests, CI) → XDG → ~/.config → %APPDATA%. */
export const registryDir = (env: NodeJS.ProcessEnv = process.env): string =>
  isStr(env.SUPERMODO_REGISTRY_DIR) ? resolve(env.SUPERMODO_REGISTRY_DIR)
    : process.platform === "win32" && isStr(env.APPDATA) ? join(env.APPDATA, "supermodo")
    : isStr(env.XDG_CONFIG_HOME) ? join(env.XDG_CONFIG_HOME, "supermodo")
    : join(homedir(), ".config", "supermodo");

export const registryFile = (dir: string = registryDir()): string => join(dir, "registry.json");
export const guidesDir = (dir: string = registryDir()): string => join(dir, "guides");
export const guidePath = (id: string, dir: string = registryDir()): string => join(guidesDir(dir), `${id}.md`);

export const isKeyEnv = (v: unknown): v is string =>
  isStr(v) && (v.startsWith("SUPERMODO_") || (KNOWN_KEY_ENVS as readonly string[]).includes(v));

export const isJudgmentOnly = (m: Model): boolean => m.transport === "http-typed";

const checkModel = (id: string, v: Json): string[] => {
  const ctx = `models.${id}`;
  if (!ID_RE.test(id)) return [`${ctx}: model id matches ^[a-z0-9][a-z0-9-]*$`];
  if (!isObj(v)) return [`${ctx}: object expected`];
  const t = v.transport;
  const known = ["lineage", "transport", "adapter", "endpoint", "keyEnv", "pin", "host", "alias", "sandbox"];
  const base = [
    ...Object.keys(v).filter((k) => !known.includes(k)).map((k) => `${ctx}: unknown key "${k}"`),
    ...(isStr(v.lineage) && (v.lineage === "unknown" || LINEAGE_RE.test(v.lineage)) ? [] : [`${ctx}.lineage: training lineage slug (anthropic | openai | google | typesafe | …) or "unknown"`]),
    ...(isStr(t) && (TRANSPORTS as readonly string[]).includes(t) ? [] : [`${ctx}.transport: ${TRANSPORTS.join(" | ")}`]),
    ...(v.sandbox === undefined ? []
      : t !== "adapter" || !SANDBOXED_REPO_ADAPTERS.includes(String(v.adapter)) ? [`${ctx}.sandbox: only for a sandboxed adapter (${SANDBOXED_REPO_ADAPTERS.join(" | ")})`]
      : (SANDBOX_CONSENTS as readonly string[]).includes(String(v.sandbox)) ? [] : [`${ctx}.sandbox: ${SANDBOX_CONSENTS.join(" | ")}`]),
  ];
  const pinRule = v.pin === undefined ? [`${ctx}.pin: exact provider model id required for transport "${String(t)}"`]
    : isStr(v.pin) && PIN_RE.test(v.pin) ? [] : [`${ctx}.pin: exact provider model id (e.g. gpt-6-astra, claude-opus-5, jev-1.13.0)`];
  const noNative = ["host", "alias"].filter((k) => v[k] !== undefined).map((k) => `${ctx}.${k}: only for transport "native"`);
  const noHttp = ["endpoint", "keyEnv"].filter((k) => v[k] !== undefined).map((k) => `${ctx}.${k}: only for http transports`);
  const noAdapter = v.adapter !== undefined ? [`${ctx}.adapter: only for transport "adapter"`] : [];
  const byTransport =
    t === "adapter" ? [
      ...(isStr(v.adapter) && (ADAPTERS as readonly string[]).includes(v.adapter) ? [] : [`${ctx}.adapter: admitted adapter (${ADAPTERS.join(" | ")}) — Kimi and Gemini CLI are not admitted until they pass the canary-write test`]),
      ...pinRule, ...noNative, ...noHttp,
    ]
    : t === "http-chat" || t === "http-typed" ? [
      ...(isStr(v.endpoint) && /^https:\/\/[^\s"'<>]+$/.test(v.endpoint) ? [] : [`${ctx}.endpoint: https URL`]),
      ...(isKeyEnv(v.keyEnv) ? [] : [`${ctx}.keyEnv: SUPERMODO_* or one of ${KNOWN_KEY_ENVS.join(" | ")} — never an arbitrary env var name`]),
      ...pinRule, ...noNative, ...noAdapter,
    ]
    : t === "native" ? [
      ...(isStr(v.host) && (HOSTS as readonly string[]).includes(v.host) ? [] : [`${ctx}.host: ${HOSTS.join(" | ")}`]),
      ...(isStr(v.alias) && ALIAS_RE.test(v.alias) ? [] : [`${ctx}.alias: the host's model alias (e.g. sonnet)`]),
      ...(v.pin !== undefined ? [`${ctx}.pin: a native alias carries no pin — it is ineligible for pinned assignments (models.md D9)`] : []),
      ...noHttp, ...noAdapter,
    ]
    : [];
  return [...base, ...byTransport];
};

const effortsFor = (m: Model): readonly string[] =>
  m.transport === "adapter" ? (EFFORTS[m.adapter ?? ""] ?? []) : (EFFORTS[m.transport] ?? []);

/** The reserved assignment "host" = run this seat in the session's own model (approved, never automatic). */
export const HOST_MODEL = "host";

const checkAssignment = (ctx: string, cls: string, v: Json, models: Readonly<Record<string, Model>>, projectClasses: Readonly<Record<string, string>>): string[] => {
  if (!isObj(v)) return [`${ctx}: { "model": <id>, "effort"?: <level> }`];
  const unknown = Object.keys(v).filter((k) => !["model", "effort"].includes(k)).map((k) => `${ctx}: unknown key "${k}"`);
  if (v.model === HOST_MODEL) {
    const kind = isShippedClass(cls) ? SHIPPED_CLASSES[cls] : isShippedClass(projectClasses[cls]) ? SHIPPED_CLASSES[projectClasses[cls] as keyof typeof SHIPPED_CLASSES] : undefined;
    return [...unknown,
      ...(kind === "judgment" ? [`${ctx}: the host cannot hold a judgment class`] : []),
      ...(v.effort !== undefined ? [`${ctx}.effort: the host seat runs at the session's effort`] : [])];
  }
  if (!isStr(v.model) || models[v.model] === undefined) return [...unknown, `${ctx}.model: an enrolled model id (or "host")`];
  const m = models[v.model];
  const kind = isShippedClass(cls) ? SHIPPED_CLASSES[cls] : isShippedClass(projectClasses[cls]) ? SHIPPED_CLASSES[projectClasses[cls] as keyof typeof SHIPPED_CLASSES] : undefined;
  const allowed = effortsFor(m);
  return [
    ...unknown,
    ...(kind === "generative" && isJudgmentOnly(m) ? [`${ctx}: "${v.model}" is a typed-judgment model (http-typed) and cannot hold a generative class`] : []),
    ...(v.effort === undefined ? []
      : allowed.length === 0 ? [`${ctx}.effort: "${m.transport === "adapter" ? m.adapter : m.transport}" seats carry no effort${m.transport === "native" ? " (a native alias cannot be pinned to an effort — models.md D9)" : ""}`]
      : isStr(v.effort) && allowed.includes(v.effort) ? [] : [`${ctx}.effort: ${allowed.join(" | ")}`]),
  ];
};

const checkJobs = (ctx: string, v: Json, models: Readonly<Record<string, Model>>, projectClasses: Readonly<Record<string, string>>, projectScoped: boolean): string[] =>
  !isObj(v) ? [`${ctx}: object of class → ordered assignments`] :
    Object.entries(v).flatMap(([cls, list]) => [
      ...(projectScoped
        ? (isProjectClassName(cls) ? [] : [`${ctx}.${cls}: project-scoped assignments hold project classes (s-<name>) only`])
        : (isShippedClass(cls) ? [] : [`${ctx}.${cls}: shipped class (${Object.keys(SHIPPED_CLASSES).join(" | ")}); project classes (s-*) are assigned under projects.<id>.jobs`])),
      ...(!Array.isArray(list) ? [`${ctx}.${cls}: ordered array of assignments (first = preferred)`]
        : list.flatMap((a, i) => checkAssignment(`${ctx}.${cls}[${i}]`, cls, a, models, projectClasses))),
      ...(Array.isArray(list) && new Set(list.map((a) => isObj(a) ? `${String(a.model)}|${String(a.effort ?? "")}` : "")).size !== list.length
        ? [`${ctx}.${cls}: duplicate assignment`] : []),
    ]);

/**
 * Validate a parsed registry as untrusted input. `projectClasses` resolves
 * `s-*` classes for kind checks (from the CURRENT project's config; other
 * projects' scoped assignments are shape-checked only).
 */
export const checkRegistry = (v: Json, projectClasses: Readonly<Record<string, string>> = {}): string[] => {
  if (!isObj(v)) return ["registry: root must be an object"];
  const known = ["registryVersion", "models", "jobs", "projects", "decisions"];
  const models = isObj(v.models) ? v.models : {};
  const modelErrors = !isObj(v.models) ? ["models: object of id → definition"] : Object.entries(v.models).flatMap(([id, m]) => checkModel(id, m));
  // Assignments are checked against the models that ARE valid, so one bad
  // definition reports once instead of cascading into every assignment.
  const validModels = !isObj(v.models) ? {}
    : Object.fromEntries(Object.entries(v.models).filter(([id, m]) => checkModel(id, m).length === 0)) as unknown as Readonly<Record<string, Model>>;
  return [
    ...Object.keys(v).filter((k) => !known.includes(k)).map((k) => `registry: unknown key "${k}"${["command", "commands", "argv"].includes(k) ? " — the registry never holds a command; a model joins through an admitted adapter or an http transport" : ""}`),
    ...(v.registryVersion === 1 ? [] : ["registryVersion: literal 1"]),
    ...modelErrors,
    ...(v.jobs === undefined ? ["jobs: object expected (may be empty)"] : checkJobs("jobs", v.jobs, validModels, projectClasses, false)),
    ...(v.projects === undefined ? [] : !isObj(v.projects) ? ["projects: object of project id → { jobs }"]
      : Object.entries(v.projects).flatMap(([pid, p]) => [
        ...(PROJECT_ID_RE.test(pid) ? [] : [`projects.${pid}: project id`]),
        ...(!isObj(p) || !isObj(p.jobs) ? [`projects.${pid}: { "jobs": { "s-<class>": [...] } }`] : checkJobs(`projects.${pid}.jobs`, p.jobs, validModels, projectClasses, true)),
      ])),
    ...(v.decisions === undefined ? [] : !isObj(v.decisions) ? ["decisions: object"]
      : Object.entries(v.decisions).flatMap(([k, d]) => [
        ...(/^[a-z0-9-]+\|[a-z0-9-]+\|[a-z]*$/.test(k) ? [] : [`decisions.${k}: key is "<class>|<model>|<effort or empty>"`]),
        ...(!isObj(d) || !isStr(d.declined) || !DATE_RE.test(d.declined) || !isStr(d.poolHash) ? [`decisions.${k}: { "declined": "YYYY-MM-DD", "poolHash": <hash> }`] : []),
      ])),
    ...(isObj(models) ? [] : []),
  ];
};

export const readRegistry = (dir: string = registryDir(), projectClasses: Readonly<Record<string, string>> = {}): { registry?: Registry; errors: string[]; missing: boolean } => {
  const file = registryFile(dir);
  if (!existsSync(file)) return { registry: EMPTY_REGISTRY, errors: [], missing: true };
  const parsed = ((): Json | Error => { try { return parseJsonc(readFileSync(file, "utf8")) as Json; } catch (e) { return e as Error; } })();
  if (parsed instanceof Error) return { errors: [`${file}: invalid JSON — ${parsed.message}`], missing: false };
  const errors = checkRegistry(parsed, projectClasses);
  return errors.length > 0 ? { errors: errors.map((e) => `${basename(file)}: ${e}`), missing: false } : { registry: parsed as unknown as Registry, errors: [], missing: false };
};

/** Strict JSON, temp-then-rename, inside the registry dir only. */
export const writeRegistry = (registry: Registry, dir: string = registryDir()): string => {
  const errors = checkRegistry(registry as unknown as Json);
  if (errors.length > 0) throw new Error(`refusing to write an invalid registry: ${errors.join("; ")}`);
  mkdirSync(dir, { recursive: true });
  const file = registryFile(dir);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  renameSync(tmp, file);
  return file;
};

/** A guide is contained in the registry's guides dir, ≤ 4 KB, for an enrolled model. */
export const checkGuide = (id: string, dir: string, registry: Registry): string[] => {
  const p = guidePath(id, dir);
  const contained = resolve(p).startsWith(resolve(guidesDir(dir)) + sep);
  return [
    ...(registry.models[id] === undefined ? [`guide ${id}: no enrolled model with that id`] : []),
    ...(contained ? [] : [`guide ${id}: path escapes the registry dir`]),
    ...(existsSync(p) && statSync(p).size > GUIDE_CAP_BYTES ? [`guide ${id}: ${statSync(p).size} bytes exceeds the ${GUIDE_CAP_BYTES}-byte cap`] : []),
  ];
};

export const writeGuide = (id: string, text: string, dir: string, registry: Registry): string => {
  if (registry.models[id] === undefined) throw new Error(`no enrolled model "${id}"`);
  if (Buffer.byteLength(text, "utf8") > GUIDE_CAP_BYTES) throw new Error(`guide exceeds the ${GUIDE_CAP_BYTES}-byte cap`);
  mkdirSync(guidesDir(dir), { recursive: true });
  const p = guidePath(id, dir);
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  renameSync(tmp, p);
  return p;
};

export const readGuide = (id: string, dir: string = registryDir()): string | undefined => {
  const p = guidePath(id, dir);
  return existsSync(p) && statSync(p).size <= GUIDE_CAP_BYTES ? readFileSync(p, "utf8") : undefined;
};

/** The pool hash: which models are enrolled (id + pin + transport). A changed pool voids declines. */
export const poolHash = (registry: Registry): string =>
  createHash("sha256")
    .update(Object.entries(registry.models).map(([id, m]) => `${id}:${m.transport}:${m.pin ?? m.alias ?? ""}`).sort().join("\n"))
    .digest("hex").slice(0, 16);

export const decisionKey = (cls: string, model: string, effort?: string): string => `${cls}|${model}|${effort ?? ""}`;

/** Assignments for a class: project-scoped for s-* (by project id), global otherwise. */
export const assignmentsFor = (registry: Registry, cls: string, projectId?: string): readonly Assignment[] =>
  isProjectClassName(cls)
    ? (projectId !== undefined ? registry.projects[projectId]?.jobs[cls] ?? [] : [])
    : registry.jobs[cls] ?? [];
