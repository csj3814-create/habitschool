# 2026-04-09 Mainnet Policy Alignment

## Plan

- [x] Snapshot the agreed challenge policy into code-level rules
- [x] Implement phase and MSE30-aware challenge bonus rates in Cloud Functions
- [x] Store the applied bonus policy at challenge start so in-flight challenges do not change
- [x] Update challenge UI copy and reward previews to reflect the live effective rates
- [x] Align public tokenomics docs with the implemented behavior
- [x] Re-run tests and bundle verification

## Policy

- Master cap stays `10,000 HBT`
- Weekly cap stays `5,000 HBT`
- Base bonus rates by phase:
  - Weekly: `50% -> 25% -> 12.5% -> 6.25% ...`
  - Master: `200% -> 100% -> 50% -> 25% ...`
- Additional halving applies when `MSE30 >= 3`
- `MSE30 = recent 30-day master full-completion staked total / 10,000`
- Bonus policy changes apply only to newly started challenges

## Notes

- Keep backward compatibility for already-started challenges by using stored bonus metadata when present and legacy fixed rates when absent.
- Leave unrelated Android/local changes untouched.

## Review

- Cloud Functions now compute live weekly/master challenge bonus rates from the current phase and `MSE30`, snapshot that policy at challenge start, and reuse the stored rate at claim time.
- `getTokenStats()` now exposes the effective challenge bonus policy so the client can render live slider previews without hardcoded `+50% / +200%` assumptions.
- `HaBitStaking.sol` legacy settlement no longer emits fixed bonus math, which keeps the on-chain custody path aligned with the off-chain bonus minting policy.
- Public tokenomics docs were updated to describe phase-based challenge bonuses instead of fixed 150% / 300% returns.
- Verification passed on 2026-04-09:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
  - `cd contracts && npx hardhat test`
