// Shared JSONC reader for every human-authored config this package READS.
//
// `deno.jsonc` and `tsconfig.json` are JSONC by definition, and a project is
// not going to strip the comments out of the file that holds its version
// because a release preflight cannot parse them. Strict `JSON.parse` on a
// foreign version file turns a normal project into "cannot read version".
//
// Comments and trailing commas are BLANKED TO SPACES (newlines kept), never
// deleted: every byte offset and line number survives the strip, so a
// `JSON.parse` error still names the position it occupies in the original
// file. A parser that reported positions in a rewritten string would send the
// user to the wrong line of their own config.
//
// This never RELAXES what a config may contain — comments are the only thing
// added, and every reader of a given file uses this one function, so a file
// that one supermodo script accepts is a file all of them accept.

const blank = (s: string): string => s.replace(/[^\n]/g, " ");

// The string literal is the FIRST alternative in both passes: `//` and `,`
// inside a string are data, not syntax, and `"https://x"` must survive. `\n`
// is excluded from the literal so an unterminated quote cannot swallow the
// rest of the file — it fails as a parse error at its own line instead.
const STRING = /"(?:[^"\\\n]|\\.)*"/.source;
const LINE = /\/\/[^\n]*/.source;
const BLOCK = /\/\*[\s\S]*?\*\//.source;

const COMMENTS = new RegExp(`${STRING}|${LINE}|${BLOCK}`, "g");
const TRAILING = new RegExp(`${STRING}|,(?=\\s*[}\\]])`, "g");

const keep = (m: string): boolean => m.startsWith('"');

export const stripJsonc = (src: string): string =>
  src
    // A BOM is whitespace to every editor and a syntax error to JSON.parse.
    .replace(/^﻿/, " ")
    .replace(COMMENTS, (m) => (keep(m) ? m : blank(m)))
    .replace(TRAILING, (m) => (keep(m) ? m : " "));

export const parseJsonc = (src: string): unknown => JSON.parse(stripJsonc(src));
