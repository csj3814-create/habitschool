# 2026-04-27 Reward Market Vault Visuals

## Checklist
- [x] 쿠폰 보관함에 상품 이미지와 바코드를 함께 보이게 할 구조를 정한다.
- [x] 테스트 바코드에 `테스트` 라벨과 밝은 전체화면 확대 표시를 넣는다.
- [x] 테스트 쿠폰 `사용 완료` 버튼과 실패/대기 항목 정리 버튼을 연결한다.
- [x] 테스트와 번들 검증을 다시 돌린다.

## Notes
- 현재 보관함은 쿠폰 이미지/PIN만 우선이라 상품 이미지가 같이 보이지 않는다.
- mock 쿠폰은 `issued`여도 서버 dismiss 허용이 막혀 있어 `사용 완료` UI를 붙일 수 없다.
- 실제 쿠폰 사용 여부는 현재 공급사 실시간 사용완료 webhook/조회 연동이 없어 자동 소거되지 않는다.

## Review
- 쿠폰 보관함에서 상품 이미지와 바코드/PIN을 함께 보이게 정리했다.
- mock 바코드는 `테스트` 라벨을 붙이고, 전체화면 확대는 밝은 흰 배경의 세로형 카드로 바꿨다.
- 테스트 발급 완료 쿠폰은 `사용 완료`, mock 실패/대기 항목은 `지우기`로 숨길 수 있게 server/client dismiss 조건을 넓혔다.
- 실제 쿠폰은 현재 공급사 사용완료 상태를 자동으로 받아 보관함에서 제거하는 연동이 없어 그대로 유지된다.
- `node -c functions/reward-market.js`, `node -c functions/runtime.js`, `npm test`, `npx esbuild js/reward-market.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\reward-market-check.js`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`를 통과했다.
