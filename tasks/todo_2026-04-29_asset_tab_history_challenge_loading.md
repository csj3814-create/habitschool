# 2026-04-29 자산 탭 HBT 기록/챌린지 로딩 개선

## 목표
- HBT 거래 기록이 비어 보이는 원인을 찾아 실제 거래 기록을 표시한다.
- 포인트 -> HBT 변환 안내 문구에서 체인 라벨이 한글/영어로 흔들리지 않게 단순화한다.
- 건강 습관 챌린지 박스가 느린 Firestore 조회에 묶여 늦게 뜨지 않도록 빠른 렌더링 경로를 만든다.

## 체크리스트
- [x] 자산 탭 로딩/렌더링 경로 확인
- [x] HBT 거래 기록 fallback/정규화 수정
- [x] 포인트 -> HBT 문구 수정
- [x] 건강 습관 챌린지 초기 렌더링 개선
- [x] 테스트와 번들 검증

## 리뷰
- HBT 기록 조회가 지연되면 빈 기록으로 확정하지 않고 기존 캐시 또는 온체인 전송 이력으로 보강한다.
- 거래 기록 체인 필터는 `network`, `networkTag`, `chainKey`, `chainId` 변형을 같은 기준으로 정규화한다.
- 건강 습관 챌린지는 캐시된 일일 로그로 먼저 그린 뒤 서버 일자 로그는 짧게만 기다리고 늦게 도착하면 재동기화한다.
- 검증: `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` 통과.
