# Findings

Evidence carried in by the promotion — the run artifact under
`.skills/supermodo/` is gitignored and does not survive a clone.

## HNT-20260803141500-004 — nonce is never checked

- severity: high · kind: defect · `src/api/sign.ts:88`
- evidence: `verify()` reads the nonce and returns without comparing it.
- impact: a captured request replays indefinitely.
- fix: compare against the stored nonce window, reject on repeat.

## HNT-20260803141500-011 — expiry compared with `<`

- severity: high · kind: defect · `src/api/sign.ts:114`
- evidence: `now < exp` accepts a request at exactly `exp`.
- impact: one-second window past expiry.
- fix: use `<=`.
