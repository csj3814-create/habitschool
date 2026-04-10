# 2026-04-10 Wallet SDK Cache Cleanup

## Goal
- Reduce staging/prod site data footprint by removing unused MetaMask/Trust Wallet SDK bundles.
- Keep the current app-wallet-first runtime and UI unchanged for end users.
- Remove dead reconnect logic so cache/storage growth is easier to reason about.

## Plan
- [x] Audit current bundle, config, and reconnect references for external wallet SDK paths.
- [x] Remove unused vendor bundle imports, config, and recovery logic while preserving app wallet behavior.
- [x] Delete stale vendor artifacts and package scripts/dependencies that are no longer used.
- [x] Rotate browser cache/version strings so staging picks up the lighter build.
- [x] Verify with tests and bundle checks.

## Review
- Removed the unused MetaMask Connect and WalletConnect browser bundles from `js/vendor/`, which were the main reason staging site data had grown by multiple megabytes.
- Simplified `js/blockchain-manager.js` back to injected-provider reconnect only, keeping the current app-wallet-first behavior intact.
- Removed wallet SDK config from `js/blockchain-config.js` and the now-dead package scripts/dependencies from `package.json`.
- Rotated `app.js`, `main.js`, `auth.js`, `blockchain-manager.js`, and service worker cache versions so staging/prod can evict the old heavy cache.
- Verified with `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, and `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`.
