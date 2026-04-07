# 2026-04-07 install prompt reliability fix

## Goal
- Make the install CTA visible on more devices and browsers, especially iOS and unsupported Android browser cases.
- Avoid permanently hiding the install CTA after one dismissal.
- Reduce the chance that users miss the install CTA by replacing full disappearance with a compact collapsed state.

## Plan
- [x] Inspect the current install banner DOM, CSS, and event flow.
- [x] Add eligibility detection, iOS/manual fallback guidance, and dismissal expiry.
- [x] Replace full auto-hide with a compact collapsed install state and verify layout behavior.
- [x] Run project verification and summarize the supported/non-supported cases.

## Review
- The install banner now appears for non-installed mobile users even before `beforeinstallprompt` fires, then upgrades to the native prompt path when the event becomes available.
- iOS, in-app browsers, and unsupported browser contexts now receive manual install guidance instead of a missing CTA.
- Banner dismissal now expires after 7 days instead of hiding the CTA forever.
- The full banner now collapses into a compact state after a short delay instead of disappearing completely, making the CTA easier to rediscover.
- Added `apple-mobile-web-app-capable` and switched the Apple touch icon to the PNG app icon for better iOS install metadata.
- Verified with `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, and `node --check js/pwa-install.js`.
