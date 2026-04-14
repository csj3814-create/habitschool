# 2026-04-14 PWA Audit

## Plan
- [x] Review recent PWA lessons and related task notes
- [x] Inspect manifest and installability requirements
- [x] Inspect service worker caching/update behavior
- [x] Inspect app-shell boot, auth recovery, and install CTA flows
- [x] Summarize findings and recommended fixes

## Notes
- Audit request: check current PWA app quality and identify anything worth fixing before more feature work.
- Focus areas: manifest, service worker, offline/cache strategy, auth/install recovery, Samsung Internet/mobile behavior.

## Review
- Findings:
  - Asset versioning and precache strategy have drifted apart. `index.html` loads versioned assets, `main.js` imports older version-pinned modules, `pwa-install.js` still registers `sw.js?v=134`, and `sw.js` precaches unversioned files. This makes updates non-deterministic and increases stale-client risk in installed PWAs.
  - Simple-mode profile install CTA ignores `installState.visible` and always forces the install bottom bar for any non-standalone session.
  - Manifest metadata is installable, but `screenshots` is empty, so richer Android install surfaces lose preview context.
  - Background notification icon/badge defaults still use SVG assets, which is fragile on Android notification surfaces compared with PNG badges.
- Implemented:
  - Unified the current PWA release version to `156` across `index.html`, `js/main.js`, `js/app.js`, `js/auth.js`, `js/pwa-install.js`, and `sw.js`.
  - Updated the service worker precache list to include the same versioned app-shell entry assets that `index.html` actually loads.
  - Restored the missing `installState.visible` gate in the simple-profile install CTA path so the install bottom bar only appears when the CTA is eligible.
  - Switched background notification fallback icon/badge assets from SVG to PNG.
  - Added `tests/pwa-versioning.test.js` so version drift between HTML, JS entrypoints, and the service worker is caught in CI.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`
  - `node --check sw.js`
  - `node --check js/pwa-install.js`
