# 2026-04-10 Wallet Connection Mobile Research

## Goal
- 메인넷 전 MetaMask / Trust Wallet 모바일 연결 UX 개선 경로 확인
- 현재 코드의 deeplink 한계와 공식 권장 방식 정리

## Checklist
- [x] 현재 지갑 연결 코드 확인
- [x] MetaMask 공식 모바일 연결 문서 확인
- [x] Trust Wallet 공식 모바일 연결 문서 확인
- [x] WalletConnect / Reown 계열 모바일 세션 흐름 확인
- [x] 앱에 맞는 권장 구현안 정리
- [x] MetaMask Connect API key 수령 후 설정 파일 반영

## Findings
- 현재 코드는 `js/blockchain-manager.js`에서 MetaMask / Trust Wallet deeplink만 열고, 실제 세션 브리지는 없다.
- MetaMask는 공식적으로 모바일 브라우저에서 MetaMask Connect를 통해 deeplink / QR / 세션 유지를 제공한다.
- Trust Wallet은 공식적으로:
  - Trust 앱 브라우저면 injected provider 직접 사용
  - 그 외 브라우저면 WalletConnect 페어링 팝업 사용
  - deeplink는 `https://link.trustwallet.com/open_url?...` 또는 `.../wc?uri=...` 패턴을 제공한다.
- 단순히 웹에서 링크만 열면 “원래 브라우저”와 “지갑 앱 브라우저”가 분리되어 세션 UX가 깨질 수 있다.
- 브라우저 기반 dapp에서는 “지갑을 앱 안으로 임포트”하는 것은 불가능하고, 가능한 것은 세션 연결/승인이다.

## Recommended Direction
1. Desktop / wallet in-app browser: 기존 injected provider(EIP-1193) 유지
2. Mobile MetaMask outside app browser: MetaMask Connect 도입
3. Mobile Trust outside app browser: WalletConnect v2 / Reown AppKit 도입
4. 복귀 UX:
   - 연결 요청 후 대기 sheet 표시
   - `pageshow` / `focus` / `visibilitychange` 시 세션 복구 재시도
   - iOS 17+는 자동 복귀가 항상 보장되지 않으므로 “지갑 승인 후 다시 돌아오세요” 안내 유지

## Open Inputs
- WalletConnect(Reown) projectId
- 메인넷 전 지원 우선순위: MetaMask / Trust Wallet / 기타 지갑 범위 확정

## 2026-04-10 Applied
- `js/blockchain-config.js`에 `METAMASK_CONNECT` 설정 추가
- `js/blockchain-config.js`에 `TRUST_WALLET_CONNECT` 설정 자리 추가
- local/staging/prod별 `dappUrl`과 `apiKey`를 helper로 export
- `js/vendor/metamask-connect-evm.bundle.js` 생성 후 로컬 번들로 포함
- `js/vendor/walletconnect-ethereum-provider.bundle.js` 생성 후 로컬 번들로 포함
- `js/blockchain-manager.js`에 모바일 MetaMask Connect 연결/복귀 재연결 로직 추가
- MetaMask Developer API key는 Infura mainnet bootstrap RPC 매핑에 함께 사용
- `js/blockchain-manager.js`에 Trust Wallet WalletConnect 진입 로직 추가

## Remaining Input
- Trust Wallet 완전한 모바일 세션 연결을 활성화하려면 `TRUST_WALLET_CONNECT.projectId`에 Reown/WalletConnect projectId 필요
