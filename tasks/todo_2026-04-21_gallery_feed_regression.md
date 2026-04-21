# 2026-04-21 Gallery Feed Regression Investigation

## Plan
- [x] Inspect current gallery feed/tab state, cache, and refresh logic.
- [x] Identify why the gallery can switch from community feed to only the signed-in user's own posts after refresh.
- [x] Implement a narrow fix and verify with tests/build checks.

## Review
- Root cause: on refresh, the gallery could load through the guest REST path before Firebase auth restoration finished. Because gallery cache state did not track whether it came from guest or authenticated loading, the later authenticated gallery render reused the wrong cache instead of fetching the signed-in Firestore view again.
- Fix: track the gallery cache audience (`guest` vs `auth`) and force a fresh fetch whenever the current auth state does not match the existing cache source.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
