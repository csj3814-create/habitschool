# 2026-04-08 phase-1 pwa upgrades

## Goal
- Make the installed PWA feel closer to a real mobile app without introducing native-only dependencies.
- Improve how users re-enter key flows from notifications and app icon shortcuts.
- Add low-friction unread signaling through the installed app icon badge.

## Plan
- [x] Audit current manifest, service worker, notification payloads, and tab routing for safe phase-1 upgrades.
- [x] Fix and expand manifest shortcuts for the installed app.
- [x] Add notification deeplinks and service-worker action handling for friend/challenge flows.
- [x] Update app boot/tab routing to honor deeplink params and sync icon badge state from actionable pending items.
- [x] Run verification and document what shipped versus what remains for a later share-target phase.

## Review
- Shipped:
  - Clean UTF-8 manifest copy and four installed-app shortcuts for 식단 촬영, 운동 기록, 친구 챌린지, 친구 초대.
  - Service worker notification action handling with action-specific deep links for friends/challenges/reminders.
  - App boot deep-link routing so notification and shortcut entry points focus the right tab/card/modal.
  - App icon badge sync for actionable pending items: incoming friend requests and pending social challenge invites.
  - Login-time server refresh so badge state is restored even before the user opens the relevant cards.
- Verification:
  - `node --check functions/index.js`
  - `node --check sw.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- Deferred:
  - `share_target` based direct photo ingest remains a later phase because it needs a safer end-to-end path for multipart/shared-file handling on the current Firebase Hosting + service worker setup.
