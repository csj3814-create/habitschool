# 2026-04-08 multi-device push notification upgrade

## Goal
- Let one Habitschool account receive web push notifications on multiple devices instead of only the last registered token.
- Keep old clients working during rollout by preserving a legacy fallback path.
- Clean up invalid tokens automatically and avoid duplicate sends when the same token appears in multiple places.

## Plan
- [x] Inspect the current single-token registration flow, server fanout path, and Firestore rules.
- [x] Move current-device registration to a per-device subcollection under `users/{uid}/pushTokens/{deviceId}`.
- [x] Update server fanout helpers to read multi-device token docs first and legacy `users/{uid}.fcmToken` as fallback.
- [x] Keep current-device disable working and remove stale legacy/root tokens when they match the current token.
- [x] Add Firestore rules for the new push token subcollection and clean up account deletion flow.
- [x] Run verification and summarize rollout notes.

## Review
- Current-device push registration now writes to `users/{uid}/pushTokens/{deviceId}` while still updating legacy `users/{uid}.fcmToken` as a rollout fallback.
- Notification fanout now reads per-device token docs first and deduplicates them with any legacy root token before calling FCM.
- Invalid push tokens now delete their matching token docs and any legacy root token reference in the same cleanup pass.
- Daily reminder, streak alert, direct user pushes, and admin broadcast all use the new multi-device fanout path.
- Account deletion now removes the `pushTokens` subcollection so orphaned token docs do not survive after the main user document is deleted.
- Firestore rules now allow owners to manage `users/{uid}/pushTokens/{deviceId}` docs with a narrow field whitelist.
- Verification:
  - `node --check functions/index.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
