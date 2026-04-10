# 2026-04-10 Wallet Policy Pivot

## Goal
- Stop presenting external wallet connection as the primary path in the app.
- Make the default wallet experience clearly app-wallet-first.
- Keep wallet export available for advanced users who want to move custody later.

## Why this pivot
- Mobile MetaMask and Trust Wallet handoff is still unreliable in the real user environment.
- The HaBit product is login-first, and the simple daily habit flow matters more than Web3-native wallet ceremony.
- External wallets can stay as an advanced option later, but the main product path should not depend on them.

## Plan
- [x] Review wallet UI, copy, and current runtime status logic.
- [x] Update wallet card copy so app wallet is the default message.
- [x] Remove external-wallet-first CTAs from the main wallet card.
- [x] Keep legacy wallet export for advanced users.
- [x] Adjust runtime wallet status text to match the new policy.
- [x] Verify with tests and staging.

## Review
- Wallet card now starts from `앱 지갑 사용 중` and explains that login alone is enough for HBT conversion and challenge actions.
- MetaMask / Trust Wallet buttons were removed from the primary wallet card so the broken advanced flow no longer blocks the main path.
- External wallet disconnect stays available only if an external address is already connected.
- Verified with `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, and `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`.
- Cleaned repo-local temporary outputs (`tmp/`, `%TEMP%/`, `tasks/tmp_*.png`) and ignored them so production prep stays tidy.
- Removed dead wallet-connect globals from `js/main.js` and dead button-state handling from `js/blockchain-manager.js` because the main UI no longer exposes those buttons.
