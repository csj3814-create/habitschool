# 2026-05-17 Samsung Video Native Input v184

- [x] Record that Samsung Internet rejects or mishandles `showOpenFilePicker()` video hints.
- [x] Route exercise video uploads on Samsung Internet directly to the native `input[type=file][accept=video/*]` path.
- [x] Keep Samsung image uploads on the current image picker path.
- [x] Ensure the native input path runs inside the user tap and restores hidden-input styles.
- [x] Rotate runtime assets to v184.
- [x] Verify with npm test, esbuild bundle, and sw.js syntax check.

## Review

- `npm test`: passed, 41 files / 290 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`: passed.
- `node --check sw.js`: passed.
- `git diff --check`: passed with LF/CRLF warnings only.
