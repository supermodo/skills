// The house style, isolated so it is the only thing to touch when the look
// changes. Everything else in page.ts refers to these tokens and never to a
// literal colour, font or radius.
//
// LIGHT IS THE DEFAULT — deliberately, not by system preference. Dark is an
// option the reader turns on with the header toggle; the choice is remembered
// per browser. A report opened by someone else looks the way it was designed
// to look, whatever their OS is set to.
//
// The markers below delimit the block; keep them, they let a page be
// re-skinned without re-rendering.

export const THEME = `
/*theme*/
:root{
--bg:#fbfaf7;--fg:#23201c;--dim:#7a736a;--line:#e6e1d8;--card:#f3f0ea;
--ok:#3f7d3f;--warn:#a8701a;--bad:#b03a2e;--accent:#8a4b2a;--code:#f1ede5;
--font:"Iowan Old Style",Palatino,"Palatino Linotype",Georgia,serif;
--ui:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
--r:4px;--rs:3px;--page:1180px;--gutter:16px}
:root[data-theme="dark"]{
--bg:#181613;--fg:#e8e2d6;--dim:#98918a;--line:#2e2a25;--card:#211e1a;
--ok:#78b56f;--warn:#d2a04a;--bad:#e0705f;--accent:#d98b5a;--code:#211e1a}
/*/theme*/
`.trim();
