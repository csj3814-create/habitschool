# 2026-04-27 Reward Market Mobile Vault Fit

## Checklist
- [x] Shrink coupon-vault product imagery so it stays subordinate to barcode and PIN on mobile.
- [x] Make fullscreen barcode view use a wider, brighter horizontal presentation.
- [x] Add or refresh tests for the updated coupon-vault mobile behavior.

## Notes
- Mobile coupon-vault cards currently let fallback product imagery dominate the viewport.
- Barcode fullscreen should prioritize scan width over portrait card chrome.

## Review
- Coupon-vault product thumbnails and product-fallback visuals now stay compact on mobile instead of filling the card.
- Barcode fullscreen now switches the overlay into a brighter wide mode that uses most of the viewport width.
- `npm test`, `npx esbuild js/reward-market.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\reward-market-check.js`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, and `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js` all passed.
