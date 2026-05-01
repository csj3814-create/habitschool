# 2026-05-01 Admin reward market permission and MVP ranking check

## Goal
- Restore the admin reward market panel when the control tower is opened on production.
- Explain why 김진희 can have a 30-day streak but not appear in MVP TOP 3.
- Fix permission/ranking issues if the code or rules are wrong.

## Checklist
- [x] Inspect admin reward market Firestore reads and rules
- [x] Inspect community-history MVP ranking formula and archive data path
- [x] Patch rules/code if needed
- [x] Verify tests/build/rules checks
- [x] Document outcome

## Notes
- Production admin screenshot shows `Missing or insufficient permissions` in coupon issuance control.
- Community archive screenshot shows April 2026 chips include `김진희 30일`, while MVP TOP 3 are 최석재, Sangmin, 윤효은.

## Outcome
- Current repository rules already allow admin reads for `reward_redemptions`, `reward_reserve_metrics`, `reward_market_pricing`, `reward_catalog`, and related reward-market ops collections.
- The production issue was consistent with Firestore rules not being released after reward-market admin access was added. Released the current `firestore.rules` to production with `firebase deploy --project prod --only firestore:rules`.
- MVP ranking is not a pure streak ranking. The current formula in both `computeCommunityStatsLogic` and monthly MVP reward distribution is `days * 10 + comments * 3 + reactions`.
- In the screenshot, the third-place score is 윤효은: `25*10 + 0*3 + 174 = 424`. A 30-day member with little engagement starts at `300`, so 김진희 would need at least `125` weighted engagement points (`comments*3 + reactions`) to pass that score.
