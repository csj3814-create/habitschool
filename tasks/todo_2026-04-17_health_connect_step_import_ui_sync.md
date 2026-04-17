# 2026-04-17 Health Connect Step Import UI Sync

## Goal

- Make Health Connect imports update the visible exercise step input and ring immediately.
- Prevent stale saved step data from overwriting a just-imported native step count in the same session.

## Plan

- [x] Trace the native import toast path and the saved-step restore path
- [x] Add a small helper that decides when the current-session native import should win over saved step data
- [x] Reapply the preferred native import after `loadStepData()` when viewing today
- [x] Add regression tests for the import-priority helper
- [ ] Verify the fixed flow on staging APK after deploy

## Review

- The bug was a race between two valid paths: native import deep-link handling updated the UI and showed the toast, then `loadStepData()` restored older Firestore step data and rewrote the visible input/ring.
- The fix keeps the current-session Health Connect import as the preferred visible state for `today` when it is newer or different from saved step data, while still letting saved data win for past dates.
- The decision logic now lives in `health-connect-utils.js`, which makes the precedence rule testable instead of burying it in `app.js` timing.

## Verification

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
