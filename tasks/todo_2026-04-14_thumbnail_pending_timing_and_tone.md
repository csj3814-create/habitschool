# 2026-04-14 Thumbnail Pending Timing And Tone

## Goal

- Prevent the `썸네일 제작중` state from appearing during file selection / pre-upload before the media is actually saved into the daily record.
- Keep the intermediate thumbnail state visible only after the original media is committed.
- Tone the UI down so it reads like a subtle processing state, not a primary alert badge.

## Plan

- [x] Review where thumb-pending state is toggled during pre-upload, save, and reload flows
- [x] Restrict the visible state to committed media only
- [x] Restyle the pending indicator to be softer and blur-based
- [x] Verify with tests and bundle checks

## Notes

- The current `startTrackedUpload()` flow marks the upload as complete as soon as the original file transfer finishes. That happens before the record save is fully committed, so showing `썸네일 제작중` there feels too early.
- Saved/reloaded media already have separate state restoration paths via `persistSavedPreview()`, `persistSavedExerciseBlock()`, and `loadDataForSelectedDate()`, so the pending state can stay scoped to those committed paths.

## Review

- Root cause:
  - The pending indicator was attached to the pre-upload lifecycle in `startTrackedUpload()`, so the UI could show `썸네일 제작중` before the record itself was saved.
  - The first visual treatment also looked like a primary alert badge, which over-emphasized a temporary background refinement step.
- Fix:
  - Removed the early visibility toggle from the pre-upload completion path so selection/pre-upload alone no longer shows a thumbnail-pending state.
  - Kept the indicator scoped to committed media paths that already have a saved original URL.
  - Softened the design into a blur-first, low-contrast overlay treatment so the media remains the focus.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
