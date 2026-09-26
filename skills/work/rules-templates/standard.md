---
rule: work
description: Docs-routed implementation with a teammate roster and an independent-lineage review
default: true
template: standard
summary: >
  Start at the docs router, load the task's context chain, interview on what is
  genuinely undecided, then implement under the project's own conventions.
  Teammates come from the configured agent roster; without one, run single-agent
  and apply each role's checklist inline.
  Configured test tiers run after every change and again at task completion.
  When the task is done, an adversary seat of another lineage reviews the
  diff read-only, from the user's approved model assignments.
---

## Process

1. Read the router, resolve the active triad and its next incomplete task by
   its immutable `<!-- task:slug -->` id.
2. Load the context chain in order: active-work doc, the triad, every linked
   `reference/` contract and `decisions/` ADR, the agent roster.
3. Interview on approach, edge cases, scope and dependencies. In flow mode this
   is skipped — grill already ran it at stage 1.
4. Propose the team and wait for confirmation, then spawn teammates into the
   run's designated tree.
5. Implement. `commands.test` after every change; `commands.testUnit` plus
   `commands.lint` at task completion; `commands.testAll` for
   integration-sensitive work.
6. Adversarially verify the diff through the broker's reviewer seat
   (`review` in `sequence.json`), read-only, with test evidence the
   orchestrator produced.
7. Hand over a clean working tree.

## Where project constraints come from

The conventions prose the config points at (`docs.conventions`), not this file
and not the skill. This file owns the *order*; that document owns the *rules*.

## Testing rhythm

Tiered, from `commands.*`. A tier absent from config is skipped and SAID to be
skipped — never invented, never assumed green.

## Branch and worktree

By default work runs in the main working tree. Projects using
worktree-per-task set `workspace.worktree` in config; the per-run
`--worktree` / `--no-worktree` flags override it either way.
