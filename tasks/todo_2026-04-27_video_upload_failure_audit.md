# 2026-04-27 Video Upload Failure Audit

## Goal
- Find why exercise video uploads often fail near the end even when file size is not huge.
- Make video upload handling more resilient than the current photo-oriented path.

## Checklist
- [x] Review existing upload lessons and upload code paths.
- [x] Identify video-specific timeout/retry/finalization failure points.
- [x] Patch upload behavior with minimal impact.
- [x] Add or update regression tests.
- [x] Run project verification.

## Review
- Work started after reports that exercise video uploads take a long time and often fail near completion.
- Root cause found: the shared upload helper used a fixed 30 second cancellation window around Firebase Storage resumable uploads. That can cancel a video upload even while bytes are still moving, especially on mobile uplinks.
- Patched the app to use file-aware resumable upload budgets, reset the idle timeout whenever progress advances, and keep a separate finalization timeout for `getDownloadURL`.
- Patched pending upload tracking so a resolved `{ url: null }` result is treated as an error instead of showing "upload complete".
- Targeted tests passed: `npm test -- --run tests/upload-performance.test.js tests/video-upload-resilience.test.js`.
- Full verification passed: `npm test` and `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`.
