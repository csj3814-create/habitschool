# 2026-03-15 작업 계획

## Task 1: 탭 로딩 성능 개선 (내 기록, 내 지갑, 갤러리)

### 문제 원인 분석
1. **내 기록 (Dashboard)**: 캐싱 없음 + 로딩 인디케이터 없음 → 매번 Firestore 3개 병렬 쿼리
2. **내 지갑 (Assets)**: `settleExpiredChallenges()` 에러 시 `.catch()`가 없어 `updateAssetDisplay()`가 아예 실행 안 됨 (가장 큰 버그)
3. **갤러리 (Gallery)**: SDK 초기화 전 쿼리 시 실패 후 재시도 → 느린 첫 로드

### 수정 사항
- [x] `settleExpiredChallenges().then(...)`에 `.catch()` 추가 → 에러 나도 wallet 무조건 표시
- [x] Dashboard에 30초 캐시 추가 → 탭 왔다갔다 시 즉시 표시
- [x] Assets에 30초 캐시 추가 → 탭 전환 시 즉시 표시
- [x] Gallery 기존 캐시는 유지 (이미 작동 중)
- [x] Dashboard에 로딩 인디케이터 추가
- [x] 로그인 직후 대시보드 데이터 프리로드 (auth.js에서 renderDashboard 호출은 이미 함)

## Task 2: 주간 채굴량 평가 & 월요일 0시 자동 변경

### 구현 사항
- [x] Cloud Function: `adjustMiningRate` (Firebase Scheduled Function, 매주 월요일 00:00 KST)
- [x] 7일간 `blockchain_transactions` 합산 → difficulty_adjuster.py 로직을 JS로 포팅
- [x] 현재 온체인 rate 조회 → 새 rate 계산 → `updateRate()` 호출
- [x] 결과를 `mining_rate_history` 컬렉션에 기록

## 주의사항
- 본 서버에 바로 올리지 않음
- GitHub에 먼저 push하여 점검 받기
