---
rule: librarian
description: Lifecycle pass on demand, ADR for durable choices, archive at close
default: true
template: standard
summary: >
  A lifecycle pass runs on demand and at flow stage 7, never on a schedule.
  Completed work is verified against code, then promoted and archived in one pass.
  A durable choice with a real alternative earns an ADR; everything else is a note.
  Docs over the configured size cap are split at responsibility boundaries.
  The backlog is groomed during the same pass, never as a separate ritual.
  Anything not established by code or evidence is reported, never written.
---

## When a pass runs

On demand, and as `flow` stage 7. Not on a schedule and not opportunistically
during other work — a pass that runs when nobody asked writes changes nobody
reviewed.

## Lifecycle pass

1. Run the docs checker; its complete issue list is the worklist for the pass.
2. Split live docs over the configured size cap at responsibility boundaries,
   leaving a short landing document at the stable path, and repair links.
3. For completed work: verify the behaviour against code and evidence, promote
   current contracts to the reference tree and durable choices to ADRs, then
   archive the whole work folder verbatim under the convention's flattened
   naming.
4. Validate ADR supersession metadata.
5. Promote an assumption only when evidence, verification date and revalidation
   trigger are all recorded.
6. Regenerate navigation, then re-run the checker.
7. Review reference docs whose governed code changed: repair mechanical drift,
   ask about substantive conflicts.
8. Reconcile the agent instructions and roster with current contracts.
9. Groom the backlog in the same pass: strike what is obsolete, graduate what
   is ready.

## What earns an ADR

A choice that is durable, costly to reverse, and had a real alternative
somebody could have picked. Anything else is a line in the reference tree.
An ADR records the choice and the alternative, never the implementation.

## Archive cadence

At close, per item, inside the pass that verified it — not batched monthly. A
finished item left live is an item the board keeps offering.

## Intake depth

`--task` interviews until scope, non-goals and acceptance evidence are settled,
then writes the triad. Open questions that are genuinely the user's are written
as unchecked question IDs rather than guessed at.

## Evidence files

Expected on promoted items only. A hand-written triad carries one when the work
started from an investigation, and not otherwise.
