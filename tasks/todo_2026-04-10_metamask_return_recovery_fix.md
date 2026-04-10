# 2026-04-10 MetaMask return recovery fix

## Goal
- Fix the mobile MetaMask connect flow on staging so returning from the MetaMask app updates the wallet UI without requiring extra taps or a manual refresh.

## Checklist
- [x] Review the current MetaMask Connect recovery flow and the existing mobile-browser notes.
- [x] Identify why returning from MetaMask leaves the app UI unchanged.
- [x] Add more reliable runtime sync for restored wallet sessions.
- [x] Re-run project verification checks.
- [ ] Verify the fixed return flow on a real mobile device in staging.

## Root cause
- The app tried to recover the MetaMask session only once, immediately after the page regained focus.
- If the SDK had not finished rehydrating the session yet, `eth_accounts` returned no account and the recovery path gave up.
- We also were not listening to the provider's later `connect/accountsChanged/chainChanged` events, so a restored session could exist without updating the visible wallet UI.
- On login, blockchain wallet bootstrap was deferred by 10 seconds, so a browser tab reloaded after wallet approval could come back looking unchanged for too long.
- Trust Wallet deeplinking depended on a late async URI callback, which mobile browsers can ignore more easily than a launch path tied to the original click.

## Fix
- Added a short account polling window during external-wallet recovery instead of a single immediate `eth_accounts` check.
- Added shared helpers to normalize chain IDs, persist connected wallet state, and re-apply wallet UI state from recovered providers.
- Bound MetaMask Connect provider events to wallet UI/state sync so app return can complete even if the initial recovery check was too early.
- Mirrored the same provider-state sync pattern for Trust Wallet WalletConnect to keep the two mobile paths aligned.
- Pre-open a mobile handoff window from the original click and reuse it when MetaMask/Trust deeplinks become available, which keeps wallet launching closer to the user gesture.
- Bootstrap wallet recovery shortly after login, and prioritize it even earlier when a mobile wallet handoff is pending.

## Verification
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`
