# 2026-04-08 notification browser guide

## Goal
- Replace vague denied-permission text with a browser-specific visual guide.
- Show users exactly where to tap when browser notification permission has already been blocked.
- Keep the guide understandable even when browser UI differs slightly by browser family.

## Plan
- [x] Inspect current notification card and modal patterns for a lightweight guide modal.
- [x] Add browser-aware visual guide content and connect the denied state button to it.
- [x] Run bundle/test verification and capture the lesson.

## Review
- Added a dedicated notification permission guide modal with a dark overlay and browser-specific step panels.
- Changed the denied-permission state from a disabled button into an active `설정 안내 보기` action that opens the guide instead of showing a long alert.
- Added browser-aware visual guidance for Android Chromium browsers, desktop Chromium browsers, iPhone/iPad, and a generic fallback.
- Simplified the modal footer to a single `확인했어요` action because the extra `닫기` button did the same thing.
- Verified with `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js` and `npm test`.
