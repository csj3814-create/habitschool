# 2026-04-27 Challenge False Failure

## Goal
- 7일 건강 습관 챌린지가 매일 임무를 완수했는데 실패 정산되는 원인을 확인한다.
- 종료일/완료일 계산과 정산 판정을 재발하지 않게 고친다.
- 자산 탭 거래 기록에 잘못된 실패 정산이 다시 생기지 않도록 테스트로 막는다.

## Checklist
- [x] 기존 교훈과 챌린지 정산 경로 확인
- [x] 클라이언트 챌린지 완료일 기록 로직 추적
- [x] Cloud Function/로컬 정산 판정 로직 추적
- [x] 재현 테스트 추가
- [x] 원인 수정
- [x] `npm test` 및 esbuild 검증

## Review
- 원인: 만료 정산 경로가 원본 `daily_logs`를 재검산하지 않고 저장된 `completedDays/completedDates` 캐시만 보고 실패 정산을 호출했다.
- 클라이언트: 만료 챌린지 정산 전에 챌린지 기간의 일별 기록을 서버에서 다시 읽어 완료일을 복구한다.
- 서버: `settleChallengeFailure`가 소각/반환 전에 같은 재검산을 수행하고, 80% 이상이면 실패 정산을 건너뛰고 `claimable`로 복구한다.
- 회귀 방지: 7일 챌린지 기간의 원본 기록이 7일 모두 충족되면 stale `completedDays: 5`여도 성공으로 복구되는 테스트를 추가했다.
- 검증: `node --check functions/runtime.js`, `npm test`, esbuild 번들 확인 통과.
