# 2026-05-17 Exercise Picker CTA v182

- [x] Record the missed CTA/input-click pattern in lessons.
- [x] Route exercise CTA-created image/video inputs through the Samsung system picker before falling back to input.click().
- [x] Keep Chrome/non-Samsung behavior on the native input path.
- [x] Add source tests for CTA picker routing and image/video accept hints.
- [x] Rotate runtime cache/import versions to v182.
- [x] Verify with npm test, esbuild bundle, and sw.js syntax check.

## Review

- `npm test`: passed, 41 files / 290 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`: passed.
- `node --check sw.js`: passed.
- `git diff --check`: passed with existing LF/CRLF warnings only.
