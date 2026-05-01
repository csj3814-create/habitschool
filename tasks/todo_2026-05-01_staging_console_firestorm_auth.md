# 2026-05-01 Staging console Firestore/Auth cleanup

## Goal
- Explain and reduce staging login console errors seen on multiple desktop Chrome sessions.
- Keep Google popup login behavior while avoiding avoidable COOP popup noise.
- Prevent Firestore watch-stream internal assertion failures from surfacing as repeated red console errors.

## Checklist
- [x] Inspect Firebase Auth popup and Firestore initialization paths
- [x] Adjust Hosting headers for OAuth popup compatibility
- [x] Adjust Firestore transport/reconnect guard
- [x] Bump PWA asset version for staging verification
- [x] Run tests and bundle verification
- [x] Document result

## Notes
- `Cross-Origin-Opener-Policy policy would block the window.closed call` comes from Firebase Auth popup polling. Login can still succeed, but the browser surfaces it as a red console message.
- `FIRESTORE (10.8.0) INTERNAL ASSERTION FAILED: Unexpected state` is not a user-facing app crash, but it is a Firestore SDK watch-stream exception and should be guarded/recovered.

## Result
- Added `Cross-Origin-Opener-Policy: same-origin-allow-popups` to Hosting headers to keep OAuth popup login compatible while reducing `window.closed` COOP noise.
- Changed Firestore transport from forced long polling to auto-detected long polling and added a targeted guard for the known Firestore watch-stream `Unexpected state` assertion. The guard prevents repeated red unhandled promise noise and schedules reconnect recovery.
- Bumped PWA/module release version to `v172`.
- Verification:
  - `npm test` passed: 39 files, 273 tests
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` passed
  - `git diff --check` passed with line-ending warnings only
