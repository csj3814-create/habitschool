# 2026-07-07 Challenge progress after media save

## Report
- User completed diet, exercise, and mind records for the 3-day mini challenge.
- The asset tab still showed `2/3일 완료` until the app was backgrounded and foregrounded.
- After returning to the app, the same challenge showed `3/3일 완료` and claimable success.

## Plan
- [x] Trace the save flow from media upload completion to `updateChallengeProgress()`.
- [x] Compare immediate post-save daily log payload with the later foreground refresh payload.
- [x] Patch the flow so challenge progress uses the latest committed daily log after background media patches.
- [x] Add regression tests around background media completion and challenge progress.
- [x] Run required verification and bump PWA version for runtime changes.

## Review
- Root cause: `runBackgroundMediaSyncJobs()` built `latestCommittedData` after media URL patches, but `onSettled` called post-save follow-ups without passing it.
- The challenge recompute therefore used the initial `saveData`, while foreground/app-return refresh later loaded the updated daily log and displayed the correct success state.
- Fix: post-save follow-ups now accept a daily log payload and background media settlement passes `latestCommittedData` with a cache fallback.
- Version: bumped runtime cache from `v224` to `v225`.
- Verification: `npm test`, esbuild browser bundle check, `npm run check:en`, and `git diff --check` all passed.
