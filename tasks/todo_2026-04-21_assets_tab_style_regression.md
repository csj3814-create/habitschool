# 2026-04-21 Assets Tab Style Regression

## Plan
- [x] Review lessons and inspect the asset-tab markup/CSS for the missing red-box styling
- [x] Restore the intended asset card styling with minimal impact
- [x] Run verification and record the result

## Notes
- User reported that the asset tab lost the previous red boxed styling and turned white.
- Root cause: the opening comment at the top of `styles-features.css` was malformed after the stylesheet split, so the asset-card rules at the start of the file were no longer parsed reliably.

## Review
- Fixed the malformed opening comment so the wallet asset-card rules at the top of `styles-features.css` parse cleanly again.
- Verification: `npm test` passed and `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js` passed.
