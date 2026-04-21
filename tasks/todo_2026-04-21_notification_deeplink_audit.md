# 2026-04-21 Notification Deeplink Audit

## Plan
- [x] Inspect push payload URLs, service worker click handling, and app deeplink routing together.
- [x] Fix `지금 기록` so meal-time diet reminders open the correct in-app recording context.
- [x] Harden general push notification routing so existing app windows are preferred over unrelated same-origin pages.
- [x] Verify with tests/build and capture the lesson.

## Review
- Diet reminder links now support meal-specific `focus` values like `lunch` and `dinner`, not just the old generic upload focus.
- Existing app windows now receive notification target URLs directly, so push clicks no longer depend on whichever same-origin tab the service worker encounters first.
- Added source-level regression checks for service-worker notification routing and diet deeplink handling.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `node --check sw.js`
