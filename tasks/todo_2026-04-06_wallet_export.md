# 2026-04-06 기존 앱 지갑 내보내기

- [x] 범위 고정 교훈 반영
- [x] 자산 탭에 기존 앱 지갑 내보내기 버튼 추가
- [x] 1회 보기/복사 경고 모달 추가
- [x] 앱 지갑 복호화 후 개인키 1회 노출 구현
- [x] MetaMask / Trust Wallet 가져오기 안내 추가
- [x] 테스트 및 결과 정리

## 검증

- [x] `npm test`
- [x] `npx esbuild js/blockchain-manager.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-blockchain-check.js`
- [x] `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-main-check.js`

## 결과

- 자산 탭에 `기존 앱 지갑 내보내기` 버튼 추가
- 기존 v2 앱 지갑 사용자만 경고 모달을 통해 개인키 1회 보기/복사 가능
- 개인키는 모달을 닫으면 화면과 메모리에서 즉시 제거
- MetaMask / Trust Wallet 가져오기 순서를 같은 모달 안에 안내
