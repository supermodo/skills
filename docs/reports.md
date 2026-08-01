# reports — your runs and reports as web pages

Every supermodo skill writes what it did to `.skills/supermodo/` as markdown.
`reports` turns those files into web pages: one page per flow run, one per
standalone report, plus an archive index of everything the toolkit has ever
done in this project. Skills open their page for you as they finish, so a long
run is something you watch rather than something you read afterwards.

The markdown stays the source of truth. The HTML is a **projection** —
regenerable, never load-bearing. Delete every `.html` and the next render
recreates it byte for byte; a failed render never fails the run that called it.

## When to use it

You mostly don't invoke it — the other skills do. Reach for it directly to
reopen a page, to see the archive, or to re-render after upgrading supermodo.

```
/supermodo:reports                     render everything, open the archive
/supermodo:reports --run <run-id>      render and open one run
/supermodo:reports --report <path.md>  render and open one report
/supermodo:reports --no-open           render only, print the paths
```

## The run page

A flow run is one page: a sticky stage rail on the left — a dot per stage, ⛔
on the two mandatory gates, plus what's waiting on you — and the full stage
report on the right. Flow opens it right after stage 1 and re-renders it after
every stage.

**While the run is live** the page says so and refreshes itself: a dot beside
*live · refreshing every 5s* that beats once per refresh cycle. It's a quiet
signal on purpose — you can leave the page open without it pulling at you. Both
dot and label disappear the moment the run finishes.

**What just changed is highlighted.** Each entry carries a signature of its own
state, so on every refresh the page can tell exactly what moved since you last
looked: changed stages flash briefly in the rail and a small toast reports how
many updates landed. Your open stage and scroll position survive each refresh —
you can read stage 3 while stage 6 is still running. The first load never
flashes, and everything here respects `prefers-reduced-motion`.

The same highlighting works on the archive index: leave it open during a run
and rows light up as their status changes.

## The archive

`index.html` opens on the **Board** — the worklist as of the last time you ran
`/supermodo:next`: the three suggestions, then everything open by priority as
rows you can click open for the description, the dates and the full task list
with per-task state. It sits apart from the other tabs because it describes
*now*, not history, and it carries a stamp saying when it was computed. The
renderer computes nothing — `next` resolves the board and the page draws it.

Then four archive tabs:

| tab | what's in it |
| --- | --- |
| **Runs** | every flow run, newest first |
| **Reports** | every standalone skill report — hunt, tests, grill, commit, … |
| **Releases** | every release |
| **Needs you** | anything failed, waiting on an answer, or with a gate that never went green |

The first three are just the directory layout — the path decides the tab,
nothing is classified by hand. **Needs you** is a computed view: items appear
there *and* in their home tab, and drop out when the condition clears. A
report that names a work item (`task:` in its frontmatter) is shown against
that item.

Every page carries the same header — project name, the Board, the four archive
tabs with their counts, and the total — so it reads like a small site: on the
index the tabs switch view, everywhere else they are links back into it. Below the header a breadcrumb
strip names the page you're on (`Runs ／ csv-export`) with its status. The
project name is a link home to the board.

Pages are **light by default** — not by system preference, so a report looks
the same for whoever opens it. The `dark` button in the header switches, and
the choice is remembered in that browser.

## Charts, trees and graphs

Reports can embed diagrams that render in the page — bar charts, trees,
dependency graphs, the board itself — written as small declarative blocks in
the markdown, drawn natively in the house style, never an external asset. They stay readable as text in the `.md` too.
Mermaid blocks also work as an escape hatch; they need a network connection to
draw, and fall back to their own source text when offline, so an archived
report is never blank.

## Configuration

```json
"reports": { "html": true, "open": "auto" }
```

| key | values |
| --- | --- |
| `html` | `true` (default) — render pages. `false` — markdown only, exactly as before. |
| `open` | `auto` (default) — each skill opens its own page. `flow` — only flow runs open a tab. `never` — always just print the link. |

A browser is never opened when there's no terminal attached, in CI, or over
SSH without a display — you get the `file://` link instead, whatever the
setting says.

Everything lives under `.skills/supermodo/`, which `config` gitignores. Nothing
is uploaded, no server runs, and the pages work offline.

Requires: `protocols`, a valid `skills.config.json` ([config.md](config.md)).
