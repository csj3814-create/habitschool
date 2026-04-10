# 2026-04-10 Staging Google Login Regression

## Plan
- [x] Inspect the staging Google login completion flow and recent client/runtime changes.
- [x] Identify the exact failure point after popup login and implement the minimal fix.
- [x] Verify with tests/build checks and document the outcome.

## Notes
- Symptom: On staging, Google popup login opens and account selection succeeds, but the app stays on the first screen instead of moving into the authenticated dashboard flow.

## Findings
- The Google popup success path forced `window.location.reload()` in two places: immediately after `signInWithPopup()` resolved and again inside `onAuthStateChanged()` when `_isPopupLogin` was set.
- On mobile browsers, that eager reload can happen before Firebase Auth persistence fully settles in the opener tab, leaving the app back on the landing state even though the popup login itself succeeded.
- The minimal fix was to let `onAuthStateChanged()` complete the signed-in transition naturally instead of forcing a reload, and to disable the login button while popup auth is in flight so duplicate clicks do not stack.

## Verification
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`

## Review
- The change is intentionally narrow to the popup login flow in `js/auth.js`.
- No deployment has been done yet; staging still needs an explicit deploy after user confirmation.
