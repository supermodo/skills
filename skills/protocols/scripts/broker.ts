// The broker — solves a skill's variant, proposes approvals, and executes every
// external seat itself. Contract: references/models.md ("The broker") and
// references/cross-model.md (operating a seat). The host LLM calls this and reads
// its JSON; it never composes a seat's command line.
//
// Usage (Node ≥ 22.18):
//   node broker.ts plan     --skill <slug> --project-root <dir> --host claude|codex [--host-pin <id>] [--variant <v>] [--skills-dir <dir>] [--run <id>]
//   node broker.ts dispatch --plan <plan.json> --seat <id> --brief <file> [--resume] [--schema <file>] [--result <file>] [--run <id>]
//                           (--result: a host/native seat's output, produced by the moderator, so the ledger records it as status "host")
//   node broker.ts ledger   --project-root <dir> --run <id>
//   node broker.ts apply-patch  --project-root <dir> --run <id> --patch <patch.json>     (dry-run all blocks, then write; journals pre-images)
//   node broker.ts revert-patch --journal <journal.json>                                  (refuses files edited since the patch)
// Every command prints ONE JSON object on stdout. Exit 0 = the command ran
// (a dispatch whose seat FAILED still exits 0 with status "failed"); exit 1 =
// the command itself could not run (bad args, invalid registry/policy/descriptor).

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseJsonc } from "../../config/scripts/jsonc.ts";
import { projectClassMap, classKind } from "../../config/scripts/multimodel.ts";
import { type Model, type Registry, HOST_MODEL, readGuide, readRegistry, registryDir } from "../../config/scripts/registry.ts";
import { readRoster } from "../../config/scripts/roster-check.ts";
import { projectIdFor } from "../../config/scripts/models.ts";
import { type Descriptor, loadDescriptor } from "./descriptor.ts";
import { type Host, type Plan, type Policy, type Seat, propose, requestsOf, solve } from "./solver.ts";
import { type Journal, type Patch, applyPatch, checkPatch, revertPatch } from "./patch.ts";
import { changesIn, makeCopy, removeCopy } from "./sandbox-copy.ts";

type Flags = Readonly<Record<string, string | true>>;
const parse = (argv: readonly string[]): { cmd: string; flags: Flags } => ({
  cmd: argv[0] ?? "",
  flags: argv.slice(1).reduce<Flags>((acc, a, i, all) =>
    a.startsWith("--") ? { ...acc, [a.slice(2)]: all[i + 1] !== undefined && !all[i + 1].startsWith("--") ? all[i + 1] : true } : acc, {}),
});
const str = (v: string | true | undefined): string | undefined => (typeof v === "string" ? v : undefined);
const die = (msg: string): never => { throw new Error(msg); };

const LINEAGE_OF_HOST = { claude: "anthropic", codex: "openai" } as const;
const TOTAL_TIMEOUT_MS = 10 * 60 * 1000;

// A provider that is out of CAPACITY ("503", "high demand", "overloaded") is
// not a failing model: the same seat is retried after a backoff instead of
// stopping the run. An exhausted account quota or usage limit is not capacity
// and fails at once. SUPERMODO_CAPACITY_BACKOFF_MS overrides the schedule (tests).
const CAPACITY_RE = /\b503\b|high demand|overloaded|temporarily unavailable|server is busy|try again later/i;
const QUOTA_RE = /usage limit|quota|insufficient[_ ]credit|billing/i;
const capacityBackoffMs = (): readonly number[] =>
  (process.env.SUPERMODO_CAPACITY_BACKOFF_MS ?? "60000,120000,240000").split(",").map(Number).filter((n) => Number.isFinite(n) && n >= 0);
const isCapacityFailure = (r: Result): boolean =>
  r.status === "failed" && CAPACITY_RE.test(r.cause ?? "") && !QUOTA_RE.test(r.cause ?? "");
const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));
const withCapacityRetry = async (run: () => Promise<Result>, waits: readonly number[] = capacityBackoffMs(), tried = 0): Promise<Result> => {
  const r = await run();
  if (!isCapacityFailure(r) || waits.length === 0) return tried === 0 || !isCapacityFailure(r) ? r
    : { ...r, cause: `provider out of capacity after ${tried + 1} attempts (backoff exhausted): ${r.cause}` };
  await sleep(waits[0]);
  return withCapacityRetry(run, waits.slice(1), tried + 1);
};
const STALL_TIMEOUT_MS = 5 * 60 * 1000;
/** The wall clock scales with the effort the user pinned: a deep review is slow by design, not hung. */
const wallClockFor = (effort: string | undefined): number =>
  effort === "ultra" || effort === "max" ? 20 * 60 * 1000 : effort === "xhigh" ? 15 * 60 * 1000 : TOTAL_TIMEOUT_MS;
const READ_ONLY_TOOLS = "Read,Grep,Glob";
// `--allowedTools` only PRE-APPROVES; it does not remove tools (a canary write
// went through). `--restricted --tools` sets the tool set itself and ignores
// user/project settings; the disallow list is belt and braces.
const WRITE_TOOLS = "Write,Edit,MultiEdit,NotebookEdit,Bash,PowerShell,WebFetch";
// A text seat has no repository access: a model that tries a tool ends its turn
// with nothing. The preamble makes the constraint explicit in the brief itself.
const TEXT_SEAT_PREAMBLE = "You are running as a text-only seat: you have NO tools in this session — no file reading, no shell, no web. Every file, diff, quote or fact you need is included below; if something is missing, say exactly what is missing instead of trying to fetch it.\n\n";

// ---------- plan ----------

type Config = { multimodel?: { classes?: unknown; variants?: Record<string, string>; forbid?: Record<string, string[]>; require?: Record<string, string[]>; concurrency?: number; budget?: { callsPerRun?: number } }; agents?: { dir?: string } };

const readConfig = (root: string): Config => {
  const f = resolve(root, "skills.config.json");
  try { return existsSync(f) ? (parseJsonc(readFileSync(f, "utf8")) as Config) : {}; } catch { return {}; }
};

const policyOf = (cfg: Config): Policy => ({
  forbid: cfg.multimodel?.forbid ?? {},
  require: cfg.multimodel?.require ?? {},
  classes: projectClassMap(cfg.multimodel?.classes as never),
});

const variantOf = (d: Descriptor, cfg: Config, flag: string | undefined): string =>
  flag ?? cfg.multimodel?.variants?.[d.skill] ?? cfg.multimodel?.variants?.["*"] ?? d.default;

const runId = (): string => new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");

const plan = (flags: Flags): unknown => {
  const root = resolve(str(flags["project-root"]) ?? ".");
  const skillsDir = resolve(str(flags["skills-dir"]) ?? join(new URL(".", import.meta.url).pathname, "../.."));
  const skill = str(flags.skill) ?? die("plan: --skill required");
  const hostSlug = str(flags.host) as Host["hostSlug"] | undefined ?? die("plan: --host claude|codex required");
  if (!(hostSlug in LINEAGE_OF_HOST)) die("plan: --host claude|codex");
  const host: Host = { hostSlug, lineage: LINEAGE_OF_HOST[hostSlug], ...(str(flags["host-pin"]) ? { pin: str(flags["host-pin"]) } : {}) };
  const cfg = readConfig(root);
  const policy = policyOf(cfg);
  const { descriptor, errors } = loadDescriptor(join(skillsDir, skill, "sequence.json"));
  if (descriptor === undefined) die(errors.join("\n"));
  const d = descriptor as Descriptor;
  const variant = variantOf(d, cfg, str(flags.variant));
  const v = d.variants[variant] ?? die(`plan: skill ${skill} has no variant "${variant}" (${Object.keys(d.variants).join(", ")})`);
  const loaded = readRegistry(registryDir(), policy.classes);
  if (loaded.errors.length > 0) die(loaded.errors.join("\n"));
  const registry = loaded.registry as Registry;
  const { id: projectId } = projectIdFor(root);
  const roster = readRoster(root, cfg.agents?.dir ?? ".supermodo/agents");
  const requests = requestsOf(v.nodes, roster, policy.classes);
  const fanOutEmpty = v.nodes.filter((n) => n.role.startsWith("roster:") && !requests.some((r) => r.id.startsWith(`${n.id}/`))).map((n) => n.id);
  const solved: Plan = solve(requests, registry, policy, host, projectId);
  const proposal = propose(requests, registry, policy, host, projectId);
  const id = str(flags.run) ?? runId();
  const out = {
    run: id, skill, variant, promises: v.promises, host, projectId, projectRoot: root,
    seats: solved.seats, unstaffed: solved.unstaffed, independence: solved.independence,
    fanOutEmpty,
    proposal: proposal.length > 0 ? { rows: proposal.map(({ candidates, flags: f, seats, ...row }) => row), detail: proposal } : null,
    staffed: solved.unstaffed.length === 0 && fanOutEmpty.length === 0,
    registryPool: Object.keys(registry.models).length,
    registryFile: join(registryDir(), "registry.json"),   // so a wrong SUPERMODO_REGISTRY_DIR is visible, not a silent empty pool
    roundsDir: join(root, ".skills", "supermodo", "rounds", `${id}-${skill}`),
  };
  const dir = join(root, ".skills", "supermodo", "plans");
  mkdirSync(dir, { recursive: true });
  mkdirSync(out.roundsDir, { recursive: true });
  const file = join(dir, `${id}-${skill}.json`);
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  if (proposal.length > 0) writeFileSync(join(dir, `${id}-${skill}-proposal.json`), `${JSON.stringify({ rows: out.proposal?.rows }, null, 2)}\n`);
  return { ...out, planFile: file, proposalFile: proposal.length > 0 ? join(dir, `${id}-${skill}-proposal.json`) : null };
};

// ---------- dispatch ----------

type Result = {
  readonly status: "ok" | "unreviewed" | "failed" | "host";   // "host": launched by the moderator, ledgered here
  readonly cause?: string;
  readonly effectiveModel?: string;            // from structured metadata, else "unverified"
  readonly sandbox?: string;
  readonly session?: string;
  readonly text?: string;
  readonly json?: unknown;
  readonly durationMs: number;
};

const runProcess = (cmd: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv, stdinText?: string, streams = true, wallClockMs = TOTAL_TIMEOUT_MS): Promise<{ code: number | null; stdout: string; stderr: string; stalled: boolean; timedOut: boolean }> =>
  new Promise((resolveP) => {
    const chunks: Buffer[] = [];
    const errs: Buffer[] = [];
    const started = Date.now();
    // stdin is CLOSED (never hangs on a tty) unless the adapter feeds the brief through it, in which case it is written and ended at once.
    const child = spawn(cmd, [...args], { cwd, env, stdio: [stdinText === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    if (stdinText !== undefined && child.stdin) { child.stdin.end(stdinText); }
    const state = { lastOut: Date.now(), stalled: false, timedOut: false };
    const stall = setInterval(() => {
      // The silence watchdog is only meaningful for a CLI that streams events; a buffering one is bounded by the wall clock alone.
      if (streams && Date.now() - state.lastOut > STALL_TIMEOUT_MS) { state.stalled = true; child.kill("SIGKILL"); }
      if (Date.now() - started > wallClockMs) { state.timedOut = true; child.kill("SIGKILL"); }
    }, 5000);
    child.stdout.on("data", (b: Buffer) => { chunks.push(b); state.lastOut = Date.now(); });
    child.stderr.on("data", (b: Buffer) => { errs.push(b); });
    child.on("close", (code) => {
      clearInterval(stall);
      resolveP({ code, stdout: Buffer.concat(chunks).toString("utf8"), stderr: Buffer.concat(errs).toString("utf8"), stalled: state.stalled, timedOut: state.timedOut });
    });
    child.on("error", () => { clearInterval(stall); resolveP({ code: null, stdout: "", stderr: `cannot start ${cmd}`, stalled: false, timedOut: false }); });
  });

/** Codex records the effective model and sandbox in its session rollout — structured identity, never a self-report. */
const codexRollout = (thread: string): { model?: string; sandbox?: string } => {
  const base = join(homedir(), ".codex", "sessions");
  const walk = (dir: string): readonly string[] =>
    !existsSync(dir) ? [] : readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : p.includes(thread) && p.endsWith(".jsonl") ? [p] : [];
    });
  const file = walk(base)[0];
  if (file === undefined) return {};
  const text = readFileSync(file, "utf8");
  return {
    ...(text.match(/"model":"([^"]+)"/) ? { model: text.match(/"model":"([^"]+)"/)?.[1] } : {}),
    ...(text.match(/"sandbox_policy":\{"type":"([^"]+)"/) ? { sandbox: text.match(/"sandbox_policy":\{"type":"([^"]+)"/)?.[1] } : {}),
  };
};

const dispatchCodex = async (seat: Seat, m: Model, brief: string, cwd: string, session: string | undefined, schema: string | undefined): Promise<Result> => {
  const started = Date.now();
  const effortArgs = seat.effort ? ["-c", `model_reasoning_effort="${seat.effort}"`] : [];
  const gitArgs = existsSync(join(cwd, ".git")) ? [] : ["--skip-git-repo-check"];
  const args = session === undefined
    ? ["exec", "--json", "-s", "read-only", "-m", m.pin as string, ...effortArgs, ...(schema ? ["--output-schema", schema] : []), ...gitArgs, "-"]
    : ["exec", "resume", session, "--json", "-c", 'sandbox_mode="read-only"', "-m", m.pin as string, ...effortArgs, ...(schema ? ["--output-schema", schema] : []), ...gitArgs, "-"];
  // The brief travels on stdin ("-"), never in argv: a brief starting with "-" cannot smuggle a flag, and size is not capped by ARG_MAX.
  const r = await runProcess("codex", args, cwd, process.env, brief, true, wallClockFor(seat.effort));
  const events = r.stdout.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return undefined; } }).filter((e): e is Record<string, unknown> => e !== undefined);
  const thread = session ?? (events.find((e) => e.type === "thread.started")?.thread_id as string | undefined);
  const messages = events.filter((e) => e.type === "item.completed" && (e.item as { type?: string })?.type === "agent_message").map((e) => (e.item as { text: string }).text);
  const failedTurn = events.find((e) => e.type === "turn.failed" || e.type === "error");
  const ident = thread ? codexRollout(thread) : {};
  const durationMs = Date.now() - started;
  const base = { session: thread, effectiveModel: ident.model ?? "unverified", sandbox: ident.sandbox, durationMs };
  if (r.stalled) return { ...base, status: "failed", cause: "stalled: no output for 5 min" };
  if (r.timedOut) return { ...base, status: "failed", cause: `timed out after ${wallClockFor(seat.effort) / 60000} min` };
  if (failedTurn !== undefined) return { ...base, status: "failed", cause: String((failedTurn.error as { message?: string })?.message ?? failedTurn.message ?? "turn failed") };
  if (r.code !== 0) return { ...base, status: "failed", cause: `codex exited ${r.code}: ${r.stderr.trim().split("\n").slice(-3).join(" | ")}` };
  if (ident.model !== undefined && ident.model !== m.pin) return { ...base, status: "failed", cause: `identity mismatch: requested ${m.pin}, session ran ${ident.model}` };
  if (ident.sandbox !== undefined && ident.sandbox !== "read-only") return { ...base, status: "failed", cause: `sandbox was ${ident.sandbox}, not read-only` };
  const text = messages[messages.length - 1];
  if (text === undefined) return { ...base, status: "unreviewed", cause: "no agent message in output" };
  return schema ? parsedJson(base, text) : { ...base, status: "ok", text };
};

const parsedJson = (base: Omit<Result, "status">, text: string): Result => {
  try { return { ...base, status: "ok", json: JSON.parse(text), text }; } catch { return { ...base, status: "unreviewed", cause: "output did not match the declared schema (not JSON)", text }; }
};

const dispatchClaude = async (seat: Seat, m: Model, brief: string, cwd: string, session: string | undefined, schema: string | undefined): Promise<Result> => {
  const started = Date.now();
  const args = [
    "-p", "--model", m.pin as string, ...(seat.effort ? ["--effort", seat.effort] : []),
    "--restricted", "--tools", READ_ONLY_TOOLS, "--allowedTools", READ_ONLY_TOOLS, "--disallowedTools", WRITE_TOOLS,
    "--permission-mode", "manual", "--settings", '{"disableAllHooks":true}', "--output-format", "stream-json", "--verbose",
    ...(schema ? ["--json-schema", readFileSync(schema, "utf8")] : []),
    ...(session ? ["--resume", session] : []),
  ];
  // `-p` with no prompt argument reads the prompt from stdin: no user text in argv.
  const r = await runProcess("claude", args, cwd, process.env, brief, true, wallClockFor(seat.effort));
  const durationMs = Date.now() - started;
  // stream-json keeps stdout alive while the seat thinks (json mode buffers everything and trips the stall watchdog); the final `result` event carries identity and text.
  const out = r.stdout.split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return undefined; } })
    .filter((e): e is Record<string, unknown> => e !== undefined && e.type === "result").pop();
  const usage = (out?.modelUsage ?? {}) as Record<string, { canonicalModel?: string }>;
  const effective = Object.values(usage)[0]?.canonicalModel ?? Object.keys(usage)[0] ?? "unverified";
  const base = { session: out?.session_id as string | undefined, effectiveModel: effective, sandbox: `restricted tools=${READ_ONLY_TOOLS}`, durationMs };
  if (r.stalled) return { ...base, status: "failed", cause: "stalled: no output for 5 min" };
  if (r.timedOut) return { ...base, status: "failed", cause: `timed out after ${wallClockFor(seat.effort) / 60000} min` };
  if (r.code !== 0 || out === undefined || out.is_error === true) return { ...base, status: "failed", cause: `claude exited ${r.code}: ${String(out?.result ?? r.stderr.trim().split("\n").slice(-3).join(" | "))}` };
  if (effective !== "unverified" && effective !== m.pin) return { ...base, status: "failed", cause: `identity mismatch: requested ${m.pin}, ran ${effective}` };
  if (schema) return out.structured_output !== undefined ? { ...base, status: "ok", json: out.structured_output, text: String(out.result ?? "") } : parsedJson(base, String(out.result ?? ""));
  return { ...base, status: "ok", text: String(out.result ?? "") };
};

/** Antigravity records the model in its conversation store — structured identity, never a self-report. */
const agyConversationModel = (conversation: string): string | undefined => {
  const f = join(homedir(), ".gemini", "antigravity-cli", "conversations", `${conversation}.db`);
  if (!existsSync(f)) return undefined;
  const text = readFileSync(f).toString("latin1");
  const ids = [...new Set(text.match(/gemini-[0-9.]+-[a-z0-9-]+/g) ?? [])];
  return ids.sort((a, b) => b.length - a.length)[0];   // the fullest id (with the effort suffix) is the requested one
};

/** agy: print mode denies every tool (no --dangerously-skip-permissions, --mode plan, --sandbox) → a TEXT seat; the brief travels on stdin. */
// A repo seat on agy (no native read-only mode) reads a disposable copy: the OS
// sandbox confines reads and writes to it (network stays open — the user
// accepted that per model), paths in the brief are rewritten to the copy and
// back in the answer, and any change inside the copy voids the verdict.
const dispatchAgyRepo = async (m: Model, brief: string, root: string, session: string | undefined, schema: string | undefined): Promise<Result> => {
  const copy = makeCopy(root, brief);
  try {
    const toCopy = (s: string): string => s.split(root).join(copy.dir);
    const preamble = `You are a read-only reviewer. The project is at ${copy.dir} (a sandboxed copy: committable files only, no .git). Read any file you need there; do not create, edit or delete anything.\n\n`;
    const r = await dispatchAgy(m, preamble + toCopy(brief), copy.dir, session, schema,
      ["--sandbox=true", "--dangerously-skip-permissions", "--add-dir", copy.dir], `agy --sandbox in a disposable copy (${copy.files} committable files, no .git; OS-confined reads/writes, network open)`);
    const changed = changesIn(copy);
    const back = (s: string | undefined): string | undefined => s === undefined ? undefined : s.split(copy.dir).join(root);
    return changed.length > 0
      ? { ...r, status: "failed", text: undefined, cause: `read-only contract broken: the seat changed ${changed.length} file(s) in its sandboxed copy (${changed.slice(0, 5).join(", ")}${changed.length > 5 ? ", …" : ""}); verdict discarded, project untouched` }
      : { ...r, text: back(r.text), cause: back(r.cause), ...(r.json !== undefined ? { json: JSON.parse(back(JSON.stringify(r.json)) as string) } : {}) };
  } finally { removeCopy(copy); }
};

// agy's menu ids carry the thinking level (gemini-3.1-pro-high) while the
// conversation reports the backend id (gemini-3.1-pro-preview-customtools):
// the served id must belong to the pinned model family; the level is a menu
// setting the metadata does not expose. The served id is what gets ledgered.
const agyFamily = (pin: string): string => pin.replace(/-(low|medium|high)$/, "");
export const agyServes = (pin: string, served: string): boolean =>
  served === pin || served === agyFamily(pin) || served.startsWith(`${agyFamily(pin)}-`);

const dispatchAgy = async (m: Model, brief: string, cwd: string, session: string | undefined, schema: string | undefined,
  toolArgs: readonly string[] = ["--sandbox", "--mode", "plan"], sandboxLabel?: string): Promise<Result> => {
  const started = Date.now();
  const args = [...toolArgs, "--model", m.pin as string, "--output-format", "json", "--print-timeout", "9m",
    ...(schema ? ["--json-schema", schema] : []), ...(session ? ["--conversation", session] : [])];
  const r = await runProcess("agy", args, cwd, process.env, brief, false);
  const durationMs = Date.now() - started;
  const out = ((): Record<string, unknown> | undefined => { try { return JSON.parse(r.stdout) as Record<string, unknown>; } catch { return undefined; } })();
  const conversation = out?.conversation_id as string | undefined;
  const effective = conversation ? agyConversationModel(conversation) ?? "unverified" : "unverified";
  const denied = Array.isArray(out?.denied_actions) ? (out?.denied_actions as { display_name?: string }[]).map((d) => d.display_name ?? "?") : [];
  const base = { session: conversation, effectiveModel: effective, sandbox: sandboxLabel ?? `agy print mode: every tool denied${denied.length ? ` (tried ${denied.join(", ")})` : ""}`, durationMs };
  if (r.stalled) return { ...base, status: "failed", cause: "stalled: no output for 5 min" };
  if (r.timedOut) return { ...base, status: "failed", cause: `timed out after ${TOTAL_TIMEOUT_MS / 60000} min` };
  if (r.code !== 0 || out === undefined || out.status !== "SUCCESS") return { ...base, status: "failed", cause: `agy exited ${r.code}: ${String(out?.error ?? r.stderr.trim().split("\n").slice(-3).join(" | "))}` };
  if (effective !== "unverified" && !agyServes(m.pin as string, effective)) return { ...base, status: "failed", cause: `identity mismatch: requested ${m.pin}, conversation ran ${effective}` };
  const text = String(out.response ?? "");
  if (text.trim() === "") return { ...base, status: "unreviewed", cause: `empty response${denied.length ? ` — the seat tried to use a tool (${denied.join(", ")}); a text seat needs every artefact inside the brief` : ""}` };
  return schema ? parsedJson(base, text) : { ...base, status: "ok", text };
};

const keyFor = (m: Model): string | undefined => (m.keyEnv ? process.env[m.keyEnv] : undefined);

const dispatchHttpChat = async (seat: Seat, m: Model, brief: string, schema: string | undefined): Promise<Result> => {
  const started = Date.now();
  const key = keyFor(m);
  if (key === undefined) return { status: "failed", cause: `${m.keyEnv} is not set`, durationMs: 0 };
  const body = { model: m.pin, messages: [{ role: "user", content: brief }], ...(seat.effort ? { reasoning_effort: seat.effort } : {}), ...(schema ? { response_format: { type: "json_object" } } : {}) };
  try {
    const res = await fetch(m.endpoint as string, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(TOTAL_TIMEOUT_MS) });
    const durationMs = Date.now() - started;
    const json = (await res.json().catch(() => undefined)) as Record<string, unknown> | undefined;
    const effective = (json?.model as string | undefined) ?? "unverified";
    const base = { effectiveModel: effective, sandbox: "http (no process, no repository)", durationMs };
    if (!res.ok) return { ...base, status: "failed", cause: `HTTP ${res.status}: ${JSON.stringify(json ?? {}).slice(0, 200)}` };
    if (effective !== "unverified" && !effective.startsWith(m.pin as string)) return { ...base, status: "failed", cause: `identity mismatch: requested ${m.pin}, served ${effective}` };
    const text = ((json?.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content) ?? undefined;
    if (text === undefined) return { ...base, status: "unreviewed", cause: "no message content in response" };
    return schema ? parsedJson(base, text) : { ...base, status: "ok", text };
  } catch (e) {
    return { status: "failed", cause: `request failed: ${(e as Error).message}`, durationMs: Date.now() - started };
  }
};

const dispatchHttpTyped = async (m: Model, brief: string): Promise<Result> => {
  const started = Date.now();
  const key = keyFor(m);
  if (key === undefined) return { status: "failed", cause: `${m.keyEnv} is not set`, durationMs: 0 };
  const req = ((): Record<string, unknown> | undefined => { try { return JSON.parse(brief) as Record<string, unknown>; } catch { return undefined; } })();
  if (req === undefined || req.state === undefined || req.questions === undefined) return { status: "failed", cause: "a typed seat's brief is JSON { state, questions }", durationMs: 0 };
  try {
    const res = await fetch(m.endpoint as string, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ ...req, model: m.pin }), signal: AbortSignal.timeout(TOTAL_TIMEOUT_MS) });
    const durationMs = Date.now() - started;
    const json = (await res.json().catch(() => undefined)) as Record<string, unknown> | undefined;
    const effective = (json?.model as string | undefined) ?? "unverified";
    const base = { effectiveModel: effective, sandbox: "http (no process, no repository)", durationMs };
    if (!res.ok) return { ...base, status: "failed", cause: `HTTP ${res.status}: ${JSON.stringify(json ?? {}).slice(0, 200)}` };
    if (effective !== "unverified" && !effective.startsWith(m.pin as string)) return { ...base, status: "failed", cause: `identity mismatch: requested ${m.pin}, served ${effective}` };
    return json?.answers === undefined ? { ...base, status: "unreviewed", cause: "no answers in response" } : { ...base, status: "ok", json: json.answers };
  } catch (e) {
    return { status: "failed", cause: `request failed: ${(e as Error).message}`, durationMs: Date.now() - started };
  }
};

type PlanFile = ReturnType<typeof plan> & { run: string; projectRoot: string; seats: readonly Seat[]; skill: string; host: Host; independence: string };

const ledgerFile = (root: string, run: string): string => {
  const dir = join(root, ".skills", "supermodo", "ledger");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${run}.jsonl`);
};

const dispatch = async (flags: Flags): Promise<unknown> => {
  const planFile = str(flags.plan) ?? die("dispatch: --plan <plan.json> required");
  const p = JSON.parse(readFileSync(resolve(planFile), "utf8")) as PlanFile;
  const seatId = str(flags.seat) ?? die("dispatch: --seat <id> required");
  const seat = p.seats.find((s) => s.id === seatId) ?? die(`dispatch: no seat "${seatId}" in the plan`);
  const briefFile = str(flags.brief) ?? die("dispatch: --brief <file> required");
  const registry = readRegistry(registryDir()).registry ?? die("registry unreadable");
  const guide = seat.model === HOST_MODEL ? undefined : readGuide(seat.model);
  const model = registry.models[seat.model];
  const textOnly = seat.transport === "http-chat" || (seat.transport === "adapter" && model?.adapter === "agy" && seat.access !== "repo");
  const briefBody = readFileSync(resolve(briefFile), "utf8");
  if (briefBody.trim().length === 0) die(`dispatch: the brief ${briefFile} is empty — a seat is never run on nothing`);
  const brief = (textOnly ? TEXT_SEAT_PREAMBLE : "") + briefBody + (guide ? `\n\n<model-guide>\n${guide}</model-guide>\n` : "");
  const schema = str(flags.schema) ? resolve(str(flags.schema) as string) : undefined;
  const session = flags.resume === true ? lastSession(p.projectRoot, p.run, seatId) : undefined;
  const started = new Date().toISOString();
  const hostOutput = str(flags.result) ? readFileSync(resolve(str(flags.result) as string), "utf8") : undefined;
  const result: Result = await withCapacityRetry(async () => seat.transport === "host" || seat.transport === "native"
    // A host/native seat is launched by the moderator; the broker ledgers it — with its output when `--result <file>` is passed.
    ? { status: "host", effectiveModel: seat.transport === "host" ? (p.host.pin ?? "unverified") : "unverified", sandbox: seat.transport === "host" ? "host session" : `native subagent (alias ${registry.models[seat.model]?.alias ?? "?"})`, durationMs: 0,
        ...(hostOutput !== undefined ? { text: hostOutput } : { cause: `seat ${seatId} is ${seat.transport}: launched by the moderator; pass --result <file> to ledger its output` }) }
    : seat.transport === "adapter" && registry.models[seat.model].adapter === "codex" ? await dispatchCodex(seat, registry.models[seat.model], brief, p.projectRoot, session, schema)
    : seat.transport === "adapter" && registry.models[seat.model].adapter === "claude" ? await dispatchClaude(seat, registry.models[seat.model], brief, p.projectRoot, session, schema)
    : seat.transport === "adapter" && registry.models[seat.model].adapter === "agy" && seat.access === "repo"
      ? (registry.models[seat.model].sandbox === "network-open" ? await dispatchAgyRepo(registry.models[seat.model], brief, p.projectRoot, session, schema)
        : { status: "failed", cause: `seat ${seat.id} needs repository access and ${seat.model} has no network-open consent — run config --models consent ${seat.model}`, durationMs: 0 })
    : seat.transport === "adapter" && registry.models[seat.model].adapter === "agy" ? await dispatchAgy(registry.models[seat.model], brief, p.projectRoot, session, schema)
    : seat.transport === "http-chat" ? await dispatchHttpChat(seat, registry.models[seat.model], brief, schema)
    : seat.transport === "http-typed" ? await dispatchHttpTyped(registry.models[seat.model], brief)
    : { status: "failed", cause: `no adapter for transport ${seat.transport}`, durationMs: 0 });
  const entry = {
    at: started, run: p.run, skill: p.skill, seat: seat.id, role: seat.role, class: seat.class,
    model: seat.model, transport: seat.transport, requestedPin: registry.models[seat.model]?.pin ?? null, effort: seat.effort ?? null,
    effectiveModel: result.effectiveModel ?? "unverified", sandbox: result.sandbox ?? null, lineage: seat.lineage,
    session: result.session ?? null, status: result.status, cause: result.cause ?? null, independent: seat.independent,
    kind: classKind(seat.class, {}) === "judgment" ? "typed-check" : "generative", durationMs: result.durationMs,
    // A judgment seat's typed answers are small and are what later agreement is measured on.
    ...(classKind(seat.class, {}) === "judgment" && result.json !== undefined ? { answers: result.json } : {}),
  };
  appendFileSync(ledgerFile(p.projectRoot, p.run), `${JSON.stringify(entry)}\n`);
  return { ...entry, text: result.text ?? null, json: result.json ?? null };
};

const lastSession = (root: string, run: string, seatId: string): string | undefined => {
  const f = ledgerFile(root, run);
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { seat: string; session: string | null })
    .filter((e) => e.seat === seatId && e.session).map((e) => e.session as string).pop();
};

const ledger = (flags: Flags): unknown => {
  const root = resolve(str(flags["project-root"]) ?? ".");
  const run = str(flags.run) ?? die("ledger: --run <id> required");
  const f = ledgerFile(root, run);
  return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};

// Triager pilot measurement (judgment-roles.md → triager): the user's later
// promote/dismiss of a finding is recorded beside the triager's materiality
// answer (question key `materiality:<finding id>`), so agreement is measured
// before the triager is ever allowed to gate anything.
const dispositionsFile = (root: string): string => join(ledgerFile(root, "dispositions"));

const disposition = (flags: Flags): unknown => {
  const root = resolve(str(flags["project-root"]) ?? ".");
  const finding = str(flags.finding) ?? die("disposition: --finding <id> required");
  const decision = str(flags.decision) ?? die("disposition: --decision promoted|dismissed required");
  if (decision !== "promoted" && decision !== "dismissed") die("disposition: --decision promoted|dismissed");
  const entry = { at: new Date().toISOString(), event: "disposition", finding, decision };
  appendFileSync(dispositionsFile(root), `${JSON.stringify(entry)}\n`);
  return entry;
};

type Choice = { readonly choice?: string };
export const triageAgreement = (entries: readonly Record<string, unknown>[]): { pairs: number; agree: number; disagree: number; uncertain: number; rate: number | null } => {
  const triaged = new Map(entries.filter((e) => e.role === "triager" && e.answers !== undefined)
    .flatMap((e) => Object.entries(e.answers as Record<string, Choice>).filter(([k]) => k.startsWith("materiality:")).map(([k, v]) => [k.slice("materiality:".length), v.choice] as const)));
  const decided = new Map(entries.filter((e) => e.event === "disposition").map((e) => [String(e.finding), String(e.decision)] as const));
  const joined = [...decided].filter(([id]) => triaged.has(id)).map(([id, d]) => [triaged.get(id), d] as const);
  const uncertain = joined.filter(([c]) => c !== "material" && c !== "nit").length;
  const scored = joined.filter(([c]) => c === "material" || c === "nit");
  const agree = scored.filter(([c, d]) => (c === "material") === (d === "promoted")).length;
  return { pairs: scored.length, agree, disagree: scored.length - agree, uncertain, rate: scored.length === 0 ? null : agree / scored.length };
};

const triageAgreementCmd = (flags: Flags): unknown => {
  const root = resolve(str(flags["project-root"]) ?? ".");
  const dir = join(root, ".skills", "supermodo", "ledger");
  const entries = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".jsonl"))
    .flatMap((f) => readFileSync(join(dir, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>)) : [];
  return triageAgreement(entries);
};

const applyPatchCmd = (flags: Flags): unknown => {
  const root = resolve(str(flags["project-root"]) ?? ".");
  const run = str(flags.run) ?? die("apply-patch: --run <id> required");
  const file = str(flags.patch) ?? die("apply-patch: --patch <patch.json> required");
  const patch = JSON.parse(readFileSync(resolve(file), "utf8")) as Patch;
  const shape = checkPatch(patch);
  if (shape.length > 0) return { status: "failed", cause: shape.join("; "), applied: [] };
  try {
    const journal = applyPatch(root, patch, run);
    appendFileSync(ledgerFile(root, run), `${JSON.stringify({ at: journal.at, run, event: "patch-applied", files: journal.post.map((p) => p.path) })}\n`);
    return { status: "ok", applied: journal.post.map((p) => p.path), journal };
  } catch (e) {
    return { status: "failed", cause: (e as Error).message, applied: [] };
  }
};

const revertPatchCmd = (flags: Flags): unknown => {
  const file = str(flags.journal) ?? die("revert-patch: --journal <journal.json> required");
  const journal = JSON.parse(readFileSync(resolve(file), "utf8")) as Journal;
  const r = revertPatch(journal);
  appendFileSync(ledgerFile(journal.root, journal.run), `${JSON.stringify({ at: new Date().toISOString(), run: journal.run, event: r.refused.length ? "patch-revert-refused" : "patch-reverted", ...r })}\n`);
  return { status: r.refused.length ? "failed" : "ok", ...r, ...(r.refused.length ? { cause: `edited since the patch: ${r.refused.join(", ")} — resolve by hand, then revert again` } : {}) };
};

const main = async (): Promise<number> => {
  const { cmd, flags } = parse(process.argv.slice(2));
  try {
    const out = cmd === "plan" ? plan(flags) : cmd === "dispatch" ? await dispatch(flags) : cmd === "ledger" ? ledger(flags)
      : cmd === "disposition" ? disposition(flags) : cmd === "triage-agreement" ? triageAgreementCmd(flags)
      : cmd === "apply-patch" ? applyPatchCmd(flags) : cmd === "revert-patch" ? revertPatchCmd(flags)
      : die("usage: broker.ts plan | dispatch | ledger | disposition | triage-agreement | apply-patch | revert-patch");
    console.log(JSON.stringify(out, null, 2));
    return 0;
  } catch (e) {
    console.error(`broker: ${(e as Error).message}`);
    return 1;
  }
};

if (basename(process.argv[1] ?? "") === "broker.ts") process.exit(await main());
