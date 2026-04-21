# 2026-04-21 Service Worker Console Cleanup

## Plan
- [x] Inspect the current service worker registration flow and likely stale registration paths.
- [x] Switch to a canonical root service worker URL and clean up stale same-origin registrations.
- [x] Verify with test/build checks and document whether the CSP eval warning needs changes.

## Review
- Switched PWA registration from a versioned relative `./sw.js?v=165` URL to the canonical root `/sw.js` with scope `/`.
- Added cleanup for stale same-origin service worker registrations so older abandoned worker script paths do not keep retrying in the background and polluting DevTools with intermittent 404 errors.
- Kept the app CSP `script-src` policy unchanged. The app does not use `eval`, and the DevTools issue reflects the policy blocking string evaluation rather than a required app capability.
- Verified with `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, and `node --check js/pwa-install.js`.
