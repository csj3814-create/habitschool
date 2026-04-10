# 2026-04-10 session wrap-up

## Goal
- Capture the major product, mainnet-prep, and deployment work completed on April 10.
- Record what shipped to staging and production, what was intentionally deferred, and what still blocks mainnet cutover.

## Completed today
- Updated challenge qualification so newly started weekly and master challenges now count a day only when the daily score reaches 65 points, while legacy in-progress challenges keep their old rule.
- Simplified challenge copy in wallet and tokenomics surfaces so users can understand `65점 이상`, `80%+ 환급`, and `100P/500P` outcomes at a glance.
- Repaired and aligned the tokenomics surfaces:
  - restored broken tokenomics HTML text
  - aligned wallet/tokenomics copy with the real `12,000 HBT` daily cap
  - removed misleading `신규 위클리/마스터` wording in user-facing copy
  - updated the `최종 업데이트` date to April 10, 2026
- Completed a mainnet-prep code pass:
  - BSC stays the single-chain target
  - runtime now fails fast if mainnet mode is enabled without real contract addresses
  - stale duplicate root contract source files were removed so the Hardhat source of truth is unambiguous
  - final readiness review now clearly states that mainnet is still `NO-GO` until real deployment inputs are filled
- Tried multiple external-wallet connection approaches for MetaMask and Trust Wallet, then intentionally pivoted away from making them the primary product path after repeated real-device failures.
- Shipped the wallet policy pivot:
  - app wallet is now the default product path again
  - external wallet buttons were removed from the main wallet card
  - app-wallet export remains available for advanced users
  - heavy wallet SDK bundles were removed so cached site data becomes much smaller
- Fixed staging Google popup login so successful account selection no longer sits on the landing screen waiting on a delayed auth-state transition.
- Upgraded Cloud Functions runtime packages:
  - `firebase-functions` `7.2.2 -> 7.2.5`
  - `firebase-admin` `12.7.0 -> 13.8.0`
- Adjusted exercise video save UX:
  - background media upload can still start early
  - visible `%` progress now starts only after pressing `운동 저장하고 포인트 받기`
  - the direct-save strength-video fallback now correctly awaits the upload promise

## Deployment state
- Staging received multiple April 10 verification deploys and now reflects the latest end-of-day state.
- Production received:
  - wallet policy pivot
  - wallet SDK cache cleanup
  - lighter site-data footprint after removing abandoned external-wallet browser bundles
- The latest web/function work is committed on `main`.

## Verification completed
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
- `node --check functions/index.js`
- `cd contracts && npx hardhat compile`
- `cd contracts && npx hardhat test`
- `cd contracts && npm run export:abi`
- `cd functions && npm ls firebase-functions firebase-admin`
- Repeated staging `hosting,functions` deploy checks

## Remaining next steps
- Mainnet is still blocked until the real BSC mainnet deployment is performed and these values are filled:
  - `HABIT_MAINNET_ADDRESS`
  - `STAKING_MAINNET_ADDRESS`
  - `ONCHAIN_NETWORK=mainnet`
  - production `ENABLE_PROD_MAINNET = true`
  - `contracts/deployments-bsc.json`
- Real mainnet launch still needs:
  - contract deployment artifact capture
  - BscScan verification
  - final mint/stake/settle live verification
- External wallet connection should stay out of the main product path unless it is redesigned from scratch as an advanced-only flow.

## Workspace note
- Working tree is clean at end of day.
- The current staging state and local checked-in state are aligned.
- Mainnet-prep code is committed, but mainnet activation values are intentionally not set in the repo yet.
