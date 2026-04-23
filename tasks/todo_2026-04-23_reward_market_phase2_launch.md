# 2026-04-23 Reward Market Phase Launch

## Goal

- 해빛 마켓을 `phase1_fixed_internal`과 `phase2_hybrid_band` 두 가격 모드로 운영할 수 있게 만든다.
- 앱 내 쿠폰 보관함에서 `couponImgUrl + PIN` 중심으로 실사용 정보를 보여준다.
- 비즈머니/발급 한도/수동 재전송 이력을 서버 원장에 남겨 실제 운영 판단이 가능하게 한다.

## Checklist

- [x] 서버 가격 정책을 `phase1_fixed_internal` / `phase2_hybrid_band`로 분리
- [x] 7일 TWAP + KRW 환산 + 일/주 밴드 기반 가격 스냅샷 구조 추가
- [x] 일/주/월 HBT 발급 한도와 최소 비즈머니 기준 추가
- [x] `getRewardMarketSnapshot`에 가격/전달/한도 메타데이터 추가
- [x] `redeemRewardCoupon`에 quote metadata 저장 및 실발급 가드 추가
- [x] 온체인 burn tx 검증 로직 추가
- [x] `failed_manual_review` 상태와 관리자 수동 재확인 callable 추가
- [x] 앱 쿠폰 보관함에 이미지/PIN/상태/관리자 재확인 UX 반영
- [x] Firestore rules에 신규 서버 전용 컬렉션 반영
- [ ] 실 Giftishow body template/env 값 주입
- [ ] 실 TWAP feed 적재 소스 운영 연결

## Defaults

- Phase 1 pricing mode: `phase1_fixed_internal`
- Phase 2 pricing mode: `phase2_hybrid_band`
- Daily band: `±10%`
- Weekly cumulative band: `±25%`
- Daily / weekly / monthly issuance limit: `20,000 / 100,000 / 300,000 HBT`
- Minimum bizmoney floor: `30,000 KRW`
- Delivery mode: `app_vault`
- Fallback policy: `manual_resend`
- Phase 1 reference end date: `2026-05-23`

## Review

- `functions/reward-market.js`에서 가격 스냅샷, 비즈머니 sync, 발급 가드, 수동 재전송 원장을 한 모듈로 정리했다.
- `functions/runtime.js`에서는 reward redeem 시 burn tx 검증을 붙이고, 관리자 재확인 callable과 주기적 ops sync scheduler를 추가했다.
- `js/reward-market.js`는 snapshot 메타데이터를 읽어 액션 가능 여부를 UI에서 바로 보이게 바꾸고, 쿠폰 이미지를 앱 내에서 직접 렌더링하게 바꿨다.
- 남은 외부 의존성은 Giftishow 상용 body/header template와 TWAP feed 적재 채널이다.

## Verification

- [x] `node -c functions/reward-market.js`
- [x] `node -c functions/runtime.js`
- [x] `npm test`
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- [x] `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
