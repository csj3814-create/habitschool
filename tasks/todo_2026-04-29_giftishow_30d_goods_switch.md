# 2026-04-29 기프티쇼 30일 상품 코드 전환

## 목표
- 해빛 마켓 공개 쿠폰 2종을 실제 API 발급 가능한 30일 상품 코드와 6% 할인 매입가 기준으로 맞춘다.
- 빽다방 15일 상품 `G00004450931`이 API 상품 목록/실발급 대상인지 확인한다.
- 코드, 시드, 테스트, 스테이징 Firestore 데이터를 함께 갱신하고 검증한다.

## 체크리스트
- [x] 현재 카탈로그 코드와 상품 코드 사용 경로 확인
- [x] 기프티쇼 API에서 15일 상품 노출 여부 확인
- [x] 30일 상품 코드/가격 기준 반영
- [x] 테스트와 문서 갱신
- [x] 검증
- [ ] 본서버 배포

## 메모
- MGC 30일: goodsNo 52118 / goodsCode G00002861259
- 빽다방 30일: goodsNo 52304 / goodsCode G00002871294
- 빽다방 15일 후보: goodsNo 61443 / goodsCode G00004450931

## 확인 결과
- 기프티쇼 `goods` API 0101 상용 목록 2,314개를 24페이지까지 확인했다.
- `G00002861259`는 goodsNo `52118`, `discountPrice 1880`, `discountRate 6`, `limitDay 30`, `goodsStateCd SALE`로 노출된다.
- `G00002871294`는 goodsNo `52304`, `discountPrice 1880`, `discountRate 6`, `limitDay 30`, `goodsStateCd SALE`로 노출된다.
- `G00004450931`은 현재 인증키의 API 상품 목록에 없으므로 발급 주문 코드로 쓰지 않는다.
- 코드 fallback catalog와 시드 JSON은 공개 상품 2종을 30일 상품 코드와 매입가 1,880원 기준으로 맞췄다.
- `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`, `git diff --check`를 통과했다.
