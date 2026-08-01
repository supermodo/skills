// Page assembly. Every page is fully self-contained: CSS and JS inlined, no
// shared assets, no external requests — except the optional Mermaid import,
// which is emitted only for pages that contain a mermaid block and degrades
// to the block's own source text when it fails.

import { esc, attr, slug } from "./html.ts";
import { THEME } from "./theme.ts";
import { markdown } from "./markdown.ts";
import { dateOf, timeOf, type Model, type Run, type Report, type Stage } from "./scan.ts";

const CSS = `
${THEME}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 var(--ui);padding-bottom:42px}
.chrome{position:sticky;top:0;z-index:8;background:var(--bg)}
a{color:var(--accent)}
code,pre{font-family:var(--mono);font-size:12.5px}
code{background:var(--code);padding:1px 4px;border-radius:var(--rs)}
pre{position:relative;background:var(--code);padding:10px 12px;border-radius:var(--r);overflow-x:auto}
.copy{position:absolute;top:5px;right:5px;z-index:1;background:var(--bg);color:var(--dim);
border:1px solid var(--line);border-radius:var(--rs);font:inherit;font-size:10.5px;
padding:2px 8px;cursor:pointer;opacity:0;transition:opacity .12s ease}
pre:hover .copy,.copy:focus{opacity:1}
.copy.done{color:var(--ok);border-color:var(--ok);opacity:1}
.bitem.missing{color:var(--bad);font-style:italic}
.sugg.empty{opacity:.7}
pre code{background:none;padding:0}
.hd{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;max-width:var(--page);margin:0 auto;padding:0 var(--gutter)}
header.top{border-bottom:1px solid var(--line)}
header.top .hd{padding-top:14px}
header.top h1{margin:0;padding-bottom:11px;font-size:17px;font-weight:600}
header.top h1 a{font-family:var(--font);color:var(--fg);text-decoration:none}
header.top h1 a:hover{color:var(--accent)}
.foot{position:fixed;left:0;right:0;bottom:0;z-index:8;background:var(--bg);
border-top:1px solid var(--line)}
.foot .hd{padding-top:12px;padding-bottom:12px;color:var(--dim);font-size:11px}
header.top .meta{color:var(--dim);font-size:12px;padding-bottom:11px}
.crumbs{position:relative;border-bottom:1px solid var(--line);background:var(--card)}
.crumbs .hd{align-items:baseline;padding-top:9px;padding-bottom:9px}
.crumbs .path{font-size:12.5px;color:var(--dim)}
.crumbs .path a{text-decoration:none}
.crumbs .path a:hover{text-decoration:underline}
.crumbs .title{font-family:var(--font);font-size:15px;font-weight:600}
.crumbs .meta{color:var(--dim);font-size:12px}
.spacer{flex:1}
.themer{background:none;border:1px solid var(--line);border-radius:var(--rs);color:var(--dim);
cursor:pointer;font:inherit;font-size:11px;padding:3px 9px;margin-bottom:9px}
.themer:hover{color:var(--fg)}
/* live: a breathing dot, and a bar that fills as the next refresh approaches */
.live{display:inline-flex;align-items:center;gap:6px;color:var(--warn);font-size:12px}
.live .pulse{width:8px;height:8px;border-radius:50%;background:var(--warn);animation:pulse 5s ease-out infinite}
@keyframes pulse{0%{transform:scale(1);box-shadow:0 0 0 0 var(--warn)}
14%{transform:scale(1.25);box-shadow:0 0 0 5px transparent}
30%,100%{transform:scale(1);box-shadow:0 0 0 0 transparent}}
/* freshly changed since the last load */
.fresh{animation:fresh 2.6s ease-out 1;margin-left:-12px;padding-left:12px;border-radius:var(--rs)}
@keyframes fresh{0%{background:var(--card);box-shadow:inset 2px 0 0 var(--accent)}
70%{background:var(--card);box-shadow:inset 2px 0 0 var(--accent)}
100%{background:transparent;box-shadow:inset 2px 0 0 transparent}}
.toast{position:fixed;right:18px;bottom:18px;z-index:10;display:flex;align-items:center;gap:8px;
background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:9px 13px;font-size:12.5px;
box-shadow:0 6px 20px rgba(0,0,0,.14);animation:toast .35s ease-out 1,toastout .6s ease 4s forwards}
.toast .pulse{width:8px;height:8px;border-radius:50%;background:var(--accent)}
@keyframes toast{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes toastout{to{opacity:0;transform:translateY(6px);visibility:hidden}}
@media(prefers-reduced-motion:reduce){.live .pulse,.fresh,.toast{animation:none}}
.tabs .pin [data-nav],.tabs .pin a{color:var(--accent);font-weight:600}
.tabs .pin [aria-current=true]{background:var(--accent);color:var(--bg);border-color:var(--accent)}
.tsep{width:1px;background:var(--line);margin:6px 10px 9px;align-self:stretch}
/* board — structure carried by weight and fill; status hues stay for status */
.board{max-width:100%}
.bsection{margin:0 0 34px}
.bsection.quiet{opacity:.8}
.bhead{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.09em;
color:var(--dim);margin:0 0 14px;padding-bottom:7px;border-bottom:1px solid var(--line)}
.bhead .hint{text-transform:none;letter-spacing:0;font-weight:400;opacity:.75}
.suggs{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.sugg{border:1px solid var(--line);border-radius:var(--r);padding:13px 15px;background:var(--card)}
.sugg-top{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.rank{width:19px;height:19px;border-radius:50%;background:var(--fg);color:var(--bg);
font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex:none}
.kind{margin-left:auto;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.why{margin:8px 0 10px;font-size:13.5px}
.cmd{margin:0;padding:7px 10px;font-size:12px}
.bitem{font-family:var(--mono);font-size:12.5px;font-weight:600}
.ikind{color:var(--dim);font-weight:400}
.kindless{border-bottom:1px dotted var(--warn)}
/* priority: a neutral ramp, darkest first — order without stealing a status colour */
.bpri{font-family:var(--mono);font-size:11px;font-weight:700;border-radius:var(--rs);
padding:1px 7px;border:1px solid var(--line);letter-spacing:.02em}
.bpri.p0,.bpri.p1{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.bpri.p2{background:var(--line);color:var(--fg)}
.bpri.p3{color:var(--dim)}
.bgroup{margin:0 0 20px}
.bgroup>header{display:flex;align-items:center;gap:9px;margin:0 0 2px}
.blabel{font-size:12.5px;color:var(--dim)}
.bcount{margin-left:auto;font-size:11px;color:var(--dim)}
/* rows: dense like a table, but each one opens */
.bitem-row{border-bottom:1px solid var(--line)}
.bitem-row>summary{display:flex;align-items:center;gap:9px;flex-wrap:wrap;
padding:9px 4px;cursor:pointer;list-style:none}
.bitem-row>summary::-webkit-details-marker{display:none}
.bitem-row>summary:hover{background:var(--card)}
.bstate{font-size:12px;color:var(--dim);min-width:74px}
.bchip{font-size:10.5px;color:var(--dim);border:1px solid var(--line);border-radius:10px;
padding:1px 8px;white-space:nowrap}
.bchip.hard{color:var(--fg);border-color:var(--dim)}
.chev{margin-left:auto;color:var(--dim);font-size:11px;transition:transform .15s ease}
.bitem-row[open]>summary .chev{transform:rotate(90deg)}
.prog{display:inline-flex;align-items:center;gap:6px}
.prog-bar{width:54px;height:4px;border-radius:2px;background:var(--line);overflow:hidden}
.prog-fill{display:block;height:100%;background:var(--dim)}
.prog-n{font-size:10.5px;color:var(--dim);font-family:var(--mono)}
.bitem-body{padding:2px 4px 14px 21px}
.bdesc{margin:0 0 6px;font-size:13.5px;max-width:62ch}
.bmeta{margin:0 0 10px;font-size:11.5px;color:var(--dim)}
.tasks{list-style:none;margin:0;padding:0;display:grid;gap:1px}
.task{display:flex;align-items:baseline;gap:9px;font-size:12.5px;padding:3px 0}
.tmark{width:13px;text-align:center;color:var(--dim);font-size:11px;flex:none}
.tid{font-family:var(--mono);font-size:11px;color:var(--dim);min-width:38px;flex:none}
.task.t-done .ttitle{color:var(--dim);text-decoration:line-through;text-decoration-thickness:1px}
.task.t-done .tmark{color:var(--ok)}
.task.t-doing .tmark{color:var(--warn)}
.task.t-doing .ttitle{font-weight:600}
.task.t-paused .tmark{color:var(--dim)}
.task.t-paused .ttitle{font-style:italic;color:var(--dim)}
.task.t-unknown .tmark{color:var(--bad)}
.bwait h4{margin:0 0 5px;font-size:12.5px}
.bwait ul{margin:0 0 12px;padding-left:18px;font-size:12.5px;color:var(--dim)}
.bstamp{color:var(--dim);font-size:11.5px;margin:0}
.chip{font-size:11px;padding:2px 9px;border-radius:11px;border:1px solid var(--line);color:var(--dim);white-space:nowrap}
.chip.ok{color:var(--ok);border-color:var(--ok)}
.chip.failed,.chip.unreadable{color:var(--bad);border-color:var(--bad)}
.chip.running,.chip.needs-input,.chip.partial{color:var(--warn);border-color:var(--warn)}
.wrap{display:flex;align-items:flex-start;gap:0;max-width:var(--page);margin:0 auto;padding:0 var(--gutter)}
.wrap.split{align-items:stretch}
nav.rail{position:sticky;top:var(--chrome-h,0px);align-self:flex-start;width:240px;flex:none;padding:16px 14px 40px 0;border-right:1px solid var(--line);max-height:calc(100vh - var(--chrome-h,0px) - 42px);overflow-y:auto}
nav.rail .grp{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);padding:12px 8px 4px}
nav.rail button{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:none;border:0;color:inherit;font:inherit;padding:6px 8px;border-radius:var(--rs);cursor:pointer}
nav.rail button:hover{background:var(--card)}
nav.rail button[aria-current=true]{background:var(--card);font-weight:600}
main{flex:1;min-width:0;padding:18px 0 60px}
.wrap:not(.split) main{max-width:860px;margin:0 auto}
.wrap.split main{padding-left:22px}
[data-panel]{display:none}
[data-panel].on{display:block}
main h2{font-family:var(--font);font-size:18px;font-weight:600;margin:0 0 4px}
main h3{font-family:var(--font);font-size:15px;font-weight:600;margin:18px 0 6px}
main h4,main h5{font-size:13px;margin:14px 0 4px}
.dot{width:9px;height:9px;border-radius:50%;background:var(--dim);flex:none}
.dot.ok{background:var(--ok)}.dot.failed,.dot.unreadable{background:var(--bad)}
.dot.running,.dot.needs-input,.dot.partial{background:var(--warn)}
.dot.skipped{background:var(--line)}
.dot.idle{background:var(--dim);opacity:.5}
.dot.blocked{background:transparent;border:2px solid var(--dim)}
.sub{color:var(--dim);font-size:12px;margin:0 0 14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:12px 14px;margin:0 0 14px}
.card h3{margin-top:0}
.card ul{margin:4px 0 0;padding-left:18px}
.tabs{display:flex;flex:1;justify-content:center;gap:2px;flex-wrap:wrap}
.tabs a{text-decoration:none}
.tabs button,.tabs a{background:none;color:var(--dim);font:inherit;font-size:12.5px;padding:7px 14px;cursor:pointer;
border:1px solid transparent;border-bottom:0;border-radius:var(--r) var(--r) 0 0;margin-bottom:-1px;display:inline-block}
.tabs [aria-current=true]{color:var(--fg);font-weight:600;border-color:var(--line);background:var(--card)}
.tabs .n{opacity:.6;margin-left:6px}
.list{width:42%;flex:none;border-right:1px solid var(--line);padding:10px 14px 40px 0}
.row{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:0;color:inherit;font:inherit;padding:7px 8px;border-radius:var(--rs);cursor:pointer}
.row:hover{background:var(--card)}
.row[aria-current=true]{background:var(--card)}
.row .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .ts{color:var(--dim);font-size:11px;white-space:nowrap}
.empty{color:var(--dim);padding:16px 8px}
table{border-collapse:collapse;width:100%;font-size:13px}
.table-wrap{overflow-x:auto;margin:0 0 12px}
th,td{border:1px solid var(--line);padding:5px 9px;text-align:left;vertical-align:top}
th{background:var(--card)}
blockquote{margin:0 0 12px;padding:2px 12px;border-left:3px solid var(--line);color:var(--dim)}
hr{border:0;border-top:1px solid var(--line);margin:18px 0}
.blk{margin:0 0 16px}
.blk-title{font-size:12px;color:var(--dim);margin-bottom:6px}
.blk-svg{width:100%;height:auto;overflow:visible}
.blk-label{font-size:12px;fill:var(--fg)}
.blk-value{font-size:12px;fill:var(--dim);text-anchor:end}
.blk-track{fill:var(--line)}
.blk-bar{fill:var(--accent)}
.blk-bar.s-ok{fill:var(--ok)}.blk-bar.s-warn{fill:var(--warn)}.blk-bar.s-bad{fill:var(--bad)}
.blk-raw{border:1px solid var(--warn);border-radius:var(--r);padding:8px 10px}
.blk-warn{color:var(--warn);font-size:11.5px;margin-bottom:6px}
.blk-info{color:var(--dim);font-size:11px;margin-top:4px}
ul.tree,ul.tree ul{list-style:none;margin:0;padding-left:16px}
ul.tree{padding-left:0}
ul.tree ul{border-left:1px solid var(--line);margin-left:6px}
ul.tree li{padding:2px 0}
.tree-node{font-size:13px}
.tree-node.s-ok{color:var(--ok)}.tree-node.s-warn{color:var(--warn)}.tree-node.s-bad{color:var(--bad)}
.tree-meta{color:var(--dim);font-size:11.5px;margin-left:8px}
.g-box{fill:var(--card);stroke:var(--line)}
.g-box.s-bad{stroke:var(--bad)}
.g-text{font-size:12px;fill:var(--fg);text-anchor:middle}
.g-edge{fill:none;stroke:var(--dim);stroke-width:1.4}
.g-edge.s-bad{stroke:var(--bad);stroke-dasharray:4 3}
@media(max-width:820px){.wrap{flex-direction:column}.wrap.split main{padding-left:0}
nav.rail,.list{position:static;width:100%;max-height:none;border-right:0;border-bottom:1px solid var(--line);padding-right:0}}
`.trim();

const JS = `
(function(){
  // copy-to-clipboard on every code block; execCommand fallback because the
  // async clipboard API is not available on file:// in every browser.
  function copyText(text,btn){
    function ok(){btn.textContent='copied';btn.classList.add('done');
      setTimeout(function(){btn.textContent='copy';btn.classList.remove('done');},1400);}
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(ok,function(){legacy();});
    } else {legacy();}
    function legacy(){
      var ta=document.createElement('textarea');
      ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
      document.body.appendChild(ta);ta.select();
      try{document.execCommand('copy');ok();}catch(e){}
      ta.remove();
    }
  }
  document.querySelectorAll('pre').forEach(function(pre){
    var btn=document.createElement('button');
    btn.className='copy';btn.type='button';btn.textContent='copy';
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      copyText((pre.querySelector('code')||pre).textContent,btn);
    });
    pre.appendChild(btn);
  });
  function measure(){
    var c=document.querySelector('.chrome');
    document.documentElement.style.setProperty('--chrome-h',(c?c.offsetHeight:0)+'px');
  }
  measure();
  window.addEventListener('resize',measure,{passive:true});
})();
(function(){
  var T='supermodo:theme';
  function paint(mode){
    document.documentElement.setAttribute('data-theme',mode);
    document.querySelectorAll('[data-theme-toggle]').forEach(function(b){
      b.textContent=mode==='dark'?'light':'dark';});
  }
  var saved='light';
  try{saved=localStorage.getItem(T)||'light';}catch(e){}
  paint(saved);
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-theme-toggle]');
    if(!b){return;}
    var next=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
    paint(next);
    try{localStorage.setItem(T,next);}catch(err){}
  });
})();
(function(){
  // A live run page reloads itself every 5s, so the open stage and the scroll
  // position are persisted per page and restored on load. sessionStorage is
  // the primary store because history.replaceState is not always permitted on
  // file:// — the hash is kept in sync too, but is never relied on alone.
  var KEY='supermodo:'+location.pathname;
  function save(targets){try{sessionStorage.setItem(KEY,JSON.stringify(
    {t:targets,y:window.scrollY}));}catch(e){}}
  function load(){try{return JSON.parse(sessionStorage.getItem(KEY))||{};}catch(e){return {};}}
  // Panel groups nest (index tabs contain per-tab reading panes), so every
  // query is filtered to the elements that belong to THIS group only.
  function mine(scope,el){return el.closest('[data-panels]')===scope;}
  function open(){
    return Array.prototype.map.call(
      document.querySelectorAll('[data-nav][aria-current=true]'),
      function(b){return b.getAttribute('data-target');});
  }
  function activate(btn,remember){
    var scope=btn.closest('[data-panels]'),target=btn.getAttribute('data-target');
    if(!scope){return;}
    scope.querySelectorAll('[data-nav]').forEach(function(b){
      if(mine(scope,b)){b.setAttribute('aria-current',String(b===btn));}});
    scope.querySelectorAll('[data-panel]').forEach(function(p){
      if(mine(scope,p)){p.classList.toggle('on',p.id===target);}});
    try{if(location.hash.slice(1)!==target){history.replaceState(null,'','#'+target);}}catch(e){}
    if(remember!==false){save(open());}
  }
  function byTarget(t){
    return document.querySelector('[data-nav][data-target="'+(window.CSS&&CSS.escape?CSS.escape(t):t)+'"]');
  }
  document.addEventListener('click',function(e){
    var btn=e.target.closest('[data-nav]');
    if(btn){activate(btn,true);}
  });
  var state=load(),hash=location.hash.slice(1);
  var wanted=(state.t||[]).concat(hash?[hash]:[]);
  wanted.forEach(function(t){var b=byTarget(t);if(b){activate(b,false);}});
  if(typeof state.y==='number'){window.scrollTo(0,state.y);}
  window.addEventListener('scroll',function(){save(open());},{passive:true});

  // What changed since the last load. Signatures are rendered into the page
  // (id + status), so the comparison is exact and needs no clock.
  var SIG=KEY+':sig';
  var now={},changed=[];
  document.querySelectorAll('[data-sig]').forEach(function(el){
    now[el.getAttribute('data-target')||el.id]=el.getAttribute('data-sig');});
  var before=null;
  try{before=JSON.parse(sessionStorage.getItem(SIG));}catch(e){}
  try{sessionStorage.setItem(SIG,JSON.stringify(now));}catch(e){}
  if(before){
    Object.keys(now).forEach(function(k){if(before[k]!==now[k]){changed.push(k);}});
  }
  changed.forEach(function(k){
    [byTarget(k),document.getElementById(k)].forEach(function(el){
      if(el){
        el.classList.remove('fresh');void el.offsetWidth;el.classList.add('fresh');
        el.addEventListener('animationend',function(){el.classList.remove('fresh');},{once:true});
      }});
  });
  if(changed.length){
    var t=document.createElement('div');
    t.className='toast';
    t.innerHTML='<span class="pulse"></span><span></span>';
    t.lastChild.textContent=changed.length+(changed.length===1?' update':' updates')+' just landed';
    document.body.appendChild(t);
    setTimeout(function(){t.remove();},5200);
  }
})();
`.trim();

const MERMAID = `
<script type="module">
  import m from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  m.initialize({startOnLoad:true,theme:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"neutral"});
</script>`.trim();

type Shell = {
  readonly title: string;
  readonly head: string;
  readonly body: string;
  readonly refresh: boolean;
  readonly mermaid: boolean;
};

/** Nav + breadcrumbs travel together and stay pinned to the top. */
const chrome = (...parts: readonly string[]): string =>
  `<div class="chrome">${parts.join("")}</div>`;

const shell = (s: Shell): string =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${s.refresh ? '<meta http-equiv="refresh" content="5">\n' : ""}<title>${esc(s.title)}</title>
<style>${CSS}</style>
</head>
<body>
${s.body}
<footer class="foot"><div class="hd">rendered by supermodo · skills</div></footer>
<script>${JS}</script>${s.mermaid ? `\n${MERMAID}` : ""}
</body>
</html>
`;

const chip = (status: string): string =>
  `<span class="chip ${attr(status)}">${esc(status)}</span>`;

const navButton = (target: string, status: string, label: string, current: boolean): string =>
  `<button data-nav data-target="${attr(target)}" data-sig="${attr(status)}" aria-current="${current}">` +
  `<span class="dot ${attr(status)}"></span><span class="grow">${esc(label)}</span></button>`;

// ── site header (identical on every page) ───────────────────────────────────

const ARCHIVE_TABS = ["Runs", "Reports", "Releases", "Needs you"] as const;
const TAB_NAMES = ["Board", ...ARCHIVE_TABS] as const;

export type Nav = {
  readonly project: string;
  readonly counts: Readonly<Record<string, number>>;
};

const tabId = (name: string): string => `tab-${slug(name)}`;

/**
 * The nav bar, byte-identical on every page: project, the four tabs, the
 * total. On the index the tabs switch panels; everywhere else they are links
 * back into the index, so the header behaves like a site nav throughout.
 */
const siteHeader = (nav: Nav, prefix: string, active: string, interactive: boolean): string => {
  const tab = (name: string): string => {
    const current = name === active;
    const inner = name === "Board" ? esc(name)
      : `${esc(name)}<span class="n">${nav.counts[name] ?? 0}</span>`;
    return interactive
      ? `<button data-nav data-target="${attr(tabId(name))}" aria-current="${current}">${inner}</button>`
      : `<a href="${attr(prefix)}index.html#${attr(tabId(name))}" aria-current="${current}">${inner}</a>`;
  };
  const total = ARCHIVE_TABS.slice(0, 3).reduce((n, name) => n + (nav.counts[name] ?? 0), 0);
  return `<header class="top"><div class="hd">` +
    `<h1><a href="${attr(prefix)}index.html#${attr(tabId(TAB_NAMES[0]))}">${esc(nav.project)}</a></h1>` +
    `<nav class="tabs"><span class="pin">${tab("Board")}</span><span class="tsep"></span>` +
    `${ARCHIVE_TABS.map(tab).join("")}</nav>` +
    `<span class="meta">${total} report${total === 1 ? "" : "s"}</span>` +
    `<button class="themer" data-theme-toggle type="button">dark</button>` +
    `</div></header>`;
};

const LIVE = `<span class="live"><span class="pulse"></span>live · refreshing every 5s</span>`;

const crumbs = (path: string, title: string, status: string, meta: string, live = false): string =>
  `<div class="crumbs"><div class="hd">` +
  `<span class="path">${path}</span>` +
  `<span class="title">${esc(title)}</span>${chip(status)}` +
  `<span class="spacer"></span>${live ? LIVE : ""}<span class="meta">${esc(meta)}</span>` +
  `</div></div>`;

const card = (heading: string, entries: readonly string[]): string =>
  entries.length === 0 ? "" :
    `<div class="card"><h3>${esc(heading)}</h3><ul>${entries.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`;

// ── run page ────────────────────────────────────────────────────────────────

const stageId = (st: Stage): string => `stage-${slug(`${st.order}-${st.skill}`)}`;

const stageSection = (st: Stage, current: boolean): string =>
  `<section id="${attr(stageId(st))}" data-panel class="${current ? "on" : ""}">` +
  `<h2>${esc(st.order)} · ${esc(st.skill)}${st.gate ? " ⛔" : ""} ${chip(st.status)}</h2>` +
  `<p class="sub">${esc(st.summary)}</p>` +
  card("Open questions", st.questions) +
  card("Drift notes", st.drift) +
  card("Decisions", st.decisions) +
  markdown(st.body) +
  `</section>`;

const overview = (run: Run): string =>
  `<section id="overview" data-panel class="on">` +
  `<h2>${esc(run.task)} ${chip(run.status)}</h2>` +
  `<p class="sub">${esc(run.id)} · ${esc(dateOf(run.stamp))} ${esc(timeOf(run.stamp))}` +
  `${run.live ? " · live, refreshing every 5s" : ""}</p>` +
  card("Needs you", run.needsYou) +
  `<div class="table-wrap"><table><thead><tr><th>#</th><th>stage</th><th>status</th><th>summary</th></tr></thead><tbody>` +
  run.stages.map((st) =>
    `<tr><td>${esc(st.order)}</td><td>${esc(st.skill)}${st.gate ? " ⛔" : ""}</td>` +
    `<td>${chip(st.status)}</td><td>${esc(st.summary)}</td></tr>`).join("") +
  `</tbody></table></div>` +
  card("Drift notes", run.stages.flatMap((s) => s.drift)) +
  card("Decisions", run.stages.flatMap((s) => s.decisions)) +
  `</section>`;

export const runPage = (run: Run, nav: Nav): string =>
  shell({
    title: `${run.task} — supermodo run`,
    head: "",
    refresh: run.live,
    mermaid: run.stages.some((s) => s.body.includes("```mermaid")),
    body:
      chrome(siteHeader(nav, "../../", "Runs", false), crumbs(
        `<a href="../../index.html#${attr(tabId("Runs"))}">Runs</a> ／`,
        run.task,
        run.status,
        `${dateOf(run.stamp)} ${timeOf(run.stamp)}`,
        run.live,
      )) +
      `<div class="wrap split" data-panels>` +
      `<nav class="rail">` +
      navButton("overview", run.status, "Overview", true) +
      `<div class="grp">Stages</div>` +
      run.stages.map((st) => navButton(stageId(st), st.status, `${st.order} ${st.skill}${st.gate ? " ⛔" : ""}`, false)).join("") +
      `</nav><main>` +
      overview(run) +
      run.stages.map((st) => stageSection(st, false)).join("") +
      `</main></div>`,
  });

// ── standalone report page ──────────────────────────────────────────────────

export const reportPage = (r: Report, nav: Nav): string => {
  const home = r.kind === "release" ? "Releases" : "Reports";
  return shell({
    title: `${r.skill} — supermodo report`,
    head: "",
    refresh: false,
    mermaid: r.body.includes("```mermaid"),
    body:
      chrome(siteHeader(nav, "../", home, false), crumbs(
        `<a href="../index.html#${attr(tabId(home))}">${esc(home)}</a> ／`,
        r.skill,
        r.status,
        `${dateOf(r.stamp)} ${timeOf(r.stamp)}${r.task === "" ? "" : ` · ${r.task}`}`,
      )) +
      `<div class="wrap"><main>` +
      `<p class="sub">${esc(r.summary)}</p>` +
      card("Open questions", r.questions) +
      markdown(r.body) +
      `</main></div>`,
  });
};

// ── index ───────────────────────────────────────────────────────────────────

type Entry = {
  readonly id: string;
  readonly stamp: string;
  readonly label: string;
  readonly status: string;
  readonly summary: string;
  readonly href: string;
  readonly needsYou: readonly string[];
  readonly task: string;
};

const entryOfRun = (r: Run): Entry => ({
  id: r.id, stamp: r.stamp, label: r.task, status: r.status,
  summary: r.stages.at(-1)?.summary ?? "", href: r.href, needsYou: r.needsYou, task: r.task,
});

const entryOfReport = (r: Report): Entry => ({
  id: r.id, stamp: r.stamp, label: `${r.skill}${r.task === "" ? "" : ` · ${r.task}`}`,
  status: r.status, summary: r.summary, href: r.href, needsYou: r.needsYou, task: r.task,
});

const detailId = (tab: string, e: Entry): string => `d-${slug(tab)}-${slug(e.id)}`;

const detail = (tab: string, e: Entry, current: boolean): string =>
  `<section id="${attr(detailId(tab, e))}" data-panel class="${current ? "on" : ""}">` +
  `<h2>${esc(e.label)} ${chip(e.status)}</h2>` +
  `<p class="sub">${esc(dateOf(e.stamp))} ${esc(timeOf(e.stamp))} · ${esc(e.id)}</p>` +
  `<p>${esc(e.summary)}</p>` +
  card("Needs you", e.needsYou) +
  `<p><a href="${attr(e.href)}">open the full report →</a></p></section>`;

const rows = (tab: string, entries: readonly Entry[]): string =>
  entries.map((e, i) => {
    const prev = entries[i - 1];
    const head = prev === undefined || dateOf(prev.stamp) !== dateOf(e.stamp)
      ? `<div class="grp">${esc(dateOf(e.stamp) || "undated")}</div>` : "";
    return head +
      `<button class="row" data-nav data-target="${attr(detailId(tab, e))}" ` +
      `data-sig="${attr(`${e.status}:${e.summary}`)}" aria-current="${i === 0}">` +
      `<span class="dot ${attr(e.status)}"></span><span class="grow">${esc(e.label)}</span>` +
      `<span class="ts">${esc(timeOf(e.stamp))}</span></button>`;
  }).join("");

const tabPanel = (tab: string, entries: readonly Entry[], current: boolean): string =>
  `<section id="${attr(tabId(tab))}" data-panel class="${current ? "on" : ""}">` +
  (entries.length === 0
    ? `<div class="wrap"><main><div class="empty">Nothing here yet.</div></main></div>`
    : `<div class="wrap split" data-panels><div class="list">${rows(tab, entries)}</div>` +
      `<main>${entries.map((e, i) => detail(tab, e, i === 0)).join("")}</main></div>`) +
  `</section>`;

const boardOf = (model: Model): Report | undefined =>
  model.reports.filter((r) => r.skill === "next")[0];

const boardPanel = (model: Model): string => {
  const b = boardOf(model);
  return `<section id="${attr(tabId("Board"))}" data-panel class="on">` +
    `<div class="wrap"><main>` +
    (b === undefined
      ? `<div class="empty">No board yet — run <code>/supermodo:next</code>.</div>`
      : markdown(b.body)) +
    `</main></div></section>`;
};

/** The four tabs, in order, with the entries behind each. */
const tabsOf = (model: Model): readonly (readonly [string, readonly Entry[]])[] => {
  const runs = model.runs.map(entryOfRun);
  const releases = model.reports.filter((r) => r.kind === "release").map(entryOfReport);
  const reports = model.reports.filter((r) => r.kind !== "release").map(entryOfReport);
  const needs = [...runs, ...reports, ...releases]
    .filter((e) => e.needsYou.length > 0)
    .sort((a, b) => (a.stamp < b.stamp ? 1 : -1));
  return [["Runs", runs], ["Reports", reports], ["Releases", releases], ["Needs you", needs]];
};

/** The nav every page shares — same tabs, same counts, wherever you are. */
export const navOf = (project: string, model: Model): Nav => ({
  project,
  counts: {
    Board: boardOf(model) === undefined ? 0 : 1,
    ...Object.fromEntries(tabsOf(model).map(([name, list]) => [name, list.length])),
  },
});

export const indexPage = (project: string, model: Model): string => {
  const tabs = tabsOf(model);
  return shell({
    title: `${project} — supermodo`,
    head: "",
    refresh: false,
    mermaid: false,
    body:
      `<div data-panels>` +
      chrome(siteHeader(navOf(project, model), "", "Board", true)) +
      boardPanel(model) +
      tabs.map(([name, list]) => tabPanel(name, list, false)).join("") +
      `</div>`,
  });
};
