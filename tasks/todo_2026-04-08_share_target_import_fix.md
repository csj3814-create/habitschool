# 2026-04-08 share target import fix

## Goal
- Fix the Android share-target diet import flow so shared photos are actually placed into meal slots.
- Remove the hard dependency on the EXIF helper for basic shared-photo saving.
- Re-evaluate whether the share-target UX is worth keeping given Android share-sheet ranking limits.

## Plan
- [x] Find the exact source of the `이미지 분석 모듈이 없습니다.` alert.
- [x] Refactor shared-photo import so it feeds raw `File` objects into the diet slot assignment flow directly.
- [x] Fall back to `lastModified` date/time when EXIF metadata is unavailable instead of blocking the upload.
- [x] Run verification and summarize the UX tradeoff.

## Review
- The failure came from `window.smartUpload()` requiring `EXIF` to exist before it would assign any diet photos.
- Shared photos now bypass the temporary synthetic file input and go straight into `importDietFilesIntoEmptySlots(files)`.
- Diet auto-assignment now attempts EXIF first, but falls back to the file `lastModified` timestamp in KST when EXIF is unavailable.
- The fix keeps the date guard in place, so shared photos taken on a different day are still excluded instead of silently saved.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `node --check sw.js`

