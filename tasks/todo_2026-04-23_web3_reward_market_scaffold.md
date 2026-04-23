# 2026-04-23 Web3 Reward Market Scaffold

## Goal

- 기존 자산 탭 구조 위에 해빛스쿨 Web3 보상 마켓의 기본 골격을 추가한다.
- 포인트/HBT/쿠폰 흐름을 한 번에 뒤엎지 않고, 현행 앱과 충돌하지 않는 스캐폴드로 구현한다.
- 기프티쇼 비즈 실 API 키가 없어도 수동 테스트와 후속 자동화를 바로 이어갈 수 있는 데이터 모델과 호출 경계를 만든다.

## Scope

- [x] 자산 탭에 `해빛 마켓`과 `쿠폰 보관함` UI 골격 추가
- [x] Cloud Functions에 상품 조회/교환 요청용 서버 진입점 추가
- [x] Firestore에 reward catalog / coupon / reserve accounting 문서 구조 반영
- [x] 기존 포인트→HBT 변환 UI와 충돌하지 않도록 최소 결합으로 연결
- [x] 프로젝트 검증 명령 실행 후 결과 기록

## Assumptions

- 기존 `coins`는 오프체인 포인트 잔액으로 유지한다.
- 기존 `mintHBT` 온체인 변환 로직은 즉시 제거하지 않고 유지한다.
- 오늘 추가하는 교환 플로우는 `HBT 소각 요청 -> 서버 검증/주문 기록 -> 쿠폰 문서 생성` 스캐폴드까지 구현한다.
- 실제 기프티쇼 비즈 호출은 환경변수/시크릿이 없으면 mock fallback 으로 동작하게 만든다.
- `2,000 HBT` 최소 교환 단위는 신규 보상 마켓 교환 기준으로 적용한다.

## Review

- `functions/reward-market.js`를 추가해 reward catalog fallback, Giftishow adapter, reward redemption ledger, reserve accounting, burn hash idempotency를 분리했다.
- `functions/runtime.js`에는 `getRewardMarketSnapshot`, `redeemRewardCoupon` callable만 얹어 기존 자산/민팅 흐름과 결합도를 낮췄다.
- 자산 탭에는 `해빛 마켓`, `쿠폰 보관함`을 추가하고 `js/reward-market.js`로 스냅샷 렌더링과 mock/live 모드 교환 흐름을 붙였다.
- live 모드에서는 `js/blockchain-manager.js`가 HBT `burn()` 후 `burnTxHash`를 서버에 넘기고, 실패 재시도를 위해 로컬 pending redemption 상태를 잠깐 보관한다.
- `blockchain_transactions`에는 `reward_redemption` 요약 행만 남기고, 실제 정산 원장은 `reward_redemptions`, `reward_reserve_ledger`, `reward_reserve_metrics`로 분리했다.
- 구조 설명은 `tasks/2026-04-23_web3_reward_market_spec.md`에 정리했다.

## Verification

- `node -c functions/reward-market.js`
- `node -c functions/runtime.js`
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
