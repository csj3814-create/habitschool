# 2026-04-23 Reward Market Control Tower Move

## Goal

- 관리자 전용 보상 마켓 업무를 사용자 자산 탭에서 분리한다.
- 관제탑(`admin.html`)에 보상 마켓 전용 탭을 추가해 발급 상태와 수동 처리 업무를 관리한다.
- 사용자 자산 탭은 교환과 쿠폰 보관함 중심으로 유지하고, 운영자 전용 신호는 노출하지 않는다.

## Checklist

- [x] 관제탑 탭 네비게이션에 `보상 마켓` 탭 추가
- [x] 관제탑 탭에 운영 요약 카드, 정책/준비금 영역, 쿠폰 발급 관제 테이블 추가
- [x] 관제탑에서 `adminResendRewardCoupon` / `refreshRewardMarketOpsNow` 액션 연결
- [x] 사용자 자산 탭에서 관리자 전용 재확인 액션 제거
- [x] 사용자 보상 마켓 스냅샷에서 관리자 전용 신호 제거
- [x] 사용자 보상 마켓 스타일에서 미사용 관리자 버튼 스타일 제거

## Review

- `admin.html`에 보상 마켓 전용 관제 탭을 추가해 가격 모드, 준비금, 비즈머니 상태, 발급 상태별 개수, 최근 발급 이력을 한 화면에서 볼 수 있게 했다.
- 관리자 수동 처리 동선은 관제탑 탭의 `운영 상태 갱신`과 `보관함 재확인`으로 모았고, 사용자 자산 탭에서는 해당 액션을 더 이상 렌더링하지 않는다.
- 사용자용 `getRewardMarketSnapshot` 응답에서는 관리자 여부/수동 재확인 가능 여부 같은 운영자 신호를 제거해 화면 책임을 분리했다.

## Verification

- [x] `node -c functions/reward-market.js`
- [x] `node -c functions/runtime.js`
- [x] `npm test`
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- [x] `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
- [x] `admin.html` 인라인 모듈 스크립트 파싱 확인
