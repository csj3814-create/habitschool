# 2026-04-07 push notifications upgrade

## Goal
- Send real push notifications for friend and social challenge events, not just in-app notifications.
- Replace automatic notification permission prompting with a direct user-triggered flow that works better for iPhone home screen apps.
- Clarify current PWA notification capability limits while keeping the implementation simple.

## Plan
- [x] Inspect the current token registration flow, service worker handling, and friend/challenge notification creation paths.
- [x] Add direct notification permission UI and token sync logic for supported browsers, including iPhone install guidance.
- [x] Extend Cloud Functions to send FCM pushes for friend/challenge events and verify the updated flow.

## Review
- Added a direct notification permission card in the profile area so users can opt in with an explicit tap instead of an automatic prompt.
- Changed token sync to reuse the existing single `fcmToken` field and refresh it only after permission is granted on a supported browser or installed iPhone home screen app.
- Extended Cloud Functions so friend requests, friend responses, social challenge invites, challenge starts, pending updates, cancels, and settlements now send real web push notifications in addition to in-app documents.
- Updated the service worker notification click handling so push taps focus an existing app window or navigate to the requested route.
- Verification completed with `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, `node --check functions/index.js`, and `node --check sw.js`.
