# 2026-04-13 Seokjae Remaining Migration Mint

## Goal

- Complete 최석재's unpaid remainder of the mainnet migration HBT payout.

## Plan

- [x] Confirm the remaining payout amount from the migration audit
- [x] Re-check mainnet `currentRate`, user daily remaining mint capacity, and recipient balance
- [x] Execute the remaining mainnet mint through the `server minter`
- [x] Verify the transaction result and post-mint balance

## Execution

- Remaining payout target: `18,080 HBT`
- Recipient: `0xa3f5961306b19BC45cd80407D0A932FcA8Ef81d2`
- Contract: `0xCa499c14afE8B80E86D9e382AFf76f9f9c4e2E29`
- `currentRate`: `4`
- Mint point amount: `4,520 P`
- Execution path: direct mainnet mint with `SERVER_MINTER_KEY`
- Tx: `0x7bbedbdc7e6af0b05e9849872473cc79489b17b2b65eb6687e52276dd0508ea4`

## Verification

- Recipient balance before mint: `3,084 HBT`
- Recipient balance after mint: `21,164 HBT`
- User daily remaining before mint: `20,000 HBT`
- User daily remaining after mint: `1,920 HBT`

## Result

- 최석재 mainnet migration mint is fully complete.
- Delivered totals:
  - `18,084 HBT` on `2026-04-12`
  - `18,080 HBT` on `2026-04-13`
  - combined total: `36,164 HBT`
