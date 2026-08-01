// Visual blocks → inline SVG / CSS, no external assets.
// Grammar: ../../protocols/references/reports.md ("Visual blocks").
// Every function here is total: malformed input renders as its own source
// with a warning badge, never an exception and never a blank page.

import { esc } from "./html.ts";

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

const bchip = (text: string, cls = ""): string =>
  `<span class="bchip ${cls}">${esc(text)}</span>`;

// The four task states of the docs convention, and nothing invented beyond
// them: ` ` pending, `/` in-progress, `x`/`X` done, `^`/`-` paused.
// Aliases are accepted because `next` may name them either way; an unknown
// state is SHOWN as unknown rather than quietly rendered as pending.
const TASK_STATE: Readonly<Record<string, readonly [string, string]>> = {
  pending: ["pending", "·"],
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
  return `<li class="task t-${cls}"${known === undefined ? ` title="unrecognised state: ${esc(state)}"` : ""}>` +
    `<span class="tmark">${glyph}</span>` +
    `<span class="tid">${esc(asStr(t.id))}</span>` +
    `<span class="ttitle">${esc(asStr(t.title))}</span>` +
    (known === undefined ? `<span class="bchip hard">${esc(state)}?</span>` : "") +
    `</li>`;
};

const progress = (p: Json): string => {
  if (!isObj(p)) return "";
  const total = asNum(p.total, 0), done = asNum(p.done, 0);
  if (total === 0) return "";
  return `<span class="prog"><span class="prog-bar">` +
    `<span class="prog-fill" style="width:${Math.round((done / total) * 100)}%"></span></span>` +
    `<span class="prog-n">${done}/${total}</span></span>`;
};

const boardItem = (it: Obj): string => {
  const blocked = asArr(it.blocked).filter((b): b is string => typeof b === "string");
  const unblocks = asNum(it.unblocks, 0);
  const tasks = asArr(it.tasks).filter(isObj);
  const state = asStr(it.state);
  const dot = state === "in progress" ? "running" : state === "paused" ? "skipped" : "ok";
  return `<details class="bitem-row"><summary>` +
    `<span class="dot ${dot}"></span>` +
    `<span class="bitem">${esc(asStr(it.item))}</span>` +
    `<span class="bstate">${esc(state)}</span>` +
    bchip(`effort ${asStr(it.effort, "?")}`) +
    (blocked.length > 0 ? bchip(`blocked by ${blocked.join(", ")}`, "hard") : "") +
    (unblocks > 0 ? bchip(`unblocks ${unblocks}`) : "") +
    (it.triage === true ? bchip("needs triage", "hard") : "") +
    progress(it.progress) +
    `<span class="chev" aria-hidden="true">▸</span>` +
    `</summary><div class="bitem-body">` +
    `<p class="bdesc">${esc(asStr(it.description))}</p>` +
    `<p class="bmeta">${esc(asStr(it.note))}${asStr(it.created) === "" ? "" : ` · created ${esc(asStr(it.created))}`}</p>` +
    (tasks.length === 0 ? "" : `<ul class="tasks">${tasks.map(task).join("")}</ul>`) +
    `</div></details>`;
};

const boardGroup = (g: Obj): string => {
  const items = asArr(g.items).filter(isObj);
  const pri = asStr(g.priority);
  return `<section class="bgroup">` +
    `<header><span class="bpri ${esc(pri.toLowerCase())}">${esc(pri)}</span>` +
    `<span class="blabel">${esc(asStr(g.label))}</span>` +
    `<span class="bcount">${items.length}</span></header>` +
    items.map(boardItem).join("") +
    `</section>`;
};

const suggestion = (sg: Obj, i: number): string =>
  `<li class="sugg">` +
  `<div class="sugg-top"><span class="rank">${i + 1}</span>` +
  `<span class="bitem">${esc(asStr(sg.item))}</span>` +
  `<span class="bpri ${esc(asStr(sg.priority).toLowerCase())}">${esc(asStr(sg.priority))}</span>` +
  `<span class="kind">${esc(asStr(sg.kind))}</span></div>` +
  `<p class="why">${esc(asStr(sg.why))}</p>` +
  `<pre class="cmd"><code>${esc(asStr(sg.command))}</code></pre>` +
  `</li>`;

const bullets = (heading: string, items: readonly string[]): string =>
  items.length === 0 ? "" :
    `<div class="bwait"><h4>${esc(heading)}</h4><ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`;

const board = (data: Obj): string => {
  const suggestions = asArr(data.suggestions).filter(isObj);
  const groups = asArr(data.groups).filter(isObj);
  const waiting = asArr(data.waiting).filter(isObj)
    .map((w) => `${asStr(w.item)} — ${asStr(w.why)}`);
  const repairs = asArr(data.repairs).filter((r): r is string => typeof r === "string");
  if (suggestions.length === 0 && groups.length === 0) return "";
  return `<div class="board">` +
    (suggestions.length === 0 ? "" :
      `<div class="bsection"><h3 class="bhead">Do next</h3>` +
      `<ol class="suggs">${suggestions.map(suggestion).join("")}</ol></div>`) +
    (groups.length === 0 ? "" :
      `<div class="bsection"><h3 class="bhead">Everything open <span class="hint">· click a row for detail</span></h3>` +
      groups.map(boardGroup).join("") + `</div>`) +
    (waiting.length + repairs.length === 0 ? "" :
      `<div class="bsection quiet"><h3 class="bhead">Waiting on you</h3>` +
      bullets("Needs triage", waiting) + bullets("Convention repairs", repairs) +
      `</div>`) +
    `<p class="bstamp">Snapshot from <code>${esc(asStr(data.source))}</code> ` +
    `at ${esc(asStr(data.generated))} — re-run <code>/supermodo:next</code> to refresh.</p>` +
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
