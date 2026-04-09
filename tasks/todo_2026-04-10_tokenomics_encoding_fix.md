# 2026-04-10 Tokenomics Encoding Fix

## Plan
- [x] Find whether the garbling came from source corruption or deployment-only corruption
- [x] Restore `tokenomics.html` from the last clean version
- [x] Reapply BSC/mainnet and challenge-policy text updates without reintroducing encoding damage
- [ ] Run verification
- [ ] Prepare commit/push summary and ask for deploy confirmation

## Notes
- `tokenomics.html` in commit `8480569` was corrupted, while `HBT_TOKENOMICS.md` remained readable and was used as the content reference.
- Safe recovery path: restore `tokenomics.html` from `aa38cca`, then reapply only the intended BSC/challenge copy changes.

## Review
- Pending verification and staging redeploy confirmation.
