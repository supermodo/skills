// Inline markdown on already-escaped text. Its own module because both the
// block renderer (task titles) and the markdown renderer need it, and
// markdown.ts already imports blocks.ts.

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
