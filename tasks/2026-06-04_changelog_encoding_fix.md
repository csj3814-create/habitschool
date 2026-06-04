# 2026-06-04 Changelog Encoding Fix

## Plan
- [x] Locate the changelog file with broken question-mark placeholder output
- [x] Rebuild `changelog.html` as valid UTF-8 Korean copy
- [x] Update `CHANGELOG.md` with the latest production commit and this fix
- [x] Add regression coverage for question-mark replacement text in the public changelog
- [x] Run verification

## Notes
- User report: the changelog was written as question-mark placeholder text.
- Root cause: `changelog.html` itself contained mojibake and question-mark replacement text. The existing Korean text integrity test caught some mojibake forms but missed repeated question-mark runs in HTML copy.

## Review
- Broken-character scan across the changelog page, markdown changelog, and this task note returned no matches.
- `npx vitest run tests/korean-text-integrity.test.js tests/pwa-versioning.test.js tests/index-html-integrity.test.js` passed.
- `npm test` passed: 45 test files, 319 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` passed.
- `node --check functions\runtime.js` passed.
- `git diff --check` reported only line-ending normalization warnings.
