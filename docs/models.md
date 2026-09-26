# Models — enrol the engines you have, approve once, every skill seats them

supermodo does not hard-code which model plans, reviews, finds or verifies.
Each skill ships a **sequence** of roles (planner, adversary, finder,
verifier, test-designer, …); each role names the **engine class** it needs;
you assign the models you actually have to those classes, once, in a
per-user registry; a deterministic **broker** seats them before anything
runs and records what actually ran.

## Engine classes

| class | what it needs | typical roles |
| --- | --- | --- |
| `lead` | your strongest reasoner; produces the plan or diagnosis | planners, investigators |
| `adversary` | a strong reasoner you trust to judge other models' work; always read-only | reviewers, verifiers, the judge, the test-designer |
| `leg-work` | cheap, fast, parallel; output is verified downstream | hunt finder lanes, the tests audit fleet |
| `long-context` | a large window at low cost per token; returns an index, never a summary | context gatherers |
| `code-generation` | authors code or patches as text; grants no write access by itself | implementers |
| `judgment` | typed answers only (choice / probability / score); may only escalate, order or flag | router, ranker, matcher, sentinel |

A project can add its own classes (`s-<name>`, extending a shipped class) in
`skills.config.json`; the vocabulary is open.

## Enrol and assign (`config --models`)

```
config --models enrol astra --lineage openai --transport adapter --adapter codex --pin gpt-6-astra
config --models enrol opus5 --lineage anthropic --transport adapter --adapter claude --pin claude-opus-5
config --models enrol flash --lineage google --transport adapter --adapter agy --pin gemini-3.8-flash-high
config --models enrol jev --lineage typesafe --transport http-typed --endpoint https://api.typesafe.ai/v1/systemone --key-env TYPESAFE_API_KEY --pin jev-1.13.0
config --models assign adversary astra --effort xhigh
config --models show
```

Every model carries an **exact pin** — the provider's model id — and the
broker passes it on every call; if the CLI or API serves a different model,
the seat FAILS rather than running something you did not approve. Effort
sits on the assignment, so one model can serve two classes at two efforts.
Keys are never stored: `--key-env` names an environment variable.

Transports: `adapter` (`claude`, `codex` — repository-reading seats whose
read-only flags the package re-asserts on every call; `agy` — Antigravity:
text seats by default, repository seats once you accept that they run in a
sandboxed copy of your committable files with the network open —
`config --models consent <id>`, or approve the row flagged `network open`),
`http-chat` (an OpenAI-compatible endpoint), `http-typed` (a
typed-answer endpoint such as TypeSafe's Jev), `native` (a host alias such
as `sonnet`, never pinnable). A model with no adapter waits for one; there is
no custom-command transport.

## The first run asks once

The first time a skill needs a class you have not assigned, it shows ONE
table — class, the roles it feeds, a proposed model and effort, flags such as
"same lineage as host" or "sends snippets off-machine" — and asks: approve
all, change rows by number, or decline. Approval is saved; you are asked
again only when your pool of enrolled models changes. Nothing is ever seated
without that approval, including the host model itself (it is a row you can
approve for a class).

## Variants and independence

Each skill ships a few variants of its sequence (`standard` by default,
`same-lineage` for a single-vendor setup, `deep` with judgment seats). Every
seat of the chosen variant must be staffable or the skill does not start —
it tells you which seat and why, and asks you to staff it, pick a fully
staffed variant, or abort. Every report states the independence actually
reached: **cross-lineage** (independent verification), **same-lineage**
(reviewed, not independent — versions and effort levels of one model never
count as independent), or **none** (verification absent). A seat that fails
at run time stops the run; nothing is substituted.

Project policy in `skills.config.json` (`multimodel`) can only restrict:
forbid or require models by pin or `lineage:<x>` per role, pick a variant per
skill, cap concurrency. Model records and assignments live only in your
registry (`~/.config/supermodo/`), never in the repository.

Requires: `protocols`, `config`.
