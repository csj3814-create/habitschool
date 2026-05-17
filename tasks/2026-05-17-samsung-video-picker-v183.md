# 2026-05-17 Samsung Video Picker v183

- [x] Record the Samsung video picker filter limitation in lessons.
- [x] Split video picker accept hints into concrete video MIME groups.
- [x] Give Samsung image/video pickers separate `id` and `startIn` hints so previous image-directory memory does not bleed into exercise videos.
- [x] Keep grid/list view as OS-controlled and avoid promising a web-forced view mode.
- [x] Rotate runtime assets to v183.
- [x] Verify with npm test, esbuild bundle, and sw.js syntax check.

## Review

- `npm test`: passed, 41 files / 290 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`: passed.
- `node --check sw.js`: passed.
- `git diff --check`: passed with LF/CRLF warnings only.
