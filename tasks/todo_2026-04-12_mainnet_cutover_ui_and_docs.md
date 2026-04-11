# 2026-04-12 Mainnet Cutover UI and Docs

## Goal

- Align the app, admin-facing copy, and public docs with the BNB Smart Chain mainnet cutover work.
- Remove stale testnet-era wording from the wallet experience.
- Surface active-chain contract information clearly so the cutover state is easier to verify.

## Plan

- [x] Review the active chain config, wallet UI, tokenomics page, and changelog
- [x] Update the wallet tab defaults and active-chain copy for mainnet cutover readiness
- [x] Add active token / staking explorer links in the wallet section
- [x] Refresh tokenomics copy, roadmap, and contract address references
- [x] Add a 2026-04-12 changelog entry for the mainnet cutover update
- [x] Sync the long-form tokenomics docs with the updated public page
- [x] Run verification (`npm test`, app bundle check, main bundle check)

## Review

- Wallet tab copy now avoids stale `1:1` / `BSC 테스트넷` defaults and instead follows the active chain config plus the latest onchain `currentRate`.
- Added active explorer links for the HBT token contract and the staking contract so operators and users can verify the live chain faster from the wallet surface.
- Updated the public tokenomics page and long-form tokenomics docs with the 2026-04-12 mainnet launch context, live contract addresses, and the `1P = 4 HBT` mainnet cutover baseline.
- Added a new 2026-04-12 public changelog entry that explains the wallet and tokenomics refresh in user-facing language.
- Admin audit result: no separate UI wording change was required in `admin.html`; the control-tower token stats already read `currentRate` from the live backend.
 
## Follow-up Fixes
 
- [x] Bump the production-facing service worker and cache version to `122`
- [x] Replace generic wallet conversion / halving helper copy with the live onchain `currentRate`
- [x] Mark the halving progress card with the active chain source so testnet/mainnet is obvious
- [x] Clear stale pre-mainnet challenge state from the wallet tab
- [x] Write chain metadata on challenge records and challenge transaction logs
- [x] Prepare prod/staging Functions env files so the next deploy pins prod to mainnet
- [ ] Re-verify the live callable `getTokenStats` response before the next production deploy

## Wallet History Follow-up

- [x] Verify whether the wallet transaction history is filtered to the active chain
- [x] Split the wallet history box into paginated HBT and point sections
- [x] Show 5 items per page for HBT history and point history
- [x] Point the wallet HBT link at the token-holder view for the active wallet address
- [x] Point the challenge/staking link at the token-holder view for the staking contract
- [x] Replace visible `currentRate` copy in the wallet tab with `비율`
- [x] Bump app/service-worker cache version to `123` for the wallet-history refresh
