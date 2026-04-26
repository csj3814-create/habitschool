# 2026-04-27 Reward Market Images

## Goal
- Add product and brand imagery to the reward-market cards and coupon vault so the current coffee rewards are easier to recognize at a glance.

## Plan
- [x] Inspect the current reward-market rendering path and confirm where catalog/coupon image fields should flow.
- [x] Add catalog-level product and brand image support with local assets for the current two coffee items.
- [x] Render the new imagery in the member-facing reward cards and coupon vault, then verify the frontend build and tests.

## Review
- Added `productImageUrl` and `brandLogoUrl` support to the reward catalog, Giftishow/live catalog merge path, and redemption serialization so the member UI can keep showing product visuals consistently.
- Added local SVG assets for the two launch coffee products and their brand marks:
  - `assets/reward-market/mega-ice-americano.svg`
  - `assets/reward-market/mega-mgc-logo.svg`
  - `assets/reward-market/paik-iced-americano.svg`
  - `assets/reward-market/paikdabang-logo.svg`
- Updated the reward-market cards to show a hero product image and a small brand mark in the header.
- Updated coupon vault items to show the brand mark in the header and to fall back to the product image whenever a provider coupon image is not available yet.
- Verification:
  - `node -c functions/reward-market.js`
  - `npm test`
  - `npx esbuild js/reward-market.js --bundle --format=esm --platform=browser --outfile=%TEMP%\reward-market-check.js`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
