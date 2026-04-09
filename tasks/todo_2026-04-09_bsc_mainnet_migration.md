# 2026-04-09 BSC mainnet migration prep

## Plan

- [x] Confirm the current runtime path for token minting, challenge staking, and chain/network selection
- [x] Lock the architecture to BSC only with a two-contract model: `HaBit` for token/rate, `HaBitStaking` for challenge rules
- [x] Update frontend and Cloud Functions to use the correct BSC mainnet/testnet config and contract split
- [x] Replace stale deploy / role scripts with multisig-safe current-interface scripts
- [x] Write an operator runbook for mainnet launch, rollback, and incident handling
- [x] Verify with available tests and bundle checks

## Notes

- User decision: BSC is the single target chain.
- User decision: challenge logic should live in `HaBitStaking`, so mainnet should be treated as a two-contract architecture.
- Preserve existing unrelated Android/local task changes in the worktree.

## Review

- Frontend and Functions now prefer the `HaBitStaking` custody path while keeping the legacy token staking path as a compatibility fallback.
- BSC-only deploy tooling is in place: `deploy.js`, `setup-minter.js`, `revoke-roles.js`, `fix-operator.js`, `fund-minter.js`, `deploy-staking.js`, `export-abi.js`.
- Mainnet docs were rewritten around BSC + multisig reserve + operator runbook, and Base RPC/CSP drift was removed from active app/docs.

## Verification

- `cd contracts && npx hardhat compile`
- `cd contracts && npx hardhat test`
- `cd contracts && npm run export:abi`
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
