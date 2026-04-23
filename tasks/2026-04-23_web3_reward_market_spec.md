# 2026-04-23 Web3 Reward Market Spec

## Overview

- 기존 자산 탭 위에 `해빛 마켓`과 `쿠폰 보관함`을 추가한다.
- 서버 진실원장은 `reward_redemptions`, `reward_reserve_ledger`, `reward_reserve_metrics`로 분리한다.
- UX 히스토리 노출용으로만 `blockchain_transactions.type = reward_redemption`를 함께 기록한다.

## Modes

- `REWARD_MARKET_MODE=mock`
  - 기프티쇼 실 API 없이도 상품 조회와 테스트 쿠폰 발급이 동작한다.
  - 기본값.
- `REWARD_MARKET_MODE=live`
  - 기프티쇼 주문 호출을 사용한다.
  - 클라이언트는 먼저 HBT `burn()` 트랜잭션을 보내고 `burnTxHash`를 서버에 전달해야 한다.

## Firestore Collections

- `reward_catalog/{sku}`
  - 운영자가 실상품 카탈로그를 고정 저장할 때 사용
- `reward_redemptions/{id}`
  - 서버 진실원장
  - 쿠폰 발급 상태, PIN/barcode, 만료일, `burnTxHash`, 원가/마진/예산 배분 포함
- `reward_reserve_ledger/{id}`
  - 건별 할인 마진과 가스/운영 예산 배분 기록
- `reward_reserve_metrics/{docId}`
  - 누적 마진, 가스 예산, 운영 예산, 발급 건수 요약
- `blockchain_transactions/{id}`
  - `reward_redemption` 타입 요약 행만 추가

## Cloud Functions

- `getRewardMarketSnapshot`
  - 카탈로그, 최근 교환 내역, 예산 요약을 반환
- `redeemRewardCoupon`
  - mock/live 공통 교환 진입점
  - live 모드에서는 `burnTxHash` 필수
  - `burnTxHash` 기반 idempotency 처리

## Client Flow

1. 자산 탭 진입 시 `updateAssetDisplay()`가 `loadRewardMarketSnapshot()`을 호출한다.
2. mock 모드:
   - `reward-market.js`가 바로 `redeemRewardCoupon` callable 호출
3. live 모드:
   - `blockchain-manager.js`가 `ERC20 burn()` 실행
   - `burnTxHash`를 localStorage에 임시 저장
   - 같은 해시로 `redeemRewardCoupon` callable 호출
   - 성공 시 임시 상태 삭제, 자산 탭/쿠폰 보관함 새로고침

## Env Notes

- `REWARD_MARKET_MODE`
- `REWARD_MARKET_MIN_REDEEM_HBT`
- `REWARD_MARKET_RESERVE_DOC_ID`
- `GIFTISHOW_API_BASE_URL`
- `GIFTISHOW_GOODS_PATH`
- `GIFTISHOW_ORDER_PATH`
- `GIFTISHOW_API_HEADERS_JSON`
- `GIFTISHOW_CATALOG_LIVE`

## Next Step

- 기프티쇼 실 응답 스키마에 맞춰 `functions/reward-market.js`의 goods/order 매퍼를 구체화한다.
- 운영 상품을 `reward_catalog`에 등록하고 mock seed를 운영값으로 대체한다.
- 필요 시 관리자 화면에 reserve summary와 실패 교환 복구 UI를 추가한다.
