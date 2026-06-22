# 2026-06-22 unpeu205 HBT Increase Audit

## Plan
- [x] Identify the production user document and wallet for `unpeu205@gmail.com`
- [x] Collect recent Firestore HBT transactions, challenges, and adjustment records
- [x] Compare the app ledger with the wallet's on-chain balance and Transfer history
- [x] Determine whether the reported 9,500 HBT increase is expected or erroneous
- [x] Add start/settlement guardrails for the aggregate staking contract
- [x] Run the project verification commands
- [x] Document evidence and required account reconciliation

## Notes
- User report: the account suddenly showed about 9,500 additional HBT several days ago.
- HBT display uses the active-chain wallet balance as the source of truth.
- This audit is read-only unless a confirmed accounting error requires a separately justified correction.
- Production UID: `v0PSe8MFXGMQFCOxHyc4BOasw8o2`
- Production wallet: `0xdBAF9EE3db36e296846616D6AD425B59dab28d39`
- Firestore currently records active master 7,000 HBT plus weekly 50 HBT, while the staking contract holds only 50 HBT.
- On 2026-06-12 the weekly settlement transaction returned 12,000 HBT even though that challenge recorded a 5,000 HBT stake. The extra 7,000 HBT was the concurrently active master principal.
- The same weekly completion minted a legitimate 2,500 HBT bonus. After the next 5,000 HBT weekly re-stake, the visible liquid increase was exactly 9,500 HBT.
- The wallet's current 20,900 HBT total control (20,850 liquid + 50 staked) equals 18,400 HBT from point conversions plus 2,500 HBT legitimate challenge bonus. No unbacked mint occurred; the error is premature release and stale per-tier accounting.
- Production scan: 381 users, 2 active stakers, and both active stakers have Firestore/on-chain stake drift caused by concurrent paid tiers.
- Prevention implemented:
  - Paid challenge start performs a server preflight before the wallet approves the staking contract.
  - Weekly and master challenges remain simultaneously available.
  - New deposits use the deployed contract's tier-keyed `activeChallenges[user][tier]` path instead of the aggregate `challengeStakes[user]` path.
  - Settlement synchronizes completion days and settles only the requested weekly or master tier.
  - Older aggregate stake records remain on the compatibility path and are checked before settlement.
  - App cache version advanced from v211 to v212.
- Account reconciliation completed:
  - The master challenge's 7,000 HBT principal is marked as already returned by the 2026-06-12 weekly settlement.
  - The principal cannot be returned a second time.
  - The challenge remains active and keeps a 7,000 HBT completion-bonus basis.
  - Audit document: `stake_reconciliations/v0PSe8MFXGMQFCOxHyc4BOasw8o2_master_20260612`.

## Review
- Root cause confirmed: the deployed staking contract stores one aggregate `challengeStakes[user]` balance, while Firestore tracks weekly and master stakes separately. Resolving either tier empties and returns the aggregate balance.
- `npm test`: 46 files, 336 tests passed.
- `contracts/npm test`: 37 tests passed, including simultaneous weekly/master isolation.
- Browser bundle check passed with esbuild.
- `functions/runtime.js` syntax check and `git diff --check` passed.
- Local browser smoke check passed at `http://localhost:5005`: correct page identity, nonblank login/app shell, guest modal interaction, and no console warnings/errors.
- Authenticated asset-tab interaction was not run in the isolated browser session.
- Production user reconciliation committed at `2026-06-22T06:48:39.439455Z`.
- Mainnet read verification confirmed the configured server wallet is an authorized staking operator and the deployed contract exposes independent weekly/master tier slots.
