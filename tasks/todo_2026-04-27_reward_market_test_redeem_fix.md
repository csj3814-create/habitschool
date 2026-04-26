# Reward Market Test Redeem Fix (2026-04-27)

## Plan
- [x] staging `redeemRewardCoupon` 오류 로그를 확인한다.
- [x] 테스트 발급 경로에서 누락된 서버 참조를 수정한다.
- [x] mock 발급 경로를 직접 도는 회귀 테스트를 추가한다.
- [x] 검증 후 필요하면 staging 재배포한다.

## Notes
- staging 함수 로그에서 `redeemRewardCoupon error: ReferenceError: reserveLedgerRef is not defined`가 확인됐다.
- 원인은 points 정산 경로에서 `reward_reserve_ledger` 문서 ref를 생성하지 않은 채 batch write를 수행한 것이었다.
- `createReserveLedgerRef(db)` helper로 공통화해 legacy/new redemption 경로가 같은 방식으로 ref를 만들게 정리했다.

## Review
- staging 함수 로그에서 `reserveLedgerRef is not defined`를 확인하고 helper 기반 ref 생성으로 수정했다.
- `npm test`, `node -c functions/reward-market.js`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`를 통과했다.
- `main`에 푸시 후 `firebase deploy --project habitschool-staging --only "hosting,functions"`로 staging 반영을 마쳤다.
