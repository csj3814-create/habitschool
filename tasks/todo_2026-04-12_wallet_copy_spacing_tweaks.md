# 2026-04-12 Wallet / Community Copy & Spacing Tweaks

## Goal

- Tighten small UI details the user noticed on the live wallet and community screens.

## Plan

- [x] Find the wallet/community copy and halving table layout definitions
- [x] Adjust the halving `채굴 풀` column spacing and requested microcopy
- [x] Verify with tests and bundle checks

## Review

- Nudged the halving schedule `채굴 풀` column slightly inward with extra right padding so the last column no longer hugs the edge as tightly.
- Shortened the wallet disclaimer copy, removed `보기` from the staking wallet link label, and removed `매월` from the monthly MVP reward helper line in the record tab.
- Bumped the frontend/service-worker asset version to `128` so the copy and spacing tweaks are not hidden behind stale PWA cache on the next deploy.
- Verification passed:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
