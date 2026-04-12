# 2026-04-12 HBT History RPC Block Range Fix

## Goal

- Make mainnet HBT transfer history keep working when fallback RPC providers reject large `eth_getLogs` block ranges.

## Plan

- [x] Reproduce the live wallet's onchain HBT history query against the same mainnet wallet
- [x] Identify why the fallback RPC chain returns an empty transfer list
- [x] Patch the server-side log-scan error detection so it shrinks the block range instead of failing open
- [x] Verify with syntax/tests/bundle checks

## Review

- Root cause:
  - `getHbtTransferHistory` started with a `50,000` block scan chunk and only treated classic rate-limit messages as retryable.
  - Mainnet fallback RPCs such as `1rpc.io/bnb` reject wide `eth_getLogs` scans with messages like `limited to 0 - 10000 blocks range`.
  - Because that error was not classified as retryable, the function skipped the adaptive chunk shrink path and could fall through to an empty result set.
- Fix:
  - Expanded the retryable RPC detection to include `error.error.message` and block-range-limit phrases like `blocks range`, `0 - 10000`, and `limited to`.
  - Reproduced the wallet address `0xa3f5961306b19BC45cd80407D0A932FcA8Ef81d2` against mainnet and confirmed the patched scan returns 6 transfers including `+18,084 HBT` mint and `+10,000 HBT` challenge return.
- Verification passed:
  - `node -c functions/index.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
