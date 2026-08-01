// YAML-subset frontmatter parser for supermodo reports.
// Handles exactly what ../../protocols/references/reports.md specifies:
// `key: scalar` and `key:` followed by indented `- item` lines. Anything
// else is kept as a raw scalar — this parser never throws.

export type FmValue = string | readonly string[];
export type Fm = Readonly<Record<string, FmValue>>;
export type Parsed = { readonly fm: Fm; readonly body: string; readonly hadFm: boolean };

const unquote = (s: string): string =>
  /^"(.*)"$/.test(s) || /^'(.*)'$/.test(s) ? s.slice(1, -1) : s;

type Acc = { readonly fm: Record<string, FmValue>; readonly key: string | undefined };

const absorb = (acc: Acc, line: string): Acc => {
  const item = line.match(/^\s+-\s*(.*)$/);
  if (item !== null && acc.key !== undefined) {
    const prev = acc.fm[acc.key];
    const list = Array.isArray(prev) ? prev : [];
    return { fm: { ...acc.fm, [acc.key]: [...list, unquote(item[1].trim())] }, key: acc.key };
  }
  const entry = line.match(/^([A-Za-z_][\w-]*):\s*(.*?)\s*$/);
  if (entry === null) return acc;
  const [, key, rawValue] = entry;
  const value = rawValue.replace(/\s+#.*$/, "").trim();
  return value === ""
    ? { fm: { ...acc.fm, [key]: [] }, key }
    : { fm: { ...acc.fm, [key]: unquote(value) }, key: undefined };
};

/** Split a report into frontmatter and markdown body. Never throws. */
export const parseFrontmatter = (text: string): Parsed => {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return { fm: {}, body: text, hadFm: false };
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (close < 0) return { fm: {}, body: text, hadFm: false };
  const fm = lines.slice(1, close).reduce<Acc>(absorb, { fm: {}, key: undefined }).fm;
  return { fm, body: lines.slice(close + 1).join("\n"), hadFm: true };
};

/** A frontmatter field as a string ("" when absent or a list). */
export const str = (fm: Fm, key: string): string => {
  const v = fm[key];
  return typeof v === "string" ? v : "";
};

/** A frontmatter field as a list (empty when absent or a scalar). */
export const list = (fm: Fm, key: string): readonly string[] => {
  const v = fm[key];
  return Array.isArray(v) ? v : [];
};
