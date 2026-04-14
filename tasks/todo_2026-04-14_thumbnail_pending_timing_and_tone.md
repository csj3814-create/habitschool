# 2026-04-14 Thumbnail Pending Timing And Tone

## Goal

- Prevent the `썸네일 제작중` state from appearing before the media is actually usable.
- Keep any intermediate thumbnail state subordinate to the real media preview.
- If the feature keeps regressing the core UX, remove it and return to the pre-feature baseline.

## Plan

- [x] Review where thumb-pending state is toggled during pre-upload, save, and reload flows
- [x] Restrict the visible state to committed media only
- [x] Restyle the pending indicator to be softer and blur-based
- [x] Verify with tests and bundle checks
- [x] Roll back the `썸네일 제작중` UI entirely at the user's request

## Notes

- The original `startTrackedUpload()` flow marked the file transfer as done before the record save and later thumbnail patch fully settled, which made the pending state easy to mis-time.
- Saved and reloaded media already use separate restoration paths through `persistSavedPreview()`, `persistSavedExerciseBlock()`, and `loadDataForSelectedDate()`.
- Recent fixes also added safer pending-upload preservation and saved-video fallback handling, so a full rollback should keep those lower-level fixes while removing only the badge/blur UI concept.

## Review

- Root cause:
  - The pending indicator was attached to several different lifecycle stages and kept conflicting with what the user could already see on screen.
  - That made the UI feel contradictory: a real image or video frame could be visible while the product still insisted that thumbnail creation was "in progress".
- Final fix:
  - Removed badge creation and blur styling for `썸네일 제작중`.
  - Removed the remaining auto-show conditions so the app no longer tries to decide when the pending badge should appear.
  - Kept the newer upload and thumbnail persistence fixes underneath so background thumbnail storage can still complete without the extra status chrome.
  - Bumped asset and service-worker versions so staging reliably receives the rollback.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`

## Follow-up

- Earlier follow-up fixes tightened render guards, limited the state to videos, preserved pending uploads during replacement saves, reused local video thumbnails, and kept background thumb backfills alive.
- The current follow-up supersedes the UI part of those iterations by removing `썸네일 제작중` from the product surface entirely.
- If old records still lack a persisted `videoThumbUrl`, the remaining behavior is to show the best available preview (saved thumb, cached local thumb, or live video frame) without any extra pending badge.
