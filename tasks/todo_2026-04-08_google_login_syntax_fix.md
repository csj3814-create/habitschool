# 2026-04-08 google login syntax fix

## Goal
- Restore Google login after the recent auth/push notification changes.
- Fix the auth script syntax errors without broad auth flow regressions.

## Plan
- [x] Inspect the broken auth.js sections reported by the browser console.
- [x] Repair the malformed string literals and keep the new notification flow intact.
- [x] Run project verification commands and record the result.

## Review
- Fixed the malformed fallback display name strings in the auth state listener that were breaking script parsing before Google login could run.
- Rewrote the new notification permission UI text block so the added push notification flow keeps valid string literals and readable copy.
- Verified with `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js` and `npm test`.
