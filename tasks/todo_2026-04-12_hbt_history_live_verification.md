# 2026-04-12 HBT History Live Verification

## Goal

- Find why the live HBT transaction history still shows only challenge staking rows and make the live app return the expected onchain inflow/outflow history.

## Plan

- [ ] Inspect the current client and server HBT history path
- [ ] Check whether the live deployed function matches the latest local fix
- [ ] Apply the missing fix or deployment and verify against the real wallet
- [ ] Record the result and verification steps

## Review

- Findings:
  - The HBT history improvement commit `c35c990` only changed [functions/index.js](/C:/SJ/antigravity/habitschool/functions/index.js).
  - The recent deployments after that point were hosting-focused work, so the live callable `getHbtTransferHistory` appears to still be running the pre-fix server code.
  - That matches the current symptom exactly: the wallet UI still falls back to Firestore-only challenge staking rows because the onchain transfer scan fix has not reached the deployed functions runtime yet.
- Next step:
  - Deploy `functions` to staging first, verify the live callable returns onchain transfers, then promote the same functions deploy to prod.
