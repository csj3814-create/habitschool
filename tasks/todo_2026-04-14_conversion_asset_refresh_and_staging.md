# 2026-04-14 Conversion Asset Refresh And Staging

## Goal

- Make the wallet asset panel reflect `P -> HBT` conversion immediately after success.
- Ensure the wallet does an authoritative refresh shortly after conversion so balances and history catch up even if onchain / Firestore propagation lags.
- Deploy the fix to staging after verification.

## Plan

- [ ] Inspect the conversion success flow and asset refresh timing
- [ ] Add immediate asset refresh / optimistic wallet update after successful conversion
- [ ] Verify with tests and bundle checks
- [ ] Commit the relevant files and deploy to staging

## Notes

- The wallet already calls `updateAssetDisplay(true)` after conversion, but the user reports the converted result is not reflected reliably enough.
- The fix should make the success state visible immediately, then let a forced refresh reconcile the authoritative values.
