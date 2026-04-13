# 2026-04-14 Retroactive Point Cutoff

## Plan
- [x] 확인: 저장 버튼/포인트 계산/Cloud Function 지급 흐름 점검
- [x] 구현: 전날까지는 포인트 지급, 2일 전부터는 저장만 허용
- [x] 구현: 2일 이상 지난 날짜 선택 시 CTA 위 경고 문구 표시
- [x] 구현: 오래된 날짜에서는 저장 버튼 문구도 무포인트 흐름에 맞게 조정
- [x] 검증: 테스트 및 번들 체크

## Notes
- 저장 자체는 계속 허용해야 한다.
- 이미 과거에 받은 포인트는 유지하고, 2일 이상 지난 날짜에서 새 증가만 막는다.
- 클라이언트 안내만으로는 악용을 막기 어려우므로 지급 경로도 같이 본다.

## Review
- `js/app.js`에서 선택 날짜 기준 reward policy를 공통 helper로 묶었다.
- 2일 이상 지난 날짜는 기존에 받은 `awardedPoints`만 유지하고 새 증가분은 막는다.
- CTA helper와 저장 버튼 문구를 날짜 정책과 맞췄다.
- `functions/index.js`의 `awardPoints`도 같은 cutoff를 적용해 클라이언트 우회 지급을 막았다.
- 검증:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
  - `node -c functions/index.js`
