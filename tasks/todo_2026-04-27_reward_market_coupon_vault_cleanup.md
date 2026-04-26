# 2026-04-27 Reward Market Coupon Vault Cleanup

## Checklist
- [x] 모바일 해빛 마켓 상단 문구와 가격 레이아웃을 더 짧고 촘촘하게 정리한다.
- [x] 쿠폰 보관함에 기본 바코드 미리보기와 탭 확대/닫기를 넣는다.
- [x] mock/실패 쿠폰 항목을 사용자가 목록에서 숨길 수 있게 한다.
- [x] 현재 상품의 유효기간 표기가 실제 상품 기준으로 나오게 맞춘다.
- [x] 테스트와 번들 검증을 다시 돌린다.

## Notes
- mock 쿠폰은 기존에 30일 만료를 고정으로 써서 현재 60일 상품과 어긋났다.
- 보관함은 PIN만 보이고 확대 가능한 시각 바코드가 없어 모바일 직관성이 떨어졌다.
- staging/mock 실패 항목은 발급 대기 상태로 쌓여도 사용자가 직접 정리할 수 없었다.

## Review
- 상단 카피를 `포인트로 바로 교환해요.`로 줄이고, 상태 문구도 더 짧게 정리했다.
- 상품 카드의 `교환 포인트`와 `쿠폰 금액`을 한 줄 가격 칩으로 묶어 모바일에서도 덜 끊기게 맞췄다.
- 쿠폰 보관함은 PIN 기반 바코드를 기본 미리보기로 보여주고, 탭하면 전체 화면으로 확대/다시 탭하면 닫히게 했다.
- mock/실패 쿠폰 항목은 `지우기` 버튼으로 숨길 수 있게 했고, mock 쿠폰 유효기간은 상품의 60일 기준을 따르게 맞췄다.
- `node -c functions/reward-market.js`, `node -c functions/runtime.js`, `npm test`, `npx esbuild js/reward-market.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\reward-market-check.js`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`, `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`를 통과했다.
