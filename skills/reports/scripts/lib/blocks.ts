// Visual blocks → inline SVG / CSS, no external assets.
// Grammar: ../../protocols/references/reports.md ("Visual blocks").
// Every function here is total: malformed input renders as its own source
// with a warning badge, never an exception and never a blank page.

import { esc } from "./html.ts";
import { inline } from "./inline.ts";

type Json = unknown;
type Obj = Record<string, Json>;

const isObj = (v: Json): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const asStr = (v: Json, fallback = ""): string => (typeof v === "string" ? v : fallback);
const asNum = (v: Json, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const asArr = (v: Json): readonly Json[] => (Array.isArray(v) ? v : []);

const STATES = ["ok", "warn", "bad"] as const;
const stateClass = (v: Json): string =>
  STATES.includes(asStr(v) as typeof STATES[number]) ? ` s-${asStr(v)}` : "";

const raw = (info: string, source: string, why: string): string =>
  `<div class="blk blk-raw"><div class="blk-warn">${esc(why)}</div>` +
  `<pre><code>${esc(source)}</code></pre>` +
  `<div class="blk-info">${esc(info)}</div></div>`;

const title = (v: Json): string =>
  asStr(v) === "" ? "" : `<div class="blk-title">${esc(asStr(v))}</div>`;

// ── bars ────────────────────────────────────────────────────────────────────

const bars = (data: Obj): string => {
  const series = asArr(data.series).filter(isObj);
  if (series.length === 0) return "";
  const unit = asStr(data.unit);
  const ceiling = Math.max(
    ...series.map((s) => Math.max(asNum(s.max, 0), asNum(s.value, 0))),
    1,
  );
  const row = (s: Obj, i: number): string => {
    const value = asNum(s.value);
    const w = Math.max(0, Math.min(1, value / ceiling)) * 396;
    const y = i * 26;
    return (
      `<text class="blk-label" x="0" y="${y + 15}">${esc(asStr(s.label))}</text>` +
      `<rect class="blk-track" x="200" y="${y + 4}" width="396" height="14" rx="7"/>` +
      `<rect class="blk-bar${stateClass(s.state)}" x="200" y="${y + 4}" width="${w.toFixed(1)}" height="14" rx="7"/>` +
      `<text class="blk-value" x="640" y="${y + 15}">${esc(String(value))}${esc(unit)}</text>`
    );
  };
  const h = series.length * 26;
  return (
    `<div class="blk">${title(data.title)}` +
    `<svg class="blk-svg" viewBox="0 0 640 ${h}" role="img">` +
    series.map(row).join("") +
    `</svg></div>`
  );
};

// ── tree ────────────────────────────────────────────────────────────────────

const node = (n: Json): string => {
  if (!isObj(n)) return "";
  const meta = asStr(n.meta) === "" ? "" : `<span class="tree-meta">${esc(asStr(n.meta))}</span>`;
  const kids = asArr(n.children);
  return (
    `<li><span class="tree-node${stateClass(n.state)}">${esc(asStr(n.label))}</span>${meta}` +
    (kids.length === 0 ? "" : `<ul>${kids.map(node).join("")}</ul>`) +
    `</li>`
  );
};

const tree = (data: Obj): string =>
  !isObj(data.root) ? "" : `<div class="blk">${title(data.title)}<ul class="tree">${node(data.root)}</ul></div>`;

// ── graph ───────────────────────────────────────────────────────────────────

type Edge = { readonly from: string; readonly to: string; readonly kind: string };

const layersOf = (ids: readonly string[], edges: readonly Edge[]): Readonly<Record<string, number>> => {
  const forward = edges.filter((e) => e.kind !== "cycle");
  const relax = (cur: Readonly<Record<string, number>>, rounds: number): Readonly<Record<string, number>> => {
    const next = forward.reduce<Record<string, number>>(
      (acc, e) =>
        acc[e.from] === undefined || acc[e.to] === undefined
          ? acc
          : { ...acc, [e.to]: Math.max(acc[e.to], acc[e.from] + 1) },
      { ...cur },
    );
    return rounds <= 0 || ids.every((id) => next[id] === cur[id]) ? next : relax(next, rounds - 1);
  };
  return relax(Object.fromEntries(ids.map((id) => [id, 0])), ids.length);
};

const BOX_W = 150, BOX_H = 30, COL = 220, ROW = 46;

const graph = (data: Obj): string => {
  const nodes = asArr(data.nodes).filter(isObj)
    .map((n) => ({ id: asStr(n.id), label: asStr(n.label, asStr(n.id)), kind: asStr(n.kind) }))
    .filter((n) => n.id !== "");
  if (nodes.length === 0) return "";
  const known = new Set(nodes.map((n) => n.id));
  const edges: readonly Edge[] = asArr(data.edges).filter(isObj)
    .map((e) => ({ from: asStr(e.from), to: asStr(e.to), kind: asStr(e.kind) }))
    .filter((e) => known.has(e.from) && known.has(e.to));

  const layer = layersOf(nodes.map((n) => n.id), edges);
  const columns = nodes.reduce<Record<number, readonly string[]>>(
    (acc, n) => ({ ...acc, [layer[n.id]]: [...(acc[layer[n.id]] ?? []), n.id] }),
    {},
  );
  const pos = Object.entries(columns).reduce<Record<string, { x: number; y: number }>>(
    (acc, [col, ids]) =>
      ids.reduce((a, id, i) => ({ ...a, [id]: { x: Number(col) * COL, y: i * ROW } }), acc),
    {},
  );
  const width = (Math.max(...Object.values(layer)) + 1) * COL - (COL - BOX_W);
  const height = Math.max(...Object.values(columns).map((c) => c.length)) * ROW - (ROW - BOX_H);

  const edgePath = (e: Edge): string => {
    const a = pos[e.from], b = pos[e.to];
    const x1 = a.x + BOX_W, y1 = a.y + BOX_H / 2, x2 = b.x, y2 = b.y + BOX_H / 2;
    return `<path class="g-edge${e.kind === "cycle" ? " s-bad" : ""}" d="M${x1} ${y1} C${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}"/>`;
  };
  const box = (n: { id: string; label: string; kind: string }): string => {
    const p = pos[n.id];
    return (
      `<rect class="g-box${stateClass(n.kind)}" x="${p.x}" y="${p.y}" width="${BOX_W}" height="${BOX_H}" rx="5"/>` +
      `<text class="g-text" x="${p.x + BOX_W / 2}" y="${p.y + BOX_H / 2 + 4}">${esc(n.label)}</text>`
    );
  };

  return (
    `<div class="blk">${title(data.title)}` +
    `<svg class="blk-svg" viewBox="-2 -2 ${width + 4} ${height + 4}" role="img">` +
    edges.map(edgePath).join("") + nodes.map(box).join("") +
    `</svg></div>`
  );
};


// ── board ───────────────────────────────────────────────────────────────────
// The worklist board as computed by `next`. The renderer only DRAWS it — the
// ordering, priorities and suggestions are decided by the worklist master and
// arrive here already resolved.
//
// Colour discipline: --ok/--warn/--bad mean STATUS and nothing else, and
// --accent means "you can interact with this". Priority, effort and structure
// are carried by weight, fill and position — never by borrowing a status hue.
//
// TOLERANT BUT LOUD: common shape mistakes are accepted (`id` for `item`, a
// "3/5" string for `progress`, a bare string for `blocked`), because half a
// board beats none. Anything that cannot be salvaged is REPORTED on the page
// instead of silently dropped — a board that quietly loses its task lists is
// worse than one that says it did.

const bchip = (text: string, cls = ""): string =>
  `<span class="bchip ${cls}">${esc(text)}</span>`;

// The four task states of the docs convention, and nothing invented beyond
// them: ` ` pending, `/` in-progress, `x`/`X` done, `^`/`-` paused.
const TASK_STATE: Readonly<Record<string, readonly [string, string]>> = {
  pending: ["pending", "·"],
  "not-started": ["pending", "·"],
  todo: ["pending", "·"],
  "in-progress": ["doing", "▸"],
  doing: ["doing", "▸"],
  wip: ["doing", "▸"],
  done: ["done", "✓"],
  paused: ["paused", "❙❙"],
};

const task = (t: Json): string => {
  if (!isObj(t)) return "";
  const state = asStr(t.state, "pending");
  const known = TASK_STATE[state];
  const [cls, glyph] = known ?? ["unknown", "?"];
  const id = asStr(t.id);
  return `<li class="task t-${cls}"${known === undefined ? ` title="unrecognised state: ${esc(state)}"` : ""}>` +
    `<span class="tmark">${glyph}</span>` +
    `<span class="ttitle">${inline(esc(asStr(t.title, asStr(t.text))))}</span>` +
    (id === "" ? "" : `<span class="tid">${esc(id)}</span>`) +
    (known === undefined ? `<span class="bchip hard">${esc(state)}?</span>` : "") +
    `</li>`;
};

/** `{done,total}`, or a "3/5" / "3/5 done" string. */
const progressOf = (p: Json): { readonly done: number; readonly total: number } | undefined => {
  if (isObj(p)) {
    const total = asNum(p.total, 0);
    return total > 0 ? { done: asNum(p.done, 0), total } : undefined;
  }
  const m = asStr(p).match(/(\d+)\s*\/\s*(\d+)/);
  return m === null || Number(m[2]) === 0 ? undefined : { done: Number(m[1]), total: Number(m[2]) };
};

const progressBar = (p: Json): string => {
  const v = progressOf(p);
  if (v === undefined) return "";
  return `<span class="prog"><span class="prog-bar">` +
    `<span class="prog-fill" style="width:${Math.round((v.done / v.total) * 100)}%"></span></span>` +
    `<span class="prog-n">${v.done}/${v.total}</span></span>`;
};

/** An effort band is short ("M", "XL", "?"); anything longer is evidence. */
const effortOf = (v: Json): { readonly band: string; readonly evidence: string } => {
  const raw = asStr(v, "?").trim();
  const m = raw.match(/^([SMLX?]+|XL|XXL)\b\s*[—–-]?\s*(.*)$/i);
  return m === null
    ? { band: raw.length <= 3 ? raw : "?", evidence: raw.length <= 3 ? "" : raw }
    : { band: m[1].toUpperCase(), evidence: m[2] };
};

/** Chips must stay one short line: strip the kind prefix, cap the rest. */
const short = (names: readonly string[]): string => {
  const first = names[0].replace(/^(work|backlog):/, "");
  const head = first.length > 22 ? `${first.slice(0, 21)}…` : first;
  return names.length === 1 ? head : `${head} +${names.length - 1}`;
};

const listOf = (v: Json): readonly string[] =>
  typeof v === "string" && v.trim() !== "" ? [v]
    : asArr(v).filter((x): x is string => typeof x === "string");

/** States that say nothing a reader needs: their absence is the message. */
const SILENT_STATE = new Set(["not-started", "not started", "pending", "backlog", "—", ""]);

const DOT: Readonly<Record<string, string>> = {
  "in progress": "running", "in-progress": "running", doing: "running",
  paused: "skipped", "not-started": "idle", pending: "idle", backlog: "idle",
  "dependency-blocked": "blocked", blocked: "blocked",
  ready: "ok", "not started": "idle",
};

// Seventy tasks in one list is unreadable not because of the number but
// because nothing groups them. Split by state, in the order they would be
// worked, each band labelled and counted; finished work folds away.
const BANDS: readonly (readonly [string, string])[] = [
  ["doing", "In progress"],
  ["pending", "To do"],
  ["unknown", "Unrecognised state"],
  ["paused", "Paused"],
];

const bandOf = (t: Json): string =>
  (TASK_STATE[isObj(t) ? asStr(t.state, "pending") : "pending"] ?? ["unknown"])[0];

const band = (label: string, tasks: readonly Json[]): string =>
  tasks.length === 0 ? "" :
    `<div class="tband"><div class="tbh">${esc(label)}<span class="tbn">${tasks.length}</span></div>` +
    `<ul class="tasks">${tasks.map(task).join("")}</ul></div>`;

// A tasks.md that groups its checklist under headings is telling you how the
// work decomposes — throwing that away and re-sorting by state loses the
// author's structure. When tasks carry a `group`, groups win: file order
// inside, a done/total count on each, and only the groups with work in
// progress start open.
const groupsOf = (tasks: readonly Json[]): readonly string[] =>
  tasks.reduce<readonly string[]>((acc, t) => {
    const g = isObj(t) ? asStr(t.group) : "";
    return g === "" || acc.includes(g) ? acc : [...acc, g];
  }, []);

const taskGroup = (name: string, tasks: readonly Json[]): string => {
  const done = tasks.filter((t) => bandOf(t) === "done").length;
  const active = tasks.some((t) => bandOf(t) === "doing");
  return `<details class="tband tgroup"${active ? " open" : ""}>` +
    `<summary><span class="caret" aria-hidden="true">▸</span>` +
    `<span class="tbname">${esc(name)}</span>` +
    `<span class="tbn">${done}/${tasks.length}</span></summary>` +
    `<ul class="tasks">${tasks.map(task).join("")}</ul></details>`;
};

const taskList = (tasks: readonly Json[]): string => {
  const groups = groupsOf(tasks);
  if (groups.length > 0) {
    const ungrouped = tasks.filter((t) => !isObj(t) || asStr(t.group) === "");
    return `<div class="tasklist">` +
      groups.map((g) => taskGroup(g, tasks.filter((t) => isObj(t) && asStr(t.group) === g))).join("") +
      (ungrouped.length === 0 ? "" : taskGroup("Ungrouped", ungrouped)) +
      `</div>`;
  }
  const done = tasks.filter((t) => bandOf(t) === "done");
  return `<div class="tasklist">` +
    BANDS.map(([key, label]) => band(label, tasks.filter((t) => bandOf(t) === key))).join("") +
    (done.length === 0 ? "" :
      `<details class="donefold"><summary><span class="caret" aria-hidden="true">▸</span>Done<span class="tbn">${done.length}</span></summary>` +
      `<ul class="tasks">${done.map(task).join("")}</ul></details>`) +
    `</div>`;
};

const boardItem = (it: Obj): string => {
  const name = asStr(it.item, asStr(it.id));
  const blocked = listOf(it.blocked);
  const unblocksNames = listOf(it.unblocks);
  const unblocksCount = unblocksNames.length > 0 ? unblocksNames.length : asNum(it.unblocks, 0);
  const tasks = asArr(it.tasks).filter(isObj);
  const state = asStr(it.state, "—");
  const effort = effortOf(it.effort);
  const note = asStr(it.note);
  const created = asStr(it.created);
  const desc = asStr(it.description);
  const command = asStr(it.command);
  const isBacklog = /^backlog:/.test(name);
  const modified = asStr(it.modified);
  const subtitle = [
    note,
    effort.evidence === "" ? "" : `effort ${effort.band} — ${effort.evidence}`,
    created === "" ? "" : `created ${created}`,
    modified === "" ? "" : `updated ${modified}`,
  ].filter((x) => x !== "").join(" · ");
  const detail = [desc].filter((x) => x !== "");
  return `<details class="bitem-row"><summary>` +
    `<span class="caret" aria-hidden="true">▸</span>` +
    `<span class="dot ${attrClass(DOT[state] ?? "idle")}"></span>` +
    identity(name) +
    (SILENT_STATE.has(state) ? "" : `<span class="bstate">${esc(state)}</span>`) +
    (effort.band === "?" ? "" : bchip(`effort ${effort.band}`)) +
    (blocked.length > 0 ? bchip(`blocked by ${short(blocked)}`, "hard") : "") +
    (unblocksNames.length > 0
      ? bchip(`unblocks ${short(unblocksNames)}`)
      : unblocksCount > 0 ? bchip(`unblocks ${unblocksCount} item${unblocksCount === 1 ? "" : "s"} (unnamed)`) : "") +
    (it.triage === true ? bchip("needs triage", "hard") : "") +
    progressBar(it.progress) +
    `</summary><div class="bitem-body">` +
    detail.map((d) => `<p class="bdesc">${esc(d)}</p>`).join("") +
    (subtitle === "" ? "" : `<p class="bsub">${esc(subtitle)}</p>`) +
    (tasks.length > 0
      ? taskList(tasks)
      : isBacklog
        ? `<p class="bmeta">Backlog entry — no triad yet, so no task list.</p>`
        : `<p class="bmeta warnish">No task list — a triad should have one.</p>`) +
    (command === ""
      ? ""
      : `<div class="doit"><span class="label">next action</span>` +
        `<pre class="cmd"><code>${esc(command)}</code></pre></div>`) +
    `</div></details>`;
};

const attrClass = (s: string): string => esc(s);

/** `work:csv-export` → dim kind, bold slug. A bare slug says neither. */
const identity = (name: string): string => {
  if (name === "") return `<span class="bitem missing">(item name missing)</span>`;
  const m = name.match(/^(work|backlog):(.+)$/);
  return m === null
    ? `<span class="bitem"><span class="kindless" title="no work:/backlog: prefix">${esc(name)}</span></span>`
    : `<span class="bitem"><span class="ikind">${esc(m[1])}:</span>${esc(m[2])}</span>`;
};

// Priority groups are the spine of the board: always open, never a disclosure.
const boardGroup = (g: Obj): string => {
  const items = asArr(g.items).filter(isObj);
  const pri = asStr(g.priority);
  const label = asStr(g.label);
  return `<section class="bgroup">` +
    `<header><span class="bpri ${esc(pri.toLowerCase())}">${esc(pri)}</span>` +
    (label === "" || label === pri ? "" : `<span class="blabel">${esc(label)}</span>`) +
    `<span class="bcount">${items.length}</span></header>` +
    items.map(boardItem).join("") +
    `</section>`;
};

const suggestion = (sg: Obj, i: number): string => {
  const item = asStr(sg.item, asStr(sg.id));
  if (item === "") return "";  // an empty slot is not advice; the shortlist omits it
  const command = asStr(sg.command);
  const priority = asStr(sg.priority);
  return `<li class="sugg">` +
    `<div class="sugg-top"><span class="rank">${i + 1}</span>` +
    identity(item) +
    (priority === "" ? "" : `<span class="bpri ${esc(priority.toLowerCase())}">${esc(priority)}</span>`) +
    `<span class="kind">${esc(asStr(sg.kind).replace(/-/g, " "))}</span></div>` +
    `<p class="why">${esc(asStr(sg.why))}</p>` +
    (command === "" ? "" : `<pre class="cmd"><code>${esc(command)}</code></pre>`) +
    `</li>`;
};

const bullets = (heading: string, items: readonly string[]): string =>
  items.length === 0 ? "" :
    `<div class="bwait"><h4>${esc(heading)}</h4><ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`;

/** Shape problems worth telling the reader about, rather than hiding. */
const boardComplaints = (groups: readonly Obj[]): readonly string[] => {
  const items = groups.flatMap((g) => asArr(g.items).filter(isObj));
  const noName = items.filter((it) => asStr(it.item, asStr(it.id)) === "").length;
  const usedId = items.filter((it) => asStr(it.item) === "" && asStr(it.id) !== "").length;
  const noTasks = items.filter((it) => asArr(it.tasks).length === 0).length;
  const noPrefix = items.filter((it) => !/^(work|backlog):/.test(asStr(it.item, asStr(it.id)))).length;
  const noCommand = items.filter((it) => asStr(it.command) === "").length;
  return [
    ...(noName > 0 ? [`${noName} item(s) have no "item" name`] : []),
    ...(noPrefix > 0 ? [`${noPrefix} item(s) lack the "work:" / "backlog:" prefix — the board cannot tell a triad from a backlog entry`] : []),
    ...(usedId > 0 ? [`${usedId} item(s) used "id" instead of "item" — read as the name`] : []),
    ...(noCommand > 0 ? [`${noCommand} item(s) carry no "command" — nothing to copy to start them`] : []),
    ...(noTasks === items.length && items.length > 0
      ? ['no item carries a "tasks" list — the accordions have nothing to open']
      : []),
  ];
};

const board = (data: Obj): string => {
  const suggestions = asArr(data.suggestions).filter(isObj);
  const groups = asArr(data.groups).filter(isObj);
  const waiting = asArr(data.waiting).filter(isObj)
    .map((w) => `${asStr(w.item, asStr(w.id))} — ${asStr(w.why)}`);
  const repairs = asArr(data.repairs).filter((r): r is string => typeof r === "string");
  if (suggestions.length === 0 && groups.length === 0) return "";
  const complaints = boardComplaints(groups);
  return `<div class="board">` +
    `<p class="bstamp top">Board as of ${esc(asStr(data.generated))} · from ` +
    `<code>${esc(asStr(data.source))}</code> — re-run <code>/supermodo:next</code> to refresh.</p>` +
    // A board the skill itself does not trust says so first, above its own
    // contents — an unreliable order presented silently is worse than none.
    (asStr(data.caveat) === "" ? "" :
      `<p class="bcaveat"><b>This order is not reliable.</b> ${inline(esc(asStr(data.caveat)))}</p>`) +
    (suggestions.length === 0 ? "" :
      `<div class="bsection"><h3 class="bhead">Do next</h3>` +
      `<ol class="suggs">${suggestions.map(suggestion).join("")}</ol></div>`) +
    (groups.length === 0 ? "" :
      `<div class="bsection"><h3 class="bhead">Everything open <span class="hint">· click a row for detail</span></h3>` +
      groups.map(boardGroup).join("") + `</div>`) +
    (waiting.length === 0 ? "" :
      `<div class="bsection quiet"><h3 class="bhead">Waiting on you</h3>` +
      bullets("Decisions owed", waiting) + `</div>`) +
    (repairs.length === 0 ? "" :
      `<div class="bsection quiet"><h3 class="bhead">Convention repairs</h3>` +
      bullets("For librarian to fix", repairs) + `</div>`) +
    (complaints.length === 0 ? "" :
      `<div class="blk-raw"><div class="blk-warn">Incomplete board data — re-run ` +
      `<code>/supermodo:next</code> after checking the block shape in reports.md</div>` +
      `<ul>${complaints.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`) +
    `</div>`;
};

// ── entry point ─────────────────────────────────────────────────────────────

const DRAWERS: Readonly<Record<string, (d: Obj) => string>> = { bars, tree, graph, board };

/**
 * Render one fenced block whose info string is `supermodo:<kind>` or
 * `mermaid`. Returns undefined when the info string is not a visual block.
 */
export const renderBlock = (info: string, source: string): string | undefined => {
  if (info.trim() === "mermaid") {
    // Escape hatch: rendered by the CDN import when online; the <pre> stays
    // visible (and is all that remains) when the import never arrives.
    return `<div class="blk"><pre class="mermaid">${esc(source)}</pre></div>`;
  }
  const kind = info.trim().match(/^supermodo:([a-z]+)$/)?.[1];
  if (kind === undefined) return undefined;
  const drawer = DRAWERS[kind];
  if (drawer === undefined) return raw(info, source, `unknown block type "${kind}"`);
  const parsed = ((): Json | undefined => {
    try { return JSON.parse(source) as Json; } catch { return undefined; }
  })();
  if (!isObj(parsed)) return raw(info, source, "block body is not a JSON object");
  const drawn = ((): string => {
    try { return drawer(parsed); } catch { return ""; }
  })();
  return drawn === "" ? raw(info, source, "block has no drawable content") : drawn;
};
