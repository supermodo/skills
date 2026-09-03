# Changelog

All notable changes to the supermodo skills package. Format follows
[Keep a Changelog](https://keepachangelog.com); versioning is semver.

**Alpha (0.x):** anything may change between minors — **MINOR** = new
capability OR breaking change (config schema, docs convention, protocol
contracts), **PATCH** = fixes and wording. `1.0.0` will mean the config
schema (`configVersion`), the docs convention, and the protocol contracts
are stable — from then on breaking those is a MAJOR with a migration path.

## [0.7.0] - 2026-09-03

### Added
- The Board tab is a snapshot, and it used to age in silence — close a task, add
  a backlog entry or set a priority, and it went on showing the picture from
  before. It now says so above the board whenever the work documents have changed
  since it was computed, and names the command to recompute it; `/supermodo:flow`
  and `/supermodo:work` close the same way, with one line pointing at
  `/supermodo:next`. Nothing recomputes a board behind your back: a board that
  appeared unasked would put its triage questions on screen unasked too.
- Findings from a `hunt` or a `tests` audit stay in their report until you ask
  for them: `/supermodo:librarian --promote <report> [ids…]` turns the ones you
  name into work items, and nothing is ever filed to your backlog automatically.

  Because an item is what the board ranks and what the archive closes, promotion
  never puts work of different priorities in one folder — a P0 buried among
  ninety-nine P3s pins the board head forever and cannot close until the last
  nit is done. Findings that only ship together stay together and take the
  highest priority among them; everything else groups by the surface it touches,
  so several items at one priority is the normal outcome. Where an item does
  hold more than one priority, its board row carries a `mixed` pill naming what
  is inside.

  For an actual bug found by a hunt the priority needs no interview: the
  severity two agents already agreed on maps onto the consequence question and
  exposure comes from your main branch, leaving one confirmation per priority
  band. Improvements — a dead export, a missing test — and every test-audit
  finding get the ordinary questions once per group, since neither severity
  scale implies a driver.

  The board now separates what you ranked from what a tool ranked for you. When
  nobody is reachable to answer — a promotion inside an unattended `flow` run —
  the priority is still computed and still ranks, but it is written with a
  `Priority-source: derived` line naming what was assumed, and its board row
  carries a `derived` pill. Those items count as untriaged: `/supermodo:next
  --triage` collects them, and confirming one clears the marker. Nothing written
  before this reads as derived, so existing work keeps its plain, confirmed
  priority.

  Promoted work carries its own evidence in a `findings.md`, because run
  artifacts under `.skills/` are gitignored and would resolve to nothing in
  anyone else's clone; `docs-check` now enforces that every promoted finding has
  both its evidence and its task. Promoting a second subset from the same report
  later extends the item it belongs to rather than colliding with it, and
  re-running a promotion after a failure never creates anything twice.
- **Your process, written down once.** Every skill now reads
  `.supermodo/rules/<skill>.md` before it acts — that file IS the process for that
  skill in your project, not hints layered over ours. The four that cost the most
  or cannot be undone (`commit`, `release`, `flow`, `bug-council`) show you what
  they are about to do the first time you run them and ask before doing it, so the
  process starts as an agreement rather than a surprise. Say no once and you are
  never asked again.

  Each ships a starting point you can accept, edit or replace — `light` or `full`
  for releases, Conventional Commits or `[PROJ-123]` prefixes for messages — and
  conventions that span several skills, like where the tracker key belongs, live
  once in `.supermodo/rules/vcs.md` so they cannot drift apart. Safety rails are
  not in those files and cannot be edited away: nothing is pushed without your
  yes, a release still refuses a dirty tree.
- **The docs convention is yours to name.** Folders, task files, field labels,
  priority levels, checklist characters and marker prefixes are all settings now
  (`docs.layout` and `docs.grammar`). Call the work folder `tickets/`, rank items
  `now / next / later`, mark work in progress with whatever character your team
  already types, require an `Owner:` line on every spec — the checker enforces
  your spelling rather than ours, in messages that use your words.

  What you cannot do is delete a field a skill reads. Try, and config refuses at
  the point of change and names the skills that would have broken, instead of
  letting it surface next week as a board that came back empty. The convention is
  still strict about shape: two levels of work folders, priorities that are
  ordered, and task states that partition into done and not-done.

  `commit` and `release` now share one commit vocabulary. The list of types lived
  in two places, prose in one skill and a pattern in the other, so renaming a type
  would quietly have turned every feature into a patch release. Types, the
  breaking marker and the subject length caps come from `vcs.commit`, and the 0.x
  rule that demotes a breaking change to a minor is a setting
  (`release.alphaPolicy`) rather than an assumption.

### Changed
- Skills no longer keep a second copy of their own default process. A skill used
  to describe its sequence in its own instructions AND ship that same sequence as
  a starting point — two copies that drift the first time either is edited, with
  nobody told. Now a skill states only what it guarantees, and the process itself
  lives in one file: yours, or the starting point it came from. When you have not
  written one, the shipped default is what runs, and each skill marks exactly one
  starting point as that default.

  In practice this means `librarian` names what a lifecycle pass must be true of —
  work verified against code before it is archived, generated files never
  hand-edited, decision records immutable once accepted — while when the pass runs
  and what earns a decision record are yours to set. `commit` takes its type
  vocabulary from config rather than restating it, and where the message shape is
  decided moved to the same place.
- The release preflight now works out your process ONCE, and gathers only state
  on every run after that.

  **State, every run.** It establishes the version from git before it looks at
  your checkout: every release tag, both long-lived branches and their
  remote-tracking counterparts, with the version file and changelog resolved at
  each — refreshing the remote first. That catches what a checkout cannot see,
  each as a blocker with its repair command beside it: a hotfix tagged on the
  main branch while you stand on dev, a branch behind its remote, a missing
  back-merge, and a version file declaring less than something already
  published. Under a squash workflow the unreleased range is bounded by the last
  back-merge rather than the last tag, so a `feat:` released three versions ago
  no longer inflates today's patch into a minor. There is no flag to skip the
  fetch — offline degrades to a warning that says only local refs were checked.

  **Process, once.** With no `.supermodo/rules/release.md` the preflight
  proposes your process — branches, tag prefix, merge strategy, version file,
  changelog, forge, whether the main branch looks protected, and what your CI
  already does — each line carrying the evidence it was read from. If CI owns
  versioning (release-please, semantic-release, changesets) that is called out,
  because a manual release would fight it. You confirm or correct, it is written
  to the rules file and the config, and later runs read it instead.

  **Commands are rendered; their order is yours.** The preflight emits named
  steps with your real branch names, remote, version, tag and paths already
  substituted. When you have a rules file it names the order and no default
  order is offered beside it; without one, the shipped default applies.

  **The skill renders git; it does not invent your forge's commands.** Every
  command it prints is pure git (plus a POSIX `awk` that extracts the changelog
  entry for whatever publishes it), rendered from your real branch names,
  remote, version, tag and paths. The steps it cannot render honestly —
  publishing a release, opening a change request, waiting for an approval — are
  marked as yours and carry no commands, because the set of forges is not
  enumerable and a `gh` command guessed at a Gitea project reads as verified
  right up until it fails. Instead the preflight reports the evidence: every
  remote URL verbatim, what your CI already does, whether merges on the main
  branch look like requests, and any release documentation the repository
  already has. You write those steps into the rules file once, in your own
  words. A `request-based` template ships as a starting point for a protected
  main branch.

### Removed
- `release.mode` and `release.githubRelease` are removed from
  `skills.config.json`.

  `release.mode` never named a value — it named a choice between two workflows,
  and a workflow is a sequence, which belongs in `.supermodo/rules/release.md`
  (frontmatter `template: light|full`) where the rest of your process already
  lives. Keeping it in config meant two places described your release and
  nothing kept them agreeing. `release.githubRelease` hardcoded one forge into a
  boolean; whether and how a project publishes a release is part of its process,
  so it moves into the rules file in the project's own words rather than into
  another enum.

  A config still carrying either is an error, not a silent ignore, and the
  message names the migration: run `config --rules release` to materialize the
  template matching the mode you had, and let `config` rewrite the file under
  its usual dry-run and approval. `release` reports the same under `migrations`
  and refuses to treat the stale key as meaningful.

### Fixed
- `commit` and `release` now print every `git commit -m` with the message in
  single quotes. An interactive shell reads a `!` inside double quotes as a
  history expansion and refuses the line, so the commands carrying a breaking
  change were exactly the ones that would not run when pasted.
- Config and version files are now read as JSONC — `//` and `/* */` comments and
  trailing commas are accepted. A project whose version lives in a `deno.jsonc`
  or a `tsconfig.json` could not be released at all: the preflight reported
  "cannot read version" for a file its own toolchain considers perfectly valid.
  The same now applies to `skills.config.json`, so a commented config reads the
  same way in every supermodo skill. Comments are the only relaxation — every
  other config rule still applies, `config` still writes strict JSON, and a
  genuine syntax error still reports the line and column it occupies in the
  original file.
- An adversarial pass found the release preflight still assuming `v` + `x.y.z` +
  `dev → main` were facts about git rather than one project's names. Seven
  failures, four of which produced a confident wrong number instead of an error.

  - **Version files that are not JSON now work.** `Cargo.toml`,
    `pyproject.toml`, `gradle.properties`, a Python `__version__`, a bare
    `VERSION` file — previously every one of them reported "cannot read version",
    excluding most of Rust, Python and the JVM. JSON still uses `versionPath`;
    everything else is matched by shape, and the shape that matched is reported
    so a guess is visible as a guess. `release.versionPattern` overrides both.
  - **Prereleases are understood.** `1.2.3-rc.1` parses and orders per semver.
    This mattered most for TAGS: a prerelease tag was invisible, so the preflight
    reported "no tags" and derived the bump from the entire history. It now
    suggests no next version for a prerelease and says why — rc.1 → rc.2 or
    rc.1 → release is the project's decision, not a derivable one.
  - **Single-branch projects can release.** No `dev` branch is a process, not an
    error; the release happens on the main branch with nothing to merge or
    back-merge.
  - **Tags that do not match `tagPrefix` are a HALT.** They used to yield zero
    tags silently, which made the unreleased range the whole history and let the
    suggested version land BELOW something already published — a monorepo tagging
    `pkg-a@1.0.0` was offered `0.1.0`. The blocker now names the tag it found.
  - **The first release is the declared version.** With nothing tagged, a project
    declaring `0.1.0` was told to release `0.2.0` — a version with no changelog
    entry.
  - **CI owning versioning halts the run.** release-please, semantic-release and
    changesets were detected and then noted in passing while the preflight still
    reported "ready" above a manual sequence that would fight them.
  - **A shallow clone halts.** Every number here comes from history, and a
    truncated clone silently reported a shorter unreleased range.
  - **Calendar and custom version schemes are supported rather than refused.**
    `2026.08.1` used to parse as semver — leading zeros are invalid per the spec —
    and a "minor bump" produced `2026.9.0` under "ready: preflight clean". Such a
    version is now read and reported, no next version is invented, and the checks
    that need ordering are named as SKIPPED rather than quietly passing.
  - **A dependency's version is no longer mistaken for the package's.** In a
    sectioned file (`Cargo.toml`, `.cfg`, INI) the section in `versionPath` is
    honoured, so `package.version` no longer matches whichever dependency happens
    to be declared above `[package]`.
  - **A changelog heading a version twice is flagged**, because the notes
    extraction stops at the next heading and would publish only the first block.
  - **Two hostile config values are refused.** A `versionPattern` with nested
    quantifiers (`^((a+)+)# Changelog

All notable changes to the supermodo skills package. Format follows
[Keep a Changelog](https://keepachangelog.com); versioning is semver.

**Alpha (0.x):** anything may change between minors — **MINOR** = new
capability OR breaking change (config schema, docs convention, protocol
contracts), **PATCH** = fixes and wording. `1.0.0` will mean the config
schema (`configVersion`), the docs convention, and the protocol contracts
are stable — from then on breaking those is a MAJOR with a migration path.
) backtracks exponentially — it burned 19 seconds of
    CPU with the preflight merely appearing to hang, and JavaScript has no regex
    timeout, so `config-check` now rejects that shape. And a `versionFile` or
    `changelog` that reaches outside the project through a SYMLINK is blocked:
    the previous check rejected `..` and absolute paths, which a symlinked
    directory walks straight past.
- A second adversarial pass — this one by an independent model — found nine more
  ways the release preflight could be confidently wrong. All nine produced a
  plausible-looking result rather than an error.

  - **A mid-cycle `main → dev` sync is no longer mistaken for a release
    boundary.** The unreleased range was bounded at "the newest merge whose
    second parent `main` contains", which matches any routine sync — and taking
    one as the boundary EXCLUDED everything before it. A team that synced after a
    `feat:` landed got a patch bump and "ready" while the feature went
    unreleased. The second parent must now BE the released commit; otherwise the
    range falls back to the tag, which can only over-count.
  - **Paths are quoted.** `docs/My Changelog.md` is a legal path, and it was
    interpolated bare into `git add` and `awk`, splitting into two arguments —
    and had `docs/My` existed, it would have staged the wrong file under a plan
    calling itself verified. Ordinary paths stay unquoted so the plan stays
    readable.
  - **A tag whose name and contents disagree is no longer authoritative.** A
    `v1.0.0` cut on the wrong commit was accepted while the report printed the
    contradiction plainly; every downstream number trusts that tag.
  - **Every remote is fetched, and `release.remote` selects the canonical one.**
    Tags share a single namespace, so a release published at `upstream` was
    invisible to a checkout that only fetched `origin` — a fork was offered a
    version BELOW what upstream had already published.
  - **An operation already in progress halts the release.** A half-finished merge
    leaves an empty `git status` but a live `MERGE_HEAD`, and the release's own
    commit would have COMPLETED it, turning someone else's merge into the release
    commit. Merge, rebase, cherry-pick, revert, bisect and sequencer state are all
    checked.
  - **A tag prefix can prefix a DIFFERENT convention.** With `tagPrefix: "v"`,
    the tag `version2.0.0` starts with `v` so it was not "foreign", and
    `ersion2.0.0` is not semver so it was not a release tag either — it fell
    through both and `2.0.0` stayed invisible, making the proposed `1.0.1` a
    rollback. Recognition is now "prefix AND parses as semver", and an
    unrecognised tag carrying a version at or above what IS recognised halts.
  - **Declining to guess no longer leaves a project with no plan.** A scheme the
    tool refuses to bump (CalVer, four-part) produced "ready: preflight clean"
    and ZERO steps — nothing to run and no way to proceed. `--version <chosen>`
    supplies what the tool declined to invent, and the steps render from it.
  - **Line endings no longer decide the workflow.** The rules-file frontmatter
    parser matched LF only, so a file checked out with CRLF (Windows,
    `core.autocrlf`) had its `template:` go unread — the project's declared
    workflow silently became the default one, and its own stabilization branch
    then blocked as "not dev". BOM and CRLF are normalized in both the release
    preflight and `rules-check`.
  - **A stabilization branch that exists only on the remote still counts.** A
    fresh clone has no local `release/*`, so the hotfix rejoin — an invariant —
    was silently skipped in the commonest checkout of a full-flow project.
- A second adversarial pass, run against the freshly fixed preflight, found four
  more defects — including one introduced by the previous round's own fix.

  - **A supplied `--version` is still a validated version.** It was accepted
    before any comparison, so a rollback (`0.5.0` under a published `1.0.0`) and
    a duplicate (`1.0.0` again) both reported "ready" — the second rendering a
    `git tag` that could not succeed. The chosen version must now be above every
    published and declared one, and its tag must not already exist.
  - **The version is data, never a pattern.** A version may contain `+` and `.`,
    which are regular-expression metacharacters: the heading
    `## [1.0.1+build.7]` never matched the generated `awk` regex, so the publish
    step received an EMPTY notes file with nothing anywhere saying so. The
    heading is now passed as a variable and compared as a string.
  - **Tag style is the project's.** A process required to ship signed tags could
    not express it — `tag` is rendered by the skill, and rules own order only.
    `release.tagStyle` selects `lightweight` (default), `annotated` or `signed`,
    and the command renders accordingly. Three values, all defined by git itself.
  - **Every remote is fetched and `release.remote` names the canonical one**
    (see the previous entry), now documented in the config schema alongside
    `tagStyle`.

  Also corrected: a four-part scheme was briefly blocked by the stray-tag rule
  introduced for prefix overlaps. That rule is now asked only of projects whose
  own version is semver, where "no recognised tags" is a symptom rather than the
  normal state.
- A final adversarial pass found six more defects, one of them a security issue
  in the part of the skill whose whole purpose is to be pasted into a shell.

  - **A ref is not a shell token.** `git-check-ref-format` permits `;`, `# Changelog

All notable changes to the supermodo skills package. Format follows
[Keep a Changelog](https://keepachangelog.com); versioning is semver.

**Alpha (0.x):** anything may change between minors — **MINOR** = new
capability OR breaking change (config schema, docs convention, protocol
contracts), **PATCH** = fixes and wording. `1.0.0` will mean the config
schema (`configVersion`), the docs convention, and the protocol contracts
are stable — from then on breaking those is a MAJOR with a migration path.
, `&`,
    `|`, `<`, `>`, `(`, `)`, `!` and quotes in a branch name, so `dev;id>/tmp/x`
    is a branch git creates without complaint — and the plan rendered
    `git merge --squash dev;id>/tmp/x` for someone to paste. Refs are now quoted
    exactly as paths are, config validation rejects shell syntax in a ref, and
    the repair lines (which print even when blocked) are quoted too.
  - **Facts and commands must describe one repository.** An inherited `GIT_DIR`,
    `GIT_WORK_TREE` or `GIT_INDEX_FILE` silently redirects every git call, so the
    reported state would describe one repository while the commands act on
    another. Now a blocker.
  - **A configured `release.remote` that does not exist** is a blocker rather
    than a plan full of pushes to nothing.
  - **A branch checked out in another worktree** is a blocker: git refuses to
    switch to it, so the plan would stop at its first command.
  - **Tag integrity covers the changelog too.** The tagged commit's changelog was
    read and then never compared with the tag's own name.
  - **A signed-tag policy reports on its own baseline.** `tagStyle: "signed"`
    with a lightweight last tag now says so, rather than implying a compliance it
    never checked.
- An independent verification of every claim made about the release and config
  guards found the ones below either false or held by nothing; each is fixed and
  now has a check that fails when the behaviour regresses.

  - **A supplied `--version` is ordered against everything published.** Under a
    published 1.0.0, `--version 0.9` rendered `git tag v0.9`: the rollback guard
    only spoke semver. Versions now compare as semver when both sides parse and
    as dotted numbers otherwise, and one that cannot be ordered is refused.
  - **A hostile `versionPattern` cannot hang the preflight.** Two rewrites of the
    known catastrophic pattern passed the old screen and hung `release-check`
    for good. A shared screen now runs in `config-check` and in the preflight
    itself, and the pattern executes under a 500 ms budget for whatever the
    screen misses. The same screen covers `vcs.issueKey.pattern`.
  - **Blanking a child of a consumed key is refused.** `docs.grammar.task.states.done: []`
    validated clean and left the checklist with no way to say "done"; the floor
    now walks each consumed key's subtree and names the skills that parse it.
  - **A duplicated changelog heading is counted as text**, so `1.0.1+build.7`
    headed twice is warned about — the `+` no longer disables the warning.
  - **The release guide names no forge.** `forge` and `integration` are gone from
    the documented config, `gh release list` is no longer ordered before
    reporting state, and the self-check fails if the guide instructs a forge CLI.
  - **The self-check refuses a poisoned expectation table** (a row expecting a
    failure value), and seventeen behaviours that were only ever asserted —
    in-progress operations, an inherited `GIT_DIR`, remote-tracking versions,
    BOM rules files, semver prerelease ordering, commented configs, more version
    homes — now have rows that fail when they regress.

## [0.6.0] - 2026-08-02

### Added
- The board no longer shows you an order it cannot vouch for. An unranked item
  is unknown, not a quiet P2 — it could be the P0 — so `next` now asks the
  three priority questions before showing a board that would be guesswork, and
  you can triage everything, only what could change the answer, or skip and
  get the board under a plain warning. Answers reach disk in the same run
  through the new `librarian --priorities`, and if a write fails the run says
  so and hands back the lines to retry rather than asking you again next week.
  Priorities are now asked wherever work is created, including the one-time
  `--absorb` sweep of existing docs, so a first board no longer arrives
  entirely unranked.
- Reports lead with the picture: findings by severity, coverage per package,
  mutants caught against survived, purity before and after, and a tree of what
  a refactor proposes to move — drawn in the page, still readable as text in
  the markdown. Plans you are asked to approve are written and opened before
  the question, so you can check a nineteen-file refactor in seconds instead
  of trusting a wall of bullets.

### Changed
- Runs that produce nothing worth keeping no longer produce a page: a backlog
  insert and an ordinary commit leave the entry and the commit as their record
  and stay out of your browser. A commit that fails after staging still
  reports, because then there is no commit to be the record.
- Reports now declare what they are: `skill`, `status` and `summary` are
  required, `status` is one of four values, and every report says which work
  item it belongs to. Malformed reports are caught and shown as unreadable
  instead of rendering as healthy rows.

## [0.5.3] - 2026-08-02

### Fixed
- Work that has begun no longer reads as untouched: an item with some tasks
  done is `in-progress`, where before only a `/` marker counted — so a triad
  at 20 of 21 tasks was labelled `not-started` and sorted below untouched
  backlog entries. Ordering inside a priority bucket now uses real signals in
  turn — what unblocks others, what is nearest done, what has a triad at all,
  what you touched most recently — instead of falling through to alphabetical.
  The shortlist reaches past the top of the board too, reserving up to two
  places for a quick win or a blocker that strict ordering would bury.
- Every item now carries the command to act on it, so the board answers "how
  do I start this" for every row rather than only the shortlist. Task lists
  keep the grouping their `tasks.md` gives them — a seventy-task triad shows
  the author's own headings with per-group progress instead of one flat list —
  and titles render their code spans and paths properly. Priority groups are
  always open, accordions announce themselves, and states that say nothing
  (`not-started`, `backlog`) no longer print a label.

## [0.5.2] - 2026-08-01

### Fixed
- `next` now answers "what should I work on" with a shortlist of three to five
  real items to choose from. It used to fill three fixed roles — priority
  lead, context lead, human unblocker — and print an empty card whenever a
  role had no candidate, so a board with thirty open items could still say
  "nothing qualifies". Roles are now labels earned in board order rather than
  reserved slots, and a placeholder can no longer reach the page.
- The board page shows what it was hiding. Items carry their kind (`work:` /
  `backlog:`), `unblocks` names the items it unblocks instead of counting
  them, and progress bars, dependency pills and task lists survive several
  near-miss shapes rather than vanishing — anything still unusable is reported
  in a warning box instead of being dropped in silence. Report pages are boxed
  to one centred measure so text no longer aligns with the header instead of
  the body, and every code block has a copy button.

## [0.5.1] - 2026-08-01

### Fixed
- Skills now actually publish the web page they write. `next` in particular
  would compute a board, hand the priorities to `librarian` and never mention
  the page — its own instructions said it "writes nothing", which is true of
  documentation but not of its run report, and the reports protocol was
  missing from what it reads. Every skill that produces a report now renders
  it and names the page in its final message, and the protocol states the duty
  once, including the rule that stages inside a `flow` run render nothing so
  that eight stages never become eight browser tabs. `tdd`, `work`,
  `librarian`, `bug-council` and `sync-configs` also persist their standalone
  runs for the first time — previously those results existed only in the
  conversation and died with the session.
- Report pages now actually open. The renderer refused to launch a browser
  whenever it could not see a terminal, which is every time a skill runs it —
  so the default `open: "auto"` never opened anything and only printed a
  `file://` link. Being run by an agent is no longer mistaken for being
  headless; CI and displayless machines still just print the link. The board
  also renders as the board again: `next` was writing its worklist as markdown
  tables instead of the block the page is built from, so the Board tab showed
  a wall of text. The block's full shape is now written out in the reports
  protocol, and `next` is told to open its report with it.
- `commit` and `release` no longer describe your repository from memory. If a
  commit plan went unanswered, or a release stopped halfway, the skill now
  reads git — `HEAD`, the working tree, local and remote tags, published
  releases — before saying what has or has not happened. Previously an
  unanswered proposal was treated as proof that nothing had changed, so work
  you had already committed yourself could be reported as still pending, and a
  release step that had already run could be offered again — which is how a
  tag gets moved or a release gets duplicated.

## [0.5.0] - 2026-08-01

### Added
- New `reports` skill — everything supermodo writes is published as
  self-contained web pages. Each flow run becomes one page (a sticky stage
  rail with the two mandatory gates marked, the full stage report beside it),
  opened right after stage 1 and re-rendered as stages land; a live run says
  so quietly with a dot that beats once per refresh, flashes whatever changed
  since you last looked, and keeps your open stage and scroll position across
  every refresh. Standalone reports get their own page, and an archive index
  collects everything under four tabs — Runs, Reports, Releases, and **Needs
  you** (whatever failed, is waiting on an answer, or has a gate that never
  went green). The front page is the **Board**: the worklist from your last
  `/supermodo:next`, suggestions first, every open item expandable to its
  description, dates and task list. Reports can embed bar charts, trees,
  dependency graphs and the board itself as declarative blocks drawn natively,
  with Mermaid as an escape hatch. Pages are light by default with a
  remembered dark toggle, work offline, and never affect a run when a render
  fails — the markdown stays the source of truth.
- New `next` skill renders the **worklist board**: every open work triad and
  live backlog entry grouped by priority, annotated with effort, execution
  state, dependencies and whether triage is still owed by you — followed by at
  most three suggestions (the priority lead, a context lead that must name its
  evidence and may never jump a priority gap, and the highest-ranked item
  waiting on a decision from you). `--triage` sets priorities through three
  closed questions asked once; `--repair` reports convention debt. Its rules
  live in a new `worklist.md` protocol master: the P0–P3 scale and its intake
  matrix, priority inheritance from active dependents, execution-state
  ranking, a deterministic total order, and effort bands printed with their
  evidence. The docs convention gains the metadata it reads — optional
  `Priority:` and `Created:` lines in `spec.md`, an indented `priority:` in
  backlog entries, and an `## Open questions` checklist with immutable
  question IDs.
- New `bug-council` skill — the last resort for ONE stubborn bug the
  ordinary attempt already lost to. A blind council of independent seats
  (Codex, Claude, Kimi, native subagents) investigates from distinct lenses
  without seeing each other's reports, competing hypotheses are falsified by
  experiment rather than by vote, one designated implementer writes the
  smallest causal patch, and a fresh verifier that wrote no code attacks it.
  Depth (quick / standard / deep) is chosen automatically.
  **Explicit invocation only:** it is deliberately slow and expensive, so no
  skill ever chains into it — `hunt` still routes findings to `tdd --debug`,
  `flow` never convenes it, and both merely suggest it (as does `tdd --debug`
  after a failed cycle) when a bug is intermittent, keeps returning, or has
  already survived a fix attempt. One bug per run.
- Worktree-per-task: `work` and `flow` accept `--worktree` / `--no-worktree`,
  and the new `workspace.worktree` config field sets the project default.
  When on, each task runs in one dedicated git worktree on its own branch
  off `dev` — shared by every subagent, never one per subprocess. The
  bootstrap wizard asks whether to enable it, and `release` suggests
  removing the worktree and deleting the branch once merged.

### Changed
- `flow`, `librarian` and `work` no longer restate their own next-job
  rituals — all three read the worklist master instead. `flow` with no
  `--job` now shows the board's suggestions, `flow --job next` and
  `librarian --backlog next` resolve through the same rules, and `work` picks
  up the priority lead rather than a bespoke ordering. Selection semantics
  moved out of `docs-convention.md`, which now defines only the grammar they
  read.
- Reports gain an optional `task:` field linking a standalone report to a work
  item, and `state.json` records whether a run is still in flight. A new
  `reports` config section controls the web pages: `html` (default `true`)
  turns rendering off entirely, and `open` chooses whether every skill opens
  its page, only flow runs do, or none do — a browser is never opened without
  a terminal, in CI, or over SSH without a display. `next` now persists every
  board it computes, so the worklist has a history and the newest board
  becomes the front page of the archive; the page draws what `next` resolved
  and never re-derives priorities itself.

### Fixed
- Skills now honor `questions.transport: "chat"`. Previously `hunt`,
  `refactor`, `sync-configs`, and `tdd` hardcoded the `AskUserQuestion` tool
  in their own instructions, overriding the configured transport and always
  asking via the tool. Every mention is now gated on
  `questions.transport` / `perSkill.<slug>`, and a new `check.ts` lint fails
  the build on any ungated `AskUserQuestion` in skill prose.

## [0.4.0] - 2026-07-22

### Added
- Multi-host agent rosters: `agents.dir` is now the single canonical
  roster and the new `agents.hosts` field (e.g. `["claude", "codex"]`)
  tells `sync-configs` which hosts' native agent dirs to mirror it to,
  one-way. Switch between Claude Code and Codex without touching the
  config; the bootstrap interview asks once which hosts you use.
- Program/initiative nesting in `docs/work/`: group related triads under a
  program folder (`work/<program>/` with a frontmattered `README.md`
  overview plus `NN-<slug>/` initiative triads, two levels max).
  Validation, router nav, deterministic next, dependencies, backlog
  graduation, and archiving all understand both flat and program shapes;
  existing flat layouts are unchanged.

## [0.3.0] - 2026-07-22

### Changed
- `commit` now always writes the changelog fragment and prints the exact
  command plan before its single consent question — every run delivers
  message, fragment, plan, and one ask.
- `release` writes the version bump and changelog entry into the working
  tree automatically; only the git sequence is consent-gated. Declining
  leaves a pre-bumped tree the next run releases as declared.
- `config` bootstrap interview hardened: strict one-question-per-message
  wizard, closed menu for every missing command tier, immediate agent-role
  proposals, no questions outside the schema. SKILL.md is ~35% slimmer with
  phase detail moved to an on-demand playbook (`references/procedures.md`).

### Added
- Trigger + behavior eval set for the `config` skill
  (`skills/config/evals/`).

## [0.2.0] - 2026-07-22

### Added
- One-command project start: `config` bootstraps an empty folder instantly
  with defaults (`--yes` works in any project), guides you to close missing
  quality gates (coverage, mutation, lint) with always-current setup
  guidance derived from your installed tools and live docs, and hands off
  to `commit` — which now works in fresh folders too (offers `git init`).
- Changelog fragments (changesets-style): `commit` writes a small
  user-facing fragment per commit in `changes/` (default ON — opt out with
  `--no-changelog` or `changelog.fragments: false`); `release` builds the
  changelog entry from fragments near-verbatim and deletes them in the
  release commit. New optional `changelog` config section (`fragments`, `dir`).
- Grill settled table: technical points both models agree on arrive as one
  reviewable table — you answer only real conflicts and business decisions,
  which always get individual confirmation.

### Changed
- `release` now runs the configured test/lint quality gates in preflight; a
  red gate blocks the release.

## [0.1.1] - 2026-07-21

### Changed
- Documentation restructured: new `docs/` folder with a full page per skill
  plus guides (installation & updating, getting started, the documentation
  model); README slimmed to the essential first-use happy path with links
  into `docs/`.

## [0.1.0] - 2026-07-21

### Added
- Initial release: 13 skills — `config`, `protocols`, `flow`, `grill`,
  `librarian`, `work`, `tests`, `hunt`, `tdd`, `refactor`, `commit`,
  `release`, `sync-configs` — installable as the Claude Code plugin
  `supermodo` or via `npx skills add supermodo/skills`.
- `config` and `protocols` as core dependencies of every skill; `protocols`
  doubles as package help and install doctor.
- The strict docs convention, `skills.config.json` contract, twin-model
  grilling, per-stage `flow` pipeline, and the shared protocol masters.
- `config` first-run bootstrap as a one-step-at-a-time wizard (`Step N of
  M` + context + default), with an agent-team step that can propose a
  project-grounded roster, and a full-answer recap before the dry-run.
- `release` skill: versioned releases with git-flow discipline —
  deterministic preflight, commit-driven bump suggestion, drafted
  changelog, gated squash/tag/publish; `light` and `full` modes.
- `confirmations` config section: consent-gate policy (`ask` default |
  `auto`, global or per skill).
