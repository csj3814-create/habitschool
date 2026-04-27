# 2026-04-27 Changelog User-Facing Cleanup

## Checklist
- [x] Rewrite changelog `v1.0.9` in a shorter user-facing tone.
- [x] Record the changelog copy correction in `tasks/lessons.md`.
- [x] Run the standard verification checks before deployment.

## Notes
- The current `v1.0.9` changelog explains too much implementation detail.
- Users should see the changes they can feel, not internal naming and admin mechanics first.

## Review
- `v1.0.9` now focuses on what got easier for users: seeing products, checking contacts, reading barcodes/PINs, and avoiding blocked 2,000P coupons.
- Internal admin wording and implementation detail were intentionally removed from the user-facing changelog copy.
- Verified with `npm test` and `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`.
