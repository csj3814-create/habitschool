# 2026-05-18 쿠폰 삭제와 호흡 가이드 정리

> **상태**: 완료

## 목표
- 활성 쿠폰은 먼저 `사용 완료`로 표시하고, 사용 완료/기간 만료/실패/취소 쿠폰만 사용자가 완전히 삭제할 수 있게 한다.
- 기간 만료 후 30일이 지난 쿠폰은 서버 스케줄러가 자동 삭제한다.
- 사용 완료 또는 기간 만료 쿠폰은 보관함에서 기본 접힘 상태로 보여 민감한 사진/바코드를 바로 노출하지 않는다.
- 마음 탭 호흡 3종은 5분으로 늘리고, 음성 안내는 3사이클까지만 나오게 하며, 4번째 사이클부터 쓰는 non-soft 톤만 0.8로 키운다.
- PWA 캐시 회피를 위해 앱 버전을 v190으로 갱신한다.
- 사용자 체감 변경점을 문서와 changelog에 정리한다.

## 체크리스트
- [x] `markRewardCouponUsed` callable 추가
- [x] `deleteRewardCoupon` callable 추가
- [x] `cleanupExpiredRewardCoupons` scheduled function 추가
- [x] 만료 후 30일 전 쿠폰은 스냅샷에 유지하고, 30일 초과 쿠폰은 제외
- [x] 보관함에 `사용 완료` 버튼과 조건부 `삭제` 버튼 추가
- [x] 삭제 확인창에 쿠폰 정보가 완전히 사라진다는 안내 추가
- [x] 호흡 3종 `durationSec` 300초 적용
- [x] 음성 안내 3사이클 적용
- [x] non-soft 톤 peak limit/inhale/hold/exhale 0.8 적용
- [x] PWA 버전 `v=190`, `habitschool-v190` 적용
- [x] 사용 완료/기간 만료 쿠폰 기본 접힘 UI 구현
- [x] 접힌 쿠폰 클릭 시 사진/바코드/PIN 상세 다시 펼침 구현
- [x] changelog 업데이트
- [x] 테스트와 브라우저 검증 결과 기록

## 구현 메모
- 완전 삭제는 `reward_redemptions/{id}` 문서 삭제를 뜻한다. 포인트 거래 내역 같은 회계성 기록은 잔액 감사용으로 유지한다.
- 활성 쿠폰은 실수 방지를 위해 바로 삭제하지 않고, 사용자가 먼저 `사용 완료`를 누른 뒤 삭제할 수 있게 한다.
- 사용 완료/기간 만료 쿠폰의 접힘 상태는 클라이언트 화면 상태로만 관리한다. 서버 문서에는 보존/삭제 상태만 저장한다.

## 완료된 검증
- `npx vitest run tests/reward-market.test.js tests/reward-market-ui.test.js tests/meditation-guide.test.js tests/pwa-versioning.test.js` 통과
- `npm test` 통과 (`41 files`, `295 tests`)
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 통과
- `node --check functions/reward-market.js` 통과
- `node --check functions/runtime.js` 통과
- 로컬 서버 `http://localhost:5173/?tab=sleep`에서 MS Edge Playwright 스모크 통과: desktop/mobile 모두 `5분`, `05:00`, 쿠폰 보관함 DOM, 콘솔 error/warn 없음
- 스테이징 배포 완료: `2b7989e`, `bda896e`를 `origin/main`에 푸시하고 `https://habitschool-staging.web.app`에 v190 배포
- 스테이징 확인: `markRewardCouponUsed`, `deleteRewardCoupon`, `cleanupExpiredRewardCoupons` 함수 목록 확인, `sw.js`의 `habitschool-v190` 확인
- `npx vitest run tests/reward-market-ui.test.js tests/pwa-versioning.test.js tests/index-html-integrity.test.js` 통과
- `npm test` 통과 (`41 files`, `296 tests`)
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 통과
- 활성 앱 파일에서 `v=190`, `habitschool-v190` 잔여 참조 없음
- Browser 검증: `http://localhost:5173/?tab=asset` 로컬 앱은 v191 자산을 로드하고 콘솔 error/warn 없음. 실제 쿠폰 데이터는 로그인 필요로 직접 보관함 데이터 상태까지 진입하지 못함.
- Browser 검증용 로컬 HTTP 페이지 `http://127.0.0.1:5191/`에서 실제 `styles-reward-market.css` 적용 확인: 접힘 상태 `filter: blur(0.8px)`, `opacity: 0.58`, 미디어 `display: none`; 클릭 후 `aria-expanded="true"`, 미디어 `display: flex`.
- 모바일 폭 390px 검증: 접힌 요약은 가로 넘침 없음, 펼친 바코드는 viewport 안에 유지됨.
