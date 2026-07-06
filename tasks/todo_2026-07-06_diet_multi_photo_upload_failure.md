# 2026-07-06 Diet multi-photo upload failure

## Report
- User still sees `일부 업로드 실패` after uploading multiple diet photos on production/staging despite v223 media retry changes.
- Screenshot shows diet photo previews are visible, but retry badges remain on multiple meal slots and the bottom tracker reaches 100% with failure state.

## Plan
- [x] Trace how background media jobs become failed for multiple diet photos.
- [x] Check whether Storage transfer, selected-file retry, or Firestore daily log patch is being counted as the user-facing failure.
- [x] Patch the root cause without hiding real terminal upload failures.
- [x] Add regression tests for multiple diet photo saves.
- [x] Run project verification and bump PWA version if client code changes.

## Review
- Fixed in client runtime and covered with regression tests.

## Findings
- v223 reduced one retry gap but still allowed two fragile cases:
  - Samsung Internet simple uploads could run concurrently and race each other into timeout on mobile uplinks.
  - When an early upload failed or timed out, the background retry path depended on `input.files` still being populated; mobile browsers can clear that even while the preview remains visible.
- The progress bar showed `일부 업로드 실패` for jobs that were still recoverable through the offline outbox backup.

## Changes
- Serialized Samsung Internet simple uploads through one in-browser queue while leaving normal resumable uploads unchanged.
- Added a post-timeout Storage URL recovery check so a client timeout can still pick up a late-successful upload.
- Stored the selected `File` directly on background media jobs and reused it for offline outbox backup/retry.
- Changed outbox-backed unresolved jobs to display as deferred retry (`업로드 재시도 예약됨`) rather than terminal `일부 업로드 실패`.
- Bumped runtime/cache assets to `v224`.

## Verification
- `npx vitest run tests/video-upload-resilience.test.js tests/diet-photo-persistence.test.js`
- `npx vitest run tests/video-upload-resilience.test.js tests/diet-photo-persistence.test.js tests/pwa-versioning.test.js`
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
- `npm run check:en`
- `git diff --check`
