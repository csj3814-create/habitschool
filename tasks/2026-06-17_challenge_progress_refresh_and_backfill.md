# 2026-06-17 Challenge Progress Refresh And Backfill

## Plan
- [x] Review challenge-related lessons and current worktree
- [x] Trace challenge start recovery UI and asset refresh flow
- [x] Trace daily log save to challenge progress reconciliation
- [x] Allow late uploads to count for the selected challenge date
- [x] Make completed-day progress more visible in challenge cards
- [x] Add regression tests and run verification

## Notes
- User report: tapping challenge start can stay in an on-chain recovery/wait state, and the active challenge only appears after leaving/reopening the app.
- User wants habit records uploaded the next day for the previous date to count toward active challenges.
- Current screenshot shows active 30-day challenge progress as a small ring only; progress should be clearer as completed days out of total.

## Review
- Root cause: challenge progress refresh used an implicit KST today instead of the selected daily log date, so late uploads for a prior date could receive points without being injected into challenge reconciliation.
- Root cause: challenge start/recovery treated asset display refresh failures as mutation failures, so the Firestore challenge could exist while the UI still looked stuck until app restart.
- Fixed `updateChallengeProgress` to accept `dateStr` and `dailyLogData`, merge that log into range reconciliation, and refresh asset display via a non-throwing mutation refresh helper.
- Fixed save follow-up and asset late-projection calls to pass challenge progress date context.
- Added visible challenge progress text in active/claimable cards.
- Verification: `npx vitest run tests/challenge-qualification.test.js tests/challenge-restart-flow.test.js`; `npx vitest run tests/pwa-versioning.test.js tests/progressive-loading.test.js`; `npm test`; `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`; `git diff --check`.
- Browser QA: local app loaded at `http://127.0.0.1:4173/`, title and meaningful DOM rendered, no error/warn logs. Screenshot capture through Browser CDP timed out, so no screenshot artifact was produced.
