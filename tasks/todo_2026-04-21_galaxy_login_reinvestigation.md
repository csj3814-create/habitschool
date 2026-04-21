# 2026-04-21 Galaxy Login Reinvestigation

## Plan
- [x] Re-read the current Samsung/Galaxy Google login flow and identify where pending login state can be lost on mobile.
- [x] Implement a root-cause fix for the first-screen bounce and add regression coverage.
- [x] Verify with tests and bundle checks.

## Review
- Root cause 1: the Samsung redirect pending-login marker only lived in `sessionStorage`, so a mobile browser/app round-trip could lose the marker and let the logged-out shell repaint immediately.
- Root cause 2: the redirect recovery timer always cleared pending state after 4 seconds whenever `auth.currentUser` was still null, which effectively cut off the grace window before slower mobile auth restoration could finish.
- Fix: keep a persistent redirect fallback marker in `localStorage`, mirror it back into `sessionStorage` on return, and poll the recovery window until auth restores or the full grace period expires.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`
