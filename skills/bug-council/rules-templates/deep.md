---
rule: bug-council
description: Full council — several seats, falsification rounds, independent verify
default: true
template: deep
summary: >
  THIS IS THE MOST EXPENSIVE THING IN THE PACKAGE. Several independent agent
  seats investigate one bug blind, then attack each other's hypotheses, run
  discriminating experiments, and a separate agent verifies the patch.
  Expect a large token spend — seats multiplied by rounds, on ONE bug.
  Nineteen steps in three phases: intake, investigation, fix and verification.
  For ordinary bugs use `tdd --debug`; to find unknown bugs use `hunt`.
---

## Council composition

The seats are the `deep` variant of the skill's `sequence.json`, staffed
through the broker from the user's approved model assignments. Name the seats
that actually ran in the report, with their models — a seat that failed to
launch is its own bar in the chart, never folded into another.

## Mode

Deep: initial blind investigation, adversarial falsification, a rebuttal round,
discriminating experiments, independent adjudication.

## Cost

Set expectations before the first seat is spawned. State the seat count and the
round count, and that this runs against ONE bug. Two bugs are two runs, or none.
