# 2026-04-26 Reward Market UI Cleanup

## Goal
- Simplify the reward-market helper copy so only essential member-facing information remains.
- Clean up the `해빛 마켓` card layout so the price and primary action are easier to scan.

## Plan
- [x] Inspect the current member-facing reward-market chips, status copy, and product card structure.
- [x] Reduce helper chips/copy to the smallest useful set and simplify the contact guidance.
- [x] Clean up the `해빛 마켓` product card layout and verify the frontend bundles still build.

## Review
- Simplified the helper chips to the smallest useful set: mode, pricing, coupon vault delivery, one remaining-limit chip, and a warning chip only when provider setup is missing.
- Shortened the phone guidance and top status copy so the page explains only what the member needs to do next.
- Reworked the reward cards into a cleaner layout with a compact support line, a two-column price panel, and one primary action button.
- Updated the static captions in `index.html` to match the simplified redemption flow.
- Verification:
  - `npm test`
  - `npx esbuild js/reward-market.js --bundle --format=esm --platform=browser --outfile=%TEMP%\reward-market-check.js`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`
