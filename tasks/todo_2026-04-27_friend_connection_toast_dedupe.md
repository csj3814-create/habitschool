# 2026-04-27 Friend Connection Toast Dedupe

## Goal
- Stop the same friend connection success toast from appearing on every login.
- Identify whether the repeated message comes from invite-link auto-acceptance, pending request response handling, or friendship cache hydration.

## Checklist
- [x] Trace friend connection toast call sites.
- [x] Identify the repeated-processing condition.
- [x] Patch idempotent toast/connection handling.
- [x] Add or update regression tests.
- [x] Run verification.

## Review
- Started after the user reported `공감케어님과 연결됐어요.` showing again on every login.
- The repeated toast comes from `checkChallengeNotifications()`, not from accepting the friend request again.
- Existing logic only used `challengeNotifSeen_{uid}` timestamp in localStorage, so if that checkpoint was missing, stale, or concurrent dashboard renders read it before it was written, the same `friend_connected` notification could be displayed again.
- Patch adds notification document ID dedupe in localStorage plus an in-memory per-session set, and marks notifications seen before showing toasts.
- Verification: targeted notification tests passed, `npm test` passed 37 files / 257 tests, and esbuild bundle check completed.
