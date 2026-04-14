# 2026-04-14 Asset Tab HBT Onchain Removal

## Goal

- Remove the optional onchain HBT transfer lookup from the asset tab.
- Keep the stable Firestore-backed asset history visible without the slow/failing callable.
- Remove UI copy that implies an extra onchain sync is still running.

## Plan

- [x] Inspect the asset-tab HBT history path and isolate the optional onchain merge
- [x] Remove the onchain HBT history fetch from the asset tab and simplify the captions/loading copy
- [x] Verify with tests and bundle checks
- [x] Record the result and any lesson from the rollback

## Notes

- The user explicitly chose stability over the optional onchain enrichment path.
- The asset tab should still show app-backed HBT conversion/challenge records from `blockchain_transactions`.

## Review

- Removed the asset-tab call to `fetchHbtTransferHistory()` and the follow-up merge path, so `blockchain_transactions` is now the only HBT history source on that screen.
- Removed `온체인 확인 중` wording and adjusted the empty/loading helper copy to match the simpler data flow.
- Filled the conversion-rate badge from cached rate state immediately and populated the wallet address/status from saved user data before the blockchain wallet bootstrap finishes.

## Verification

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
