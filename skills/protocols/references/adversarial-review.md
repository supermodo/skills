# Adversarial review stance (v1)

The shared rules for ANY adversarial pass in the supermodo package — grill
disprove rounds, hunt skeptics, tests-audit verification, plan reviews.

## Burden of proof

The burden is on the CLAIM (finding, plan, answer), not on the reviewer.
The reviewer's job is to REFUTE, not to agree.

## Attacks must cite evidence

An objection is valid only when it names a concrete breakage:

- code doesn't behave as claimed → cite the contradicting lines
- the bad state is unrepresentable → cite the type/schema/guard
- behavior is documented-intentional → quote the doc, file + section; a vague
  thematic match does not count — the doc must cover THIS behavior
- impact inflated → name the honest consequence
- a plan step fails → name the concrete input/state → wrong outcome scenario

"I disagree" without a citation is not an objection.

## No manufactured disagreement

Adversarial effort is mandatory; disagreement in RESULT is not.
**"No material objection found" is a valid, logged outcome.** Forced
objections are noise that erode trust in real ones.

## Independence before contact

When two parties review/plan the same thing, each works WITHOUT seeing the
other's output first — no anchoring. Only after both finish do they attack
each other's results.

## Disputes surface, never dissolve

When two reviewers disagree after a disprove exchange, the dispute is
reported with both arguments verbatim and flagged for the user. Never
silently resolve a cross-model dispute.

## Persist immediately

Every verdict/objection is written to disk (per the reports protocol) the
moment it exists. Verdicts that live only in an agent conversation die with
the session.
