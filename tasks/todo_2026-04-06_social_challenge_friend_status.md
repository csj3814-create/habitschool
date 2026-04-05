# 2026-04-06 친구 챌린지 상태 표시 작업

- [x] 친구 챌린지 카드 렌더 경로와 서버 참여 조건 확인
- [x] 연결 친구별 오늘 인증 현황 / 이번 주 인증 현황 / 최근 30일 기록 일수 계산
- [x] 바로 챌린지 가능한 친구와 5일 기록 부족 친구를 카드에 함께 표시
- [x] 친구 챌린지 시작 버튼을 가능한 친구가 있을 때만 실제 시작 흐름으로 유지
- [x] 챌린지 생성 모달에서도 같은 자격 기준을 사용하도록 정리
- [x] 테스트 및 번들 검증

## 검증

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
