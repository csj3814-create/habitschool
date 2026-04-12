# 2026-04-12 Media Upload Background And Persistence

## Goal
- Make short video and photo uploads feel fast enough for everyday use.
- If uploads still take time, keep them running in the background while the user can move to other tabs.
- Never delete already uploaded media for the same day unless the user explicitly removes it.

## Plan
- [x] Inspect the current media upload and daily log save flow
- [x] Implement non-destructive media merge and background upload UX
- [x] Show per-file upload progress for photos and videos
- [x] Verify with tests and bundle checks

## Review
- Saving no longer waits for every pending media upload to finish before writing the daily log.
- New media uploads can continue in the background after save, with a floating status chip so the user can move to other tabs.
- Each photo/video upload slot now shows its own progress percentage, completion, and failure state instead of leaving the user guessing during longer uploads.
- Exercise media now keeps stable `mediaId` values and merges against existing records instead of replacing the entire list blindly.
- Existing media is preserved unless the user explicitly removes it.
- Static image uploads now start only after the selected-date validation passes, so cancelling a mismatched file no longer kicks off a hidden upload first.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
