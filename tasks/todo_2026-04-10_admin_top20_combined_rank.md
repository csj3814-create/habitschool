## 2026-04-10 관리자 TOP20 환산 정렬

- [x] 관리자 자산 & HBT 탭 TOP20 정렬 로직 위치 확인
- [x] 현재 P→HBT 전환 비율을 불러와 합산 점수 계산으로 정렬 변경
- [x] 검증 실행 후 결과 기록

### 메모

- 요청: `현재 포인트 TOP 20`은 포인트만이 아니라 `현재 포인트 × 현재 HBT 전환 비율 + 현재 HBT` 기준으로 높은 순서 정렬
- 예시: 현재 `1P = 4HBT`라면 `8675P + 34605HBT` 사용자는 `8675*4 + 34605` 기준으로 비교

### 구현

- `admin.html`의 자산 & HBT 탭 로드 시 `getTokenStats` callable로 현재 `currentRate`를 읽도록 추가
- `RATE_SCALE(1e8)` 기준으로 `1P당 HBT` 값을 계산
- TOP 20 데이터에 `combinedScore = coins * currentRatePerPoint + hbt`를 추가
- 정렬은 `combinedScore` 우선, 동점이면 `coins`, 그다음 `hbt` 순으로 처리
- 표시는 기존과 동일하게 `현재 포인트`, `현재 HBT`, `스트릭`만 유지

### 검증

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
