# 2026-05-18 쿠폰 삭제 및 호흡 가이드 조정
> **상태**: 진행 중

## 작업
- [x] 활성 쿠폰 사용 완료 처리 추가
- [x] 사용 완료/만료 쿠폰 완전 삭제 처리 추가
- [x] 만료 후 30일 지난 쿠폰 자동 삭제 스케줄러 추가
- [x] 마음 탭 호흡 3종 5분/3사이클 안내/큰 non-soft 톤 반영
- [x] PWA 캐시 버전 v190 반영
- [x] 테스트 및 번들 검증

## 결과
- `markRewardCouponUsed` callable로 활성 발급 쿠폰을 `used_completed` 상태로 바꾼 뒤 삭제 가능하게 했다.
- `deleteRewardCoupon` callable로 사용 완료/만료/실패/취소 쿠폰 문서를 실제 삭제하도록 했다.
- `cleanupExpiredRewardCoupons` 스케줄러로 만료 후 30일 지난 쿠폰을 매일 자동 삭제하도록 했다.
- 호흡 3종은 5분으로 늘리고, 음성 안내는 3사이클까지 유지하며 non-soft 알림음 볼륨을 0.8로 올렸다.
- 빈 마음 기록에서 타이머가 `00:00`으로 초기화되던 문제도 함께 보정했다.

## 검증
- `npx vitest run tests/reward-market.test.js tests/reward-market-ui.test.js tests/meditation-guide.test.js tests/pwa-versioning.test.js` 통과
- `npm test` 통과 (`41 passed`, `295 passed`)
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 통과
- `node --check functions/reward-market.js` 통과
- `node --check functions/runtime.js` 통과
- 로컬 서버 `http://localhost:5173/?tab=sleep`에서 MS Edge Playwright 스모크 통과: desktop/mobile 모두 `5분`, `05:00`, 쿠폰 보관함 DOM, 콘솔 error/warn 없음 확인
- 로컬 서버에서 자산 탭 -> 마음 탭 클릭 전환 확인: 쿠폰 보관함 DOM 유지, 마음 타이머 `05:00`, 콘솔 error/warn 없음
