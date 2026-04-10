# 2026-04-10 Mainnet Final Readiness Check

## Plan

- [x] Review prior lessons and existing mainnet readiness docs
- [x] Inspect current code/config/docs for mainnet blockers and mismatches
- [x] Run verification checks and record a final go/no-go decision

## Remediation

- [x] Add fail-fast guards for misconfigured mainnet runtime addresses
- [x] Remove duplicate contract source copies so one deployment source of truth remains
- [x] Re-run verification after cleanup

## Findings

### No-go blockers

- Mainnet cutover inputs are still intentionally unset in the checked-in app config. `js/blockchain-config.js` keeps `ENABLE_PROD_MAINNET = false` and both `mainnetAddress` fields at the zero address, so production is still locked to testnet until the operator performs the final address/env flip.
- The mainnet deployment artifact does not exist yet. `contracts/deployments-bsc.json` is still absent, which means no real BSC mainnet deployment has been recorded from this repo state.

### Resolved in this pass

- `functions/index.js` now fails fast when `ONCHAIN_NETWORK=mainnet` is enabled without a valid `HABIT_MAINNET_ADDRESS` or `STAKING_MAINNET_ADDRESS`.
- The stale root duplicate contract files were removed. Hardhat source-of-truth is now unambiguous: `contracts/contracts/HaBit.sol` and `contracts/contracts/HaBitStaking.sol`.

## Verification

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
- `cd contracts && npx hardhat compile`
- `cd contracts && npx hardhat test`
- `cd contracts && npm run export:abi`

## Decision

- Current verdict: `NO-GO` for immediate mainnet cutover.
- Reason: operator-controlled mainnet deployment inputs and artifacts are not filled yet.

## Review

- Web and contract checks are green, so the current repo state is internally consistent enough for continued prep work.
- The remaining blockers are launch-operations blockers, not day-to-day app regressions.
- The fastest safe path is:
  1. deploy real BSC mainnet contracts and generate `contracts/deployments-bsc.json`
  2. wire real `HABIT_MAINNET_ADDRESS` / `STAKING_MAINNET_ADDRESS` / `ONCHAIN_NETWORK=mainnet`
  3. verify on BscScan and record the final addresses in launch docs
