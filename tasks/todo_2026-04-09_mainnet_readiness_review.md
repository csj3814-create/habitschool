# 2026-04-09 Mainnet Readiness Review

## Plan

- [x] Review existing mainnet docs, tokenomics docs, and launch notes
- [x] Inspect contract, frontend, and Cloud Functions chain configuration
- [x] Check operational scripts for role grant, deploy, and recovery readiness
- [x] Summarize highest-risk blockers before mainnet

## Findings

### Cleared in this pass

- The agreed challenge tokenomics policy is now implemented in the live settlement path. Cloud Functions compute weekly/master bonus rates from the current phase, apply an additional halving when `MSE30 >= 3`, and persist the effective rate onto each newly started challenge so in-flight challenges do not drift.
- Public tokenomics docs and challenge UI copy now describe phase-based bonuses instead of fixed `+50% / +200%` outcomes. The app challenge slider preview also consumes the server-provided live policy.

### Cleared in this pass

- A live BSC testnet dress rehearsal has now been completed. Fresh contracts were deployed, server roles were granted, and the full `mint -> stake -> success settle -> fail settle` flow completed successfully with a recorded JSON artifact in [contracts/dress-rehearsal-bscTestnet.json](C:/SJ/antigravity/habitschool/contracts/dress-rehearsal-bscTestnet.json).

### Remaining operator prerequisites

- Real mainnet inputs are still required before launch:
  - `RESERVE_MULTISIG_ADDRESS`
  - `BSCSCAN_API_KEY`
  - mainnet deployment addresses
  - final production env/address flip and deploy

## Review

- BSC single-chain alignment, two-contract split, deploy scripts, role scripts, and runtime gating are in much better shape now.
- Verification rerun on 2026-04-09 passed:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
  - `cd contracts && npx hardhat test`
- Code and launch choreography are now in a much healthier state. Mainnet should still wait for the operator-controlled prerequisites above, but the prior code-level `no-go` blocker around missing on-chain rehearsal has been cleared.
