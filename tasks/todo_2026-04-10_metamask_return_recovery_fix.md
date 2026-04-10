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

## Fix
- Added a short account polling window during external-wallet recovery instead of a single immediate `eth_accounts` check.
- Added shared helpers to normalize chain IDs, persist connected wallet state, and re-apply wallet UI state from recovered providers.
- Bound MetaMask Connect provider events to wallet UI/state sync so app return can complete even if the initial recovery check was too early.
- Mirrored the same provider-state sync pattern for Trust Wallet WalletConnect to keep the two mobile paths aligned.

## Verification
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`

