# Samsung/Chrome photo picker split v180

## Checklist
- [x] Keep Samsung Internet library uploads on `showOpenFilePicker()` so the useful recent-files screen opens directly.
- [x] Restore Chrome Android library uploads to the plain image file input path so Android's image picker grid opens again.
- [x] Keep camera upload, auth recovery, delayed 0% upload, and fallback panel behavior unchanged.
- [x] Rotate runtime assets to v180.
- [x] Run `npm test`, esbuild bundle check, and `node --check sw.js`.

## Review
- `npm test`: passed, 41 files / 289 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`: passed.
- `node --check sw.js`: passed.
- The library picker now uses `showOpenFilePicker()` only when the user agent is Samsung Internet; Chrome falls through to the existing file input path.
