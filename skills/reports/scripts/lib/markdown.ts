// Markdown subset → HTML. Covers what supermodo reports actually contain:
// headings, lists, fenced code, tables, blockquotes, rules, links, inline
// emphasis and code. Anything outside the subset survives as literal text.
// Source HTML is ALWAYS escaped — report prose is data, never markup.

import { esc } from "./html.ts";
import { renderBlock } from "./blocks.ts";

type Block =
  | { readonly t: "code"; readonly info: string; readonly lines: readonly string[] }
  | { readonly t: "heading"; readonly level: number; readonly text: string }
  | { readonly t: "quote"; readonly lines: readonly string[] }
  | { readonly t: "list"; readonly ordered: boolean; readonly lines: readonly string[] }
  | { readonly t: "table"; readonly lines: readonly string[] }
  | { readonly t: "hr" }
  | { readonly t: "para"; readonly lines: readonly string[] };

type Acc = { readonly done: readonly Block[]; readonly open: Block | undefined; readonly fence: string | undefined };

const push = (acc: Acc, b: Block | undefined): Acc => ({
  done: acc.open === undefined ? acc.done : [...acc.done, acc.open],
  open: b,
  fence: undefined,
});

const extend = (acc: Acc, t: Block["t"], line: string, ordered = false): Acc =>
  acc.open !== undefined && acc.open.t === t && "lines" in acc.open
    ? { ...acc, open: { ...acc.open, lines: [...acc.open.lines, line] } as Block }
    : push(acc, t === "list"
      ? { t: "list", ordered, lines: [line] }
      : ({ t, lines: [line] } as Block));

const FENCE_RE = /^(```+|~~~+)\s*(.*)$/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

const absorb = (acc: Acc, line: string): Acc => {
  if (acc.fence !== undefined) {
    const open = acc.open as { t: "code"; info: string; lines: readonly string[] };
    return line.trimEnd() === acc.fence || line.trimStart().startsWith(acc.fence)
      ? push(acc, undefined)
      : { ...acc, open: { ...open, lines: [...open.lines, line] } };
  }
  const fence = line.match(FENCE_RE);
  if (fence !== null) {
    return { ...push(acc, { t: "code", info: fence[2], lines: [] }), fence: fence[1] };
  }
  if (line.trim() === "") return push(acc, undefined);
  const heading = line.match(/^(#{1,6})\s+(.*)$/);
  if (heading !== null) return push(acc, { t: "heading", level: heading[1].length, text: heading[2] });
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return push(acc, { t: "hr" });
  if (/^>\s?/.test(line)) return extend(acc, "quote", line.replace(/^>\s?/, ""));
  const item = line.match(LIST_RE);
  if (item !== null) return extend(acc, "list", line, /\d/.test(item[2]));
  if (/^\s*\|/.test(line)) return extend(acc, "table", line.trim());
  return extend(acc, "para", line);
};

// ── inline ──────────────────────────────────────────────────────────────────

const SAFE_URL = /^(https?:\/\/|mailto:|file:\/\/|#|\.{0,2}\/|[A-Za-z0-9._-]+(\/|\.[a-z]))/;

const emphasize = (s: string): string =>
  s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text: string, url: string) =>
      SAFE_URL.test(url) ? `<a href="${url}">${text}</a>` : m)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");

/** Inline markdown on an ALREADY-ESCAPED string. */
export const inline = (escaped: string): string =>
  escaped
    .split(/(`[^`]+`)/g)
    .map((part) =>
      part.length > 1 && part.startsWith("`") && part.endsWith("`")
        ? `<code>${part.slice(1, -1)}</code>`
        : emphasize(part))
    .join("");

const text = (s: string): string => inline(esc(s));

// ── block rendering ─────────────────────────────────────────────────────────

type Item = { readonly depth: number; readonly text: string };

const items = (lines: readonly string[]): readonly Item[] =>
  lines.flatMap((l) => {
    const m = l.match(LIST_RE);
    return m === null ? [] : [{ depth: Math.floor(m[1].length / 2), text: m[3] }];
  });

const renderItems = (list: readonly Item[], depth: number, ordered: boolean): string => {
  const tag = ordered ? "ol" : "ul";
  const render = (rest: readonly Item[], out: readonly string[]): string => {
    if (rest.length === 0) return `<${tag}>${out.join("")}</${tag}>`;
    const [head, ...tail] = rest;
    if (head.depth < depth) return `<${tag}>${out.join("")}</${tag}>`;
    if (head.depth > depth) {
      const nested = tail.findIndex((i) => i.depth <= depth);
      const inner = nested < 0 ? rest : rest.slice(0, nested + 1);
      const after = nested < 0 ? [] : rest.slice(nested + 1);
      return render(after, [...out.slice(0, -1), `${out.at(-1) ?? ""}${renderItems(inner, depth + 1, ordered)}`]);
    }
    return render(tail, [...out, `<li>${text(head.text)}</li>`]);
  };
  return render(list, []);
};

const cells = (row: string): readonly string[] =>
  row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

const isDivider = (row: string): boolean => /^\|?[\s:|-]+\|?$/.test(row) && row.includes("-");

const renderTable = (lines: readonly string[]): string => {
  const rows = lines.filter((l) => !isDivider(l)).map(cells);
  if (rows.length === 0) return "";
  const [head, ...body] = rows;
  return (
    `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${text(c)}</th>`).join("")}</tr></thead>` +
    `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${text(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
  );
};

const renderCode = (info: string, lines: readonly string[]): string => {
  const source = lines.join("\n");
  const visual = renderBlock(info, source);
  if (visual !== undefined) return visual;
  const lang = info.trim().split(/\s+/)[0];
  const cls = /^[A-Za-z0-9+#._-]+$/.test(lang) ? ` class="lang-${esc(lang)}"` : "";
  return `<pre><code${cls}>${esc(source)}</code></pre>`;
};

const renderBlockHtml = (b: Block): string => {
  if (b.t === "code") return renderCode(b.info, b.lines);
  if (b.t === "heading") return `<h${b.level + 2}>${text(b.text)}</h${b.level + 2}>`;
  if (b.t === "hr") return "<hr>";
  if (b.t === "quote") return `<blockquote>${b.lines.map((l) => `<p>${text(l)}</p>`).join("")}</blockquote>`;
  if (b.t === "table") return renderTable(b.lines);
  if (b.t === "list") return renderItems(items(b.lines), 0, b.ordered);
  return `<p>${b.lines.map(text).join("<br>")}</p>`;
};

/** Render a markdown body. Total: never throws, never emits unescaped input. */
export const markdown = (md: string): string => {
  const acc = md.split("\n").reduce<Acc>(absorb, { done: [], open: undefined, fence: undefined });
  return [...acc.done, ...(acc.open === undefined ? [] : [acc.open])].map(renderBlockHtml).join("\n");
};
