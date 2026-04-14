# 2026-04-14 Samsung Internet Google Login First Attempt

## Goal

- Make the first Google login on Samsung Internet complete in one pass.
- Remove the need to back out of a Google auth tab or try the login button twice.
- Keep the existing popup flow for browsers where it already behaves correctly.

## Plan

- [x] Review the existing popup-login recovery lessons and inspect the current auth flow.
- [x] Route Samsung Internet Google login through redirect auth instead of popup auth.
- [x] Add pending-login recovery so the app can bridge into the signed-in shell if auth finishes while the tab regains focus.
- [x] Run verification and document the result.

## Notes

- The current code already contains a popup-success bridge for slow mobile browsers, but Samsung Internet still opens Google auth as a separate tab-like surface that can strand the user outside the main app after account selection.
- User reports match the older staging regression pattern: first login after cache clear feels incomplete, while backing out or trying again leaves the user signed in.

## Review

- Samsung Internet now uses `signInWithRedirect()` for Google login instead of `signInWithPopup()`.
- Redirect results are recovered on app boot with `getRedirectResult()`, and successful redirect auth bridges the UI into the signed-in shell immediately before the normal `onAuthStateChanged()` hydration finishes.
- A pending-login session marker was added so the app can recover the signed-in shell on `pageshow`/`focus` if auth state becomes available while the browser is returning from an auth surface.

## Verification

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`

## Result

- Added a Samsung Internet-specific redirect login path plus redirect-result recovery on boot.
- Added a short-lived pending-login marker so the signed-in shell can recover on `pageshow` / `focus` if auth completes while the browser is returning from Google.
- Rotated `main.js` and service-worker cache versions so real devices receive the login-flow change instead of a stale cached auth bundle.
