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
- Because the host for static-image pending UI is the full `.upload-area`, the setter itself also needs to reject empty-slot cases. Otherwise a later caller can still surface the badge on a blank box.

## Review

- Root cause:
  - The pending indicator was attached to the pre-upload lifecycle in `startTrackedUpload()`, so the UI could show `썸네일 제작중` before the record itself was saved.
  - The first visual treatment also looked like a primary alert badge, which over-emphasized a temporary background refinement step.
- Fix:
  - Removed the early visibility toggle from the pre-upload completion path so selection/pre-upload alone no longer shows a thumbnail-pending state.
  - Kept the indicator scoped to committed media paths that already have a saved original URL, and added a final guard in the setter so blank slots cannot display the state even if another path requests it.
  - Softened the design into a blur-first, low-contrast overlay treatment so the media remains the focus.
  - Bumped asset/service-worker versions so staging reliably receives the latest JS/CSS instead of a previous cached copy.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`

## Follow-up

- A second follow-up fix tightened the render guard again so thumbnail-pending now requires a real preview `src`, visible computed styles, and non-zero rendered dimensions. This specifically targets cases where the slot looked blank even though saved metadata existed.
- A third follow-up fix removed thumbnail-pending from photo flows entirely. Diet, sleep, and cardio images now just show the original image; only strength-video uploads may surface `썸네일 제작중` while their poster image is being prepared.
- A fourth follow-up fix moved that policy into `setThumbPendingState()` itself, so even if a photo path accidentally calls the helper later, non-strength hosts immediately clear the badge and refuse to render it.
