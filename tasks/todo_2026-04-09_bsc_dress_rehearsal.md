# 2026-04-09 BSC Dress Rehearsal

## Plan

- [x] Check whether deployer key and server minter secret are available for a real BSC testnet run
- [x] Add a repeatable testnet dress rehearsal script for deploy -> role grant -> mint -> stake -> settle flows
- [x] Run the dress rehearsal against live BSC testnet
- [x] Fix the first failure uncovered during the rehearsal
- [x] Capture the resulting addresses, tx hashes, and follow-up notes

## Result

- Dress rehearsal network: `bscTestnet`
- Deployer: `0x02DdE9bEc9B6ecb78961424bDda763352C1197FB`
- Server minter: `0xDc84e09C6F62591e788B84Ff1051d51EbEDA8230`
- Reserve rehearsal address: `0xcF405Ca1Adc2A3bd80DFDcAE287B83C7d0C706ce`
- Rehearsal contracts:
  - `HaBit`: `0x5c50cc3D3d4c86775B79C0D0281D4420F198f7F7`
  - `HaBitStaking`: `0xDdE157A7A20f04a55C15f7541508667bbcC4dF8f`

## Verified Flow

- Server minter secret was accessible from Firebase Secret Manager and matched the configured `SERVER_MINTER_ADDRESS`
- Fresh `HaBit` and `HaBitStaking` contracts were deployed to BSC testnet
- Reserve premint landed on the dedicated rehearsal reserve address
- `MINTER_ROLE`, `RATE_UPDATER_ROLE`, and staking operator permissions were granted to the server minter
- Two rehearsal users were funded with gas and minted `300 HBT` each
- Success path:
  - stake tx: `0x84f56eda51b1bbf7b887fc4e6ca17a4b3bacf99ae19bd5840aed7edb39b4d804`
  - settle tx: `0xd3e6bd89a933c4eb42231375cb12b1c519bddaaf851f034069b2544430ab8e7e`
  - final balance: `300 HBT`
- Failure path:
  - stake tx: `0x0d902cf2ac53525321b6091628ada655fab8c659cb4f890c43f75eaf2d433bed`
  - settle tx: `0xf05dd1465b13097ee380c1e670388e4754e05ed0f9442d6616271ae1efa97678`
  - final balance: `250 HBT`

## Artifact

- Full JSON report: [dress-rehearsal-bscTestnet.json](C:/SJ/antigravity/habitschool/contracts/dress-rehearsal-bscTestnet.json)

## Notes

- The first rehearsal run exposed a BSC testnet RPC read-after-write consistency issue: `balanceOf()` immediately after `tx.wait()` briefly returned stale balances.
- The rehearsal script now polls until the post-settlement balances and `challengeStakes` state converge before declaring success.
- This clears the code-level launch blocker. Remaining launch items are operator-controlled inputs:
  - real `RESERVE_MULTISIG_ADDRESS`
  - real mainnet deployment
  - BscScan verification with a valid `BSCSCAN_API_KEY`
  - final production address/env flip and deploy
