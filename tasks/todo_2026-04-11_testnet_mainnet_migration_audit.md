# 2026-04-11 Testnet to Mainnet Migration Audit

## Goal

- Determine the actual user-level migration payload before mainnet cutover.
- Preserve the live source-chain economics instead of resetting users onto a fresh `1P = 1 HBT` assumption.

## Plan

- [x] Confirm the live testnet `currentRate`
- [x] Read production Firestore `users` documents
- [x] Query testnet on-chain HBT balances and locked challenge stakes
- [x] Compute per-user migration rows and challenge completion percentages
- [x] Flag reconciliation anomalies before airdrop / cutover

## Verification

- Firestore OAuth access via the locally authenticated Firebase CLI account
- Testnet contract reads against:
  - `HaBit`: `0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B`
  - `HaBitStaking`: `0x7e8c29699F382B553891f853299e615257491F9D`
- Generated outputs:
  - [testnet-mainnet-migration-audit-2026-04-11.json](C:\SJ\antigravity\habitschool\tmp\testnet-mainnet-migration-audit-2026-04-11.json)
  - [testnet-mainnet-migration-audit-2026-04-11.csv](C:\SJ\antigravity\habitschool\tmp\testnet-mainnet-migration-audit-2026-04-11.csv)

## Findings

- Live testnet `currentRate` is `4`, so migration planning must preserve the existing `1P = 4 HBT` economics.
- Migration-relevant users: `6`
- Users with wallet resolution still needed: `2`
- Testnet liquid HBT total: `29,005`
- Testnet locked HBT total (current on-chain): `20,000`
- Total HBT represented on the current testnet contracts: `49,005`
- Active challenge entries found: `9`

## Per-user highlights

- `최석재` (`0xa3f5961306b19BC45cd80407D0A932FcA8Ef81d2`)
  - Liquid: `18,400 HBT`
  - Locked: `15,000 HBT`
  - Challenges:
    - `master` ongoing `2/30` (`6.67%`) stake `10,000`
    - `weekly` ongoing `4/7` (`57.14%`) stake `5,000`
    - `mini` ongoing `3/3` (`100%`) stake `0`

- `Sangmin` (`0xd860A16479a718Cb7CACF7d2eE3d71F48D53f0a5`)
  - Liquid: `7,405 HBT`
  - Locked on current testnet contract: `5,000 HBT`
  - Firestore challenge stake sum: `5,220 HBT`
  - Challenges:
    - `master` ongoing `7/30` (`23.33%`) stake metadata `220`
    - `weekly` ongoing `3/7` (`42.86%`) stake `5,000`
    - `mini` ongoing `2/3` (`66.67%`) stake `0`
  - Reconciliation note: the extra `220 HBT` exists in Firestore challenge metadata but is not visible in the current testnet contract stake totals, so this row needs manual reconciliation before migration.

- `장기자` (`0xC08cf6f495C7dBF029d6313b8b9196ca0d3fE2E9`)
  - Liquid: `3,200 HBT`
  - Locked: `0 HBT`

- `오로라`
  - No wallet address yet
  - `mini` ongoing `0/3` (`0%`)

- `최도윤`
  - No wallet address yet
  - `mini` ongoing `1/3` (`33.33%`)

- `SaisA` (`0x15f55949f9B83BBEc829d5C5e936089AA092c898`)
  - No liquid or locked HBT
  - Has a malformed `mini` challenge entry with null challenge metadata that should be cleaned before migration.

## Review

- The migration set is small enough to handle with a human-reviewed snapshot.
- The safest migration source of truth is:
  - wallet HBT: current testnet on-chain balance
  - locked HBT: current testnet on-chain challenge stake
  - challenge progress: Firestore `activeChallenges`
- Firestore `hbtStaked` metadata is not always a perfect reflection of the current locked amount, so locked HBT should be taken from the live contract read, not Firestore alone.

## Provisional Payout Draft (2026-04-11 before 00:00 KST rollover)

- Assumption: user-favorable migration policy
  - preserve liquid HBT as-is
  - preserve challenge principal at `100%`
  - apply only the phase-1 bonus portion pro-rata by current completion rate
- Phase-1 bonus rates used from the live policy:
  - weekly: `+50%`
  - master: `+200%`
- Formula:
  - `provisional challenge payout = principal + (principal * bonusRate * completionRate)`

- `최석재`
  - liquid carry-over: `18,400 HBT`
  - weekly provisional payout:
    - principal `5,000`
    - completion `4/7 = 57.142857%`
    - payout `6,428.57142857 HBT`
  - master provisional payout:
    - principal `10,000`
    - completion `2/30 = 6.666667%`
    - payout `11,333.33333333 HBT`
  - challenge subtotal: `17,761.90476190 HBT`
  - provisional total carry-over: `36,161.90476190 HBT`

- `Sangmin`
  - liquid carry-over: `7,405 HBT`
  - weekly provisional payout:
    - principal `5,000`
    - completion `3/7 = 42.857143%`
    - payout `6,071.42857143 HBT`
  - master provisional payout:
    - principal `220`
    - completion `7/30 = 23.333333%`
    - payout `322.66666667 HBT`
  - challenge subtotal: `6,394.09523810 HBT`
  - provisional total carry-over: `13,799.09523810 HBT`
  - note: this intentionally includes the disputed `220 HBT` master stake on the pay-in-favor assumption

## Execution Decisions Locked In (2026-04-11)

- Mainnet `currentRate` must be set to `4` before any migration payout is minted.
- Migration payout path:
  - use `server minter` mint
  - round in favor of the user
- `Sangmin`
  - include the disputed `220 HBT` master stake in the payout base
- `SaisA`
  - keep at `0` payout for now because the row is malformed and has no liquid or locked HBT

## Wallet Resolution Update (2026-04-11)

- `오로라` wallet resolved
  - uid: `06ZApjlPRXe5QZoPMgEqgvam84H3`
  - email: `sk49003904@gmail.com`
  - new internal wallet: `0x0606Dc171A28c1AbDa5E7c6Df57205e09592E853`
  - stored as `walletVersion = 2` with encrypted key material, so the app can restore it on the next login
- `최도윤` wallet resolved
  - uid: `c79MHofG2SPHQjr7BJwUcRrFyF92`
  - email: `cdy05200@gmail.com`
  - new internal wallet: `0x2c5c621f76B22b586B7a2eF9579Be0c97eF6CaBB`
  - stored as `walletVersion = 2` with encrypted key material, so the app can restore it on the next login

## Final 00:00 Recalc Note

- Re-run the snapshot after `2026-04-12 00:00 KST`.
- Use the latest Firestore `activeChallenges` state at that time, not this provisional snapshot alone.
- `최도윤` already showed a live-doc difference during wallet resolution, so the midnight recalculation should be treated as the final source of truth.

## 2026-04-12 Final Recalculation Plan

- [x] Re-read production `users` documents after `2026-04-12 00:00 KST`
- [x] Re-read testnet on-chain liquid and locked HBT balances
- [x] Recompute challenge completion-based payout for `최석재` and `Sangmin`
- [x] Preserve the locked execution decisions:
  - mainnet `currentRate = 4` before payout minting
  - payout through `server minter`
  - round in favor of the user
  - include `Sangmin` disputed `220 HBT`
  - keep `SaisA = 0`
- [x] Publish the final payable table for cutover execution

## 2026-04-12 Final Recalculation Result

- Snapshot time: `2026-04-12 00:05 KST`
- Outputs:
  - [testnet-mainnet-migration-final-2026-04-12.json](C:\SJ\antigravity\habitschool\tmp\testnet-mainnet-migration-final-2026-04-12.json)
  - [testnet-mainnet-migration-final-2026-04-12.csv](C:\SJ\antigravity\habitschool\tmp\testnet-mainnet-migration-final-2026-04-12.csv)
- Live rate check:
  - testnet `currentRate = 4`
  - mainnet `currentRate = 1`
  - mainnet must still be updated to `4` before any migration mint
- Bonus policy confirmed from code:
  - weekly: `5000 bps` (`+50%`)
  - master: `20000 bps` (`+200%`)

### Final payable table

- `최석재`
  - wallet: `0xa3f5961306b19BC45cd80407D0A932FcA8Ef81d2`
  - liquid: `18,400 HBT`
  - locked: `15,000 HBT`
  - weekly payout target: `6,428.57142857 HBT`
  - master payout target: `11,333.33333333 HBT`
  - final target: `36,161.90476190 HBT`
  - final mint rounded: `36,164 HBT`
  - rounding delta: `+2.09523810 HBT`

- `Sangmin Jeon`
  - wallet: `0xd860A16479a718Cb7CACF7d2eE3d71F48D53f0a5`
  - liquid: `7,405 HBT`
  - locked: `5,000 HBT`
  - weekly payout target: `6,071.42857143 HBT`
  - master payout target: `322.66666667 HBT`
  - final target: `13,799.09523810 HBT`
  - final mint rounded: `13,800 HBT`
  - rounding delta: `+0.90476190 HBT`
  - note: includes the disputed `220 HBT` master stake on the user-favorable rule

- `장기자`
  - wallet: `0xC08cf6f495C7dBF029d6313b8b9196ca0d3fE2E9`
  - liquid: `3,200 HBT`
  - locked: `0 HBT`
  - final target: `3,200 HBT`
  - final mint rounded: `3,200 HBT`

- `오로라`
  - wallet: `0x0606Dc171A28c1AbDa5E7c6Df57205e09592E853`
  - final target: `0 HBT`

- `최도윤`
  - wallet: `0x2c5c621f76B22b586B7a2eF9579Be0c97eF6CaBB`
  - final target: `0 HBT`

- `SaisA`
  - wallet: `0x15f55949f9B83BBEc829d5C5e936089AA092c898`
  - final target: `0 HBT`

### Totals

- liquid total: `29,005 HBT`
- locked total: `20,000 HBT`
- challenge payout target total: `24,156 HBT`
- final target total: `53,161 HBT`
- final mint rounded total: `53,164 HBT`
- total rounding delta: `+3 HBT`

## 2026-04-12 Mainnet Execution Status

- Mainnet `currentRate` updated to `4`
  - step 1: `1 -> 2`
    - tx: `0x55a05e95734fa7a7c9bc5e159f1df7cf05d3c1ba63937d35205f6fa10c48afff`
  - step 2: `2 -> 4`
    - tx: `0xa8f6743bde4e5c8fbf65885e01d221001f557f1a5ecbe3a018b13ffc6694b777`
- Direct `1 -> 4` update was not allowed because the contract smoothing rule only permits a max `2x` step.
- Migration mint dry-run result with `server minter`:
  - `최석재` `36,164 HBT`
    - blocked by `ExceedsUserDailyCap()`
    - selector: `0xfeb8983d`
    - reason: `USER_DAILY_CAP = 20,000 HBT`
  - `Sangmin Jeon` `13,800 HBT`
    - mint is executable
  - `장기자` `3,200 HBT`
    - mint is executable
- This means the currently locked user instruction (`server minter mint`) can be executed immediately for two users, but not for `최석재` in a single-day payout.

## 2026-04-12 Migration Mint Execution

- Executed after setting mainnet `currentRate = 4`
- Today execution result:
  - `최석재` partial mint: `18,084 HBT`
    - tx: `0xf41a846de8119e5ebbcb7b6090163e74bbec32ffffc42df475b1eb410b232690`
    - today minted total: `18,084 HBT`
    - remaining for tomorrow: `18,080 HBT`
    - note: split had to respect the `4 HBT` mint granularity at `currentRate = 4`
  - `Sangmin Jeon`: `13,800 HBT`
    - tx: `0xd145eee3abd4eaf0f4a8c996fb7f033969181844de7816ffc333b464b742faeb`
  - `장기자`: `3,200 HBT`
    - tx: `0x838707dd4d64c17cb37ed12fb6a63f5e24c50520e29b1a4a6d2204ef2bfda678`

## Post-execution Verification

- Verified on mainnet after execution:
  - `currentRate = 4`
  - `globalDailyMinted(today) = 35,084 HBT`
  - `최석재` balance / mintedToday: `18,084 HBT`
  - `Sangmin Jeon` balance / mintedToday: `13,800 HBT`
  - `장기자` balance / mintedToday: `3,200 HBT`
