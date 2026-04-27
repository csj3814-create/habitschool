# 2026-04-27 Production Script 404 Audit

## Goal
- Identify why production shows repeated script 404 errors after the v169 deployment.
- Fix any missing deploy artifact, stale service worker precache entry, or wrong module import path.

## Checklist
- [x] Compare production script URLs against local files.
- [x] Check service worker precache entries for missing assets.
- [x] Patch the root cause.
- [x] Verify with tests and bundle checks.
- [ ] Deploy follow-up if code changes are required.

## Review
- Current production v169 JS/CSS/script assets respond with 200.
- `/firebase-messaging-sw.js` returns 404 in production and can be requested by Firebase Messaging's default service worker path, especially from stale clients or default FCM registration paths.
- Added a compatibility `firebase-messaging-sw.js` wrapper that imports the canonical `/sw.js`.
- Added no-cache hosting headers and service worker cache coverage for the compatibility path.
- Bumped browser cache version to `v170`.
- Verification passed: focused PWA tests, full `npm test`, and app esbuild bundle.
