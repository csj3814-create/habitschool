# 2026-05-17 Samsung Video System Picker v185

- [x] Record that native `input.click()` opens Samsung Internet's action chooser for exercise videos.
- [x] Reintroduce Samsung exercise video `showOpenFilePicker()` without risky `id`/`startIn` options.
- [x] Use concrete video MIME filters first, then broad `video/*` as a synchronous fallback.
- [x] Keep native input only as a last fallback.
- [x] Rotate runtime assets to v185.
- [x] Verify with npm test, esbuild bundle, and sw.js syntax check.

## Review

- `npm test`: passed, 41 files / 290 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`: passed.
- `node --check sw.js`: passed.
- `git diff --check`: passed with LF/CRLF warnings only.
