# 2026-04-12 Wallet HBT Transfer History

## Goal

- Expand the wallet `HBT 거래 기록` box so it reflects not only challenge staking events but also actual HBT inflow and outflow on the active chain.
- Keep the existing app-authored transaction meaning where available, while filling missing gaps with onchain ERC-20 transfer history.

## Plan

- [x] Inspect the current wallet HBT history source and confirm which transaction paths are missing
- [x] Add a server-side onchain HBT transfer history callable for the active wallet
- [x] Merge app transaction history with onchain inflow/outflow in the wallet UI and dedupe by tx hash
- [x] Verify with tests and bundle checks

## Review

- Added `getHbtTransferHistory` callable in `functions/index.js` so the active wallet can fetch recent onchain HBT `Transfer` events on the active chain.
- Kept the wallet's existing app-authored transaction rows for semantic events like conversion and challenge settlement, then merged uncaptured onchain inflow/outflow rows in `js/app.js`.
- Deduped generic onchain rows by known app tx hashes (`txHash`, `stakeTxHash`, `resolveTxHash`, `bonusTxHash`) so the same movement does not appear twice.
- Bumped the app/service-worker version to `127` so wallet history changes are not hidden behind stale PWA cache.
- Hardened the callable after the first prod rollout: BSC mainnet `bsc-dataseed` RPC was rate-limiting `eth_getLogs`, so wallet HBT history now prefers history-safe public RPC fallbacks (`bsc-rpc.publicnode.com`, `1rpc.io/bnb`) before the default endpoint and keeps `eth_getLogs` sequential/non-batched.
- Verification passed:
  - `node -c functions/index.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
