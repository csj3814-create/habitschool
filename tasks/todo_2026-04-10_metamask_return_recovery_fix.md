# 2026-04-10 MetaMask return recovery fix

## Goal
- Fix the mobile MetaMask connect flow on staging so returning from the MetaMask app updates the wallet UI without requiring extra taps or a manual refresh.
- Make the mobile Trust Wallet flow reliably open the wallet and complete connection without silent no-op behavior.

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
- A bridge-tab workaround exposed a visible `about:blank` tab in real mobile browsers, which made the flow feel broken even before wallet approval.
- The broader issue is that cross-browser wallet handoff remained unreliable on real Android browsers, especially for first-time connection and Trust Wallet deeplinks.

## Fix
- Added a short account polling window during external-wallet recovery instead of a single immediate `eth_accounts` check.
- Added shared helpers to normalize chain IDs, persist connected wallet state, and re-apply wallet UI state from recovered providers.
- Bound MetaMask Connect provider events to wallet UI/state sync so app return can complete even if the initial recovery check was too early.
- Mirrored the same provider-state sync pattern for Trust Wallet WalletConnect to keep the two mobile paths aligned.
- Pre-open a mobile handoff window from the original click and reuse it when MetaMask/Trust deeplinks become available, which keeps wallet launching closer to the user gesture.
- Bootstrap wallet recovery shortly after login, and prioritize it even earlier when a mobile wallet handoff is pending.
- Removed the bridge-tab workaround after real-device feedback and returned MetaMask to same-tab deeplinks.
- Switched Trust Wallet mobile deeplinks to the direct `trust://wc` scheme so installed-app launches do not depend on an intermediate universal-link landing step.
- Pivoted the primary mobile flow away from cross-browser return recovery and toward wallet in-app browsers, which are the officially recommended and more reliable mobile connection surface.
- Mobile MetaMask and Trust Wallet buttons now open the current HaBit page inside the corresponding wallet browser with an auto-connect intent in the URL.
- Once the page loads inside the wallet browser, the app consumes the intent, requests accounts from the injected provider, persists the external wallet address, and updates the wallet card in place.

## Verification
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-main-check.js`
