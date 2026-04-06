# 2026-04-06 MetaMask 모바일 브라우저 연결 수정

> 상태: 완료

## 작업
- [x] MetaMask 모바일 브라우저에서 외부 앱 열기 fallback 원인 확인
- [x] injected provider 지연 주입 대기 로직 추가
- [x] MetaMask/Trust Wallet 앱 내 브라우저에서는 외부 앱 deep link를 다시 열지 않도록 수정
- [x] 번들/테스트 검증
- [x] 커밋/푸시 후 배포 전 상태 정리

## 검증
- `npm test` 통과 (`117 passed`)
- `npx esbuild js/blockchain-manager.js --bundle --format=esm --platform=browser` 통과
