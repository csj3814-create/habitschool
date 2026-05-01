# 2026-05-01 Korean text integrity cleanup

## Goal
- Find and fix broken Korean/mojibake text in user-facing UI and console logs.
- Add a lightweight regression check so obvious corrupted Korean text does not ship again.
- Verify the browser bundle and tests after the cleanup.

## Checklist
- [x] Scan code and docs for mojibake patterns
- [x] Fix corrupted strings in runtime files
- [x] Add or update text integrity checks
- [x] Run tests and bundle verification
- [x] Document findings and results

## Notes
- Screenshot shows corrupted console output around challenge labels in `blockchain-manager.js`.
- Keep edits narrow and preserve existing UTF-8 Korean text.
- Fixed corrupted challenge/referral console logs and one challenge progress toast in `js/blockchain-manager.js`.
- Fixed a corrupted admin console warning in `admin.html`.
- Repaired visible CSS pseudo-content labels in `styles-features.css`: `열기`, `접기`, `자세히 보기`.
- Cleaned nearby corrupted comments in `js/auth.js` so future auth edits are easier to review.
- Added `tests/korean-text-integrity.test.js` to scan runtime UI/console text and CSS `content` values for mojibake patterns.
- Verification passed: `npm test`, esbuild bundle check, and `git diff --check`.
