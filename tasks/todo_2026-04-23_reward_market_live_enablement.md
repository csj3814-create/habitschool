# 2026-04-23 Reward Market Live Enablement

## Goal

- Giftishow 실연동이 가능한 기본 요청/응답 구조를 코드에 내장하고, 운영자는 비밀값과 상품 매핑만 채우면 되게 만든다.
- `live` 모드에서 설정이 빠졌을 때 mock 발급으로 떨어지지 않도록 강하게 차단한다.
- 앱 내 쿠폰 보관함 수령 정책에 맞춰 전화번호 입력/저장 흐름과 라이브 상태 안내를 연결한다.

## Checklist

- [x] 실연동 readiness 체크와 누락 설정 목록을 서버 설정 응답에 노출
- [x] Giftishow 기본 body/header 템플릿을 공식 스펙 기준으로 내장
- [x] `live` 모드에서 mock fallback 제거
- [x] 라이브 발급 시 전화번호 확보 경로 추가
- [x] 사용자 프로필/보상 탭에서 수령 전화번호 저장 UX 연결
- [x] Firestore rules에 신규 사용자 필드 반영
- [x] 테스트에 라이브 readiness/전화번호 흐름 추가
- [x] 검증 명령 전체 재실행

## Notes

- Giftishow 공식 규격 기준 핵심 API 코드는 `0101(goods)`, `0204(send)`, `0201(coupon status)`, `0203(resend)`, `0301(balance)`다.
- 공개 문서상 `send` 요청에 `phone_no`가 포함되므로, 앱 보관함 전달을 기본으로 하더라도 운영 계약 범위가 확인되기 전까지는 수령 전화번호를 안전하게 보관한다.
- 오늘 목표는 “운영값만 넣으면 실발급 가능” 상태까지다. 실제 상용 전환에는 Giftishow 계약 계정값과 상품 코드 매핑이 추가로 필요하다.

## Review

- `functions/reward-market.js`에 Giftishow 기본 요청 템플릿, GET query 지원, live readiness 차단, 수령 연락처 해석/저장을 추가했다.
- `functions/runtime.js`는 snapshot에 사용자 연락처 상태를 싣고, redeem 호출에 Firebase Auth `phone_number` fallback을 넘기게 바꿨다.
- `js/reward-market.js`는 연락처 입력/저장 패널을 추가하고, live redeem 직전 스냅샷 재조회 후 최신 발급 가능 상태를 확인하게 정리했다.
- `firestore.rules`는 `users/{uid}.rewardRecipientPhone`을 허용하되 `0`으로 시작하는 10~11자리만 저장하도록 제한했다.
- 남은 외부 의존성은 실제 Giftishow 계약값과 상품 코드 매핑, 그리고 운영 환경 변수 주입이다.

## Verification

- [x] `node -c functions/reward-market.js`
- [x] `node -c functions/runtime.js`
- [x] `npm test`
- [x] `npx esbuild js/reward-market.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-reward-market-check.js`
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- [x] `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
