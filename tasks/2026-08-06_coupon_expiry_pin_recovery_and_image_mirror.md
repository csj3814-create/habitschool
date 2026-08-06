# 2026-08-06 쿠폰 만료일 오염 · PIN/바코드 복구 · 공급사 이미지 미러링

## 확정된 근본 원인

스테이징 `redeemRewardCoupon` 2026-08-05T09:30:54Z 로그:

```
Error: Value for argument "seconds" must be within [-62135596800, 253402300799]
inclusive, but was: 1752328027852
    at redeemRewardCoupon (/workspace/reward-market.js:3446:17)   // await batch.commit()
```

역산 검증 (정확히 일치):

```
Date.UTC(2026, 7, 5, 9, 30, 52, 213) + 20260904 * 86400000  ->  seconds 1752328027852
```

`mapGiftishowGoodsItem()`이 기프티쇼 `limitDay`를 무조건 "일수"로 읽는다. 기간지정 상품은
이 자리에 종료일(YYYYMMDD, 예: `20260904`)이 오므로 유효기간이 20,260,904일이 되고,
`expiresAt`이 Firestore Timestamp 범위를 벗어나 발급 기록 커밋 전체가 실패한다.

크래시 지점이 기프티쇼 주문(0204) **성공 이후**라서, 공급사에서는 발급·문자 발송이 끝났는데
Firestore 문서만 `pending_issue`로 남는다. `pinCode`/`couponImgUrl`이 비어 있으니 보관함이
바코드 대신 `문자 발송 완료 · 문자함 확인`을 보여준다. 표시 기능이 사라진 게 아니라 데이터가 없다.

별개로 2026-07-18 커밋 `d44000d`가 `http://` 공급사 쿠폰 이미지를 HTTPS 앱에서 렌더하지 않도록
막았다. mixed content 방어 자체는 옳지만, 그 결과 KT 비즈 기프티콘 이미지가 아예 안 보이게 됐다.

## 계획

- [x] 1. `limitDay`를 일수로 단정하지 않는다. 8/14자리 실제 날짜면 잔여일로 환산하고, 일수로 볼 수 없는 값은 후보에서 제외한다
- [x] 2. `resolveRewardValidityDays()`에서 상식 범위(1~3650일)로 클램프해 모든 읽기 경로를 한 번에 막는다
- [x] 3. `toSafeFirestoreDate()`가 fallback도 범위 검증한다 — 오염된 값이 두 번 다시 커밋까지 못 가게
- [x] 4. 막힌 `pending_issue` 문서의 회수 가능 여부를 확인한다
- [x] 5. 발급/복구 시 공급사 쿠폰 이미지를 Storage에 미러링하고, 앱은 HTTPS 미러본을 우선 표시한다
- [x] 6. `storage.rules`에 `reward_coupons/` 경로 규칙을 추가한다
- [x] 7. `limitDay = "20260904"` 회귀 테스트를 고정하고 전체 검증을 통과시킨다

## 저장 위치 정리

- `reward_catalog` 컬렉션은 읽기만 하고 앱이 쓰지 않는다 -> 별도 마이그레이션 불필요.
  live 카탈로그는 매 호출마다 API에서 다시 계산되므로 2번 클램프가 기존 오염분까지 함께 정리한다.

## 안전 원칙

- PIN, 전화번호, 주문번호, 공급사 쿠폰 URL을 작업 문서와 로그 요약에 남기지 않는다.
- 복구는 기존 거래 ID 상태조회만 쓰고 새 주문이나 포인트 재차감을 만들지 않는다.

## 검토 결과

- `resolveGiftishowValidityDays()`를 새로 두고 `limitDay`/`limitday`/`validPrdDay`를 일수 후보와
  종료일 후보로 나눠 읽는다. 8·14자리 날짜는 KST 기준 잔여일로 환산하고, 일수는 3650일로 클램프한다.
  `20260904`는 이제 20,260,904일이 아니라 31일(2026-09-04 23:59:59 KST까지)로 해석된다.
- `resolveRewardValidityDays()`가 모든 읽기 경로의 병목이라 여기서 클램프하면 seed·Firestore 문서·
  공급사 응답·기존 발급 문서가 한 번에 정리된다. `reward_catalog`는 앱이 쓰지 않으므로 마이그레이션은 없다.
- `toSafeFirestoreDate()`는 fallback도 같은 기준으로 검증한다. Firestore Timestamp도 Date로 정규화해
  기존 문서의 만료일을 fallback으로 넘기던 호출부 동작을 유지했다.
- 공급사 쿠폰 이미지는 발급·복구 시점에 `reward_coupons/{uid}/{redemptionId}.{ext}`로 미러링하고
  토큰이 실린 HTTPS 다운로드 URL만 문서에 남긴다. 미러링 실패는 발급을 막지 않는다(경고만 남기고 진행).
  앱은 미러본 -> 공급사 원본(https일 때) -> PIN 바코드 -> 상품 이미지 순으로 표시한다.
- 쿠폰 이미지가 화면에 있으면 `문자함에서 확인해 주세요` 문구를 겹쳐 띄우지 않는다.

## 남은 한계 — 이미 갇힌 쿠폰 1건

- 기프티쇼 상태조회(0201)는 성공 코드와 함께 `sendRstCd`, `sendStatusCd`, `pinStatusCd`,
  `pinStatusNm`, `validPrdEndDt`만 돌려주고 `pinNo`·`couponImgUrl`은 주지 않는다.
  기존 회귀 테스트 fixture(실제 응답 기반)와 이번에 추가한 필드명 로그가 같은 결론을 가리킨다.
- 따라서 이미 `pending_issue`에 갇힌 건은 상태조회만으로는 PIN을 되찾을 수 없다.
  해당 쿠폰은 공급사에서 발급·문자 발송이 완료된 상태이므로 사용자는 문자함에서 사용할 수 있고,
  포인트 손실은 없다. 관제탑 `쿠폰 재조회`로 issued 확정만 가능하다.
- 이번 수정 이후 **새로 발급되는 쿠폰**은 주문 응답(0204)이 `pinNo`를 포함하므로
  보관함에 PIN·바코드·기프티콘 이미지가 정상 저장·표시된다.

## 검증

- `npx vitest run` 전체 707개 통과 (Emulator 전용 7개 skip). 신규 회귀 테스트 7개 포함.
- `node --check functions/reward-market.js`, `functions/runtime.js` 통과.
- `npm run check:en`, `npm run mainnet:config:check` 통과.
- `npx esbuild js/app-core.js --bundle` 번들 통과.
- PWA 캐시 v293 -> v294, 변경 이력 v1.0.24로 갱신.

## 배포 범위

Hosting + Functions + Storage 규칙. `storage.rules`에 `reward_coupons/` 경로가 새로 생겨
Storage 규칙 배포가 없으면 미러 이미지 경로가 기본 거부 규칙에 걸린다.
