# 2026-06-16 Exercise Video Thumbnail Refresh

## Plan
- [x] Review upload/thumbnail lessons and current worktree
- [x] Trace strength video thumbnail save and reload paths
- [x] Patch the save/background path so refreshed exercise videos have a thumbnail source
- [x] Add regression tests for persisted video thumbnail recovery
- [x] Run project verification

## Notes
- User report: after uploading an exercise video in the exercise tab, the thumbnail is visible immediately, but disappears after refresh.
- Initial hypothesis: `videoThumbUrl` is not reliably persisted, and reload fallback may fail when it tries to derive a frame from the persisted video URL.
- Root cause found: `getStrengthThumbSaveWaitMs()` existed but was not used by the strength video save/background write paths, so the first refreshable Firestore write could contain only `videoUrl`.

## Review
- Imported and applied `getStrengthThumbSaveWaitMs()` in strength video save and background upload paths.
- The save loop now waits briefly for a pending strength thumbnail upload before building the `strengthList` item.
- Background media sync now also waits for thumbnail URLs before its first Firestore media patch when possible.
- Increased thumbnail wait windows to make first-save `videoThumbUrl` persistence more reliable without blocking indefinitely.
- Bumped PWA asset version from `209` to `210` so deployed clients fetch the updated app core and service worker cache.
- Verification passed:
  - `npx vitest run tests/exercise-media.test.js tests/video-upload-resilience.test.js tests/pwa-versioning.test.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
  - `git diff --check`
- Browser smoke:
  - Local app served at `http://127.0.0.1:4173/`.
  - Page title: `해빛스쿨 - 즐겁게 좋은 습관 만들기`.
  - DOM snapshot contained login modal, dashboard shell, and exercise tab.
  - No warning/error console logs were returned.
  - Screenshot capture timed out in the in-app browser, so visual evidence is unavailable.
