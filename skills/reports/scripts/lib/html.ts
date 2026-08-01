// Escaping helpers. Report content is DATA: every string that reaches the
// page goes through esc(), so a report can never inject markup or script.

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** A value safe to place inside an HTML attribute. */
export const attr = (s: string): string => esc(s);

/** Collapse anything to a slug usable as an id / css class. */
export const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
