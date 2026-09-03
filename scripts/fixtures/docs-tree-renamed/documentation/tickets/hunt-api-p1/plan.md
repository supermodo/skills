# Plan

The finder's suggested fixes, taken as the starting approach rather than as
decisions already made.

1. Add a nonce window to the verifier and reject repeats.
2. Correct the expiry comparison to `<=`.

Risk: the nonce window needs a store; an in-memory one does not survive a
restart, which is a separate decision if this ever runs multi-process.
