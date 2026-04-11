# 2026-04-12 Challenge Toast Encoding Fix

## Goal

- Fix the transient mojibake text shown during challenge application while the wallet approval step is pending.
- Ensure the fix reaches clients immediately by bumping the app/service worker cache version.

## Plan

- [x] Locate the broken challenge-start toast strings
- [x] Patch both internal-wallet and external-wallet challenge flows
- [x] Bump cache/app asset version so clients receive the fix
- [x] Verify with tests and bundle checks
- [x] Document the result and lesson

## Review

- Found exactly two broken user-facing strings in [js/blockchain-manager.js](/C:/SJ/antigravity/habitschool/js/blockchain-manager.js) during the HBT approval wait state for challenge staking.
- Replaced the mojibake toast with `⏳ HBT 예치 권한 승인 중...` in both challenge-start paths.
- Cache/version bump and verification are tracked together so the fix is visible immediately after deploy.
- Bumped app asset and service worker cache version from `124` to `125` in [index.html](/C:/SJ/antigravity/habitschool/index.html), [sw.js](/C:/SJ/antigravity/habitschool/sw.js), and [js/pwa-install.js](/C:/SJ/antigravity/habitschool/js/pwa-install.js).
- Verification passed:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
