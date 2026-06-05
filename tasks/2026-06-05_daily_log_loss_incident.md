# 2026-06-05 Daily Log Loss Incident

## Plan
- [x] Review relevant persistence and reload lessons
- [x] Trace exercise and mind save flows from UI state to Firestore writes
- [x] Trace dashboard score rendering and stale/cache fallback paths
- [x] Identify why completion could appear locally without durable daily log persistence
- [x] Patch safeguards so stale loads cannot overwrite completed local/server records
- [x] Add regression tests for the incident pattern
- [x] Run full verification

## Notes
- User report: exercise and mind were completed enough to show 65 points, but after refresh the dashboard showed only 50/65. A habit group briefly looked unjoined, then normalized after refresh.
- Root cause found: the primary daily log save wrapped `setDoc()` in a timeout helper that resolved `null` after 5 seconds. The caller did not check that value and immediately set `primarySaveAcknowledged = true`, so a slow/hung Firestore write could be treated as a successful server save.
- Impact: the UI updated local cache and points from unsafely acknowledged data. After refresh, Firestore did not have the exercise/mind changes, so the dashboard fell back to the durable server state.
- Fix: the primary daily log save now uses a rejecting timeout. If Firestore does not ACK, the save path retries once and then routes the full daily log payload into the offline outbox instead of showing it as durably saved.

## Review
- `npm test` passed: 45 test files, 321 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` passed.
- `node --check functions\runtime.js` passed.
- `git diff --check` passed with line-ending warnings only.
