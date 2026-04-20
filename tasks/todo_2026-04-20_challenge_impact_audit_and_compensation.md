# 2026-04-20 챌린지 오정산 영향 조사 및 보상 집행

## Checklist
- [x] `tasks/lessons.md`에서 관련 패턴 검토
- [x] 기존 7일 챌린지 실패 정산 버그 원인과 보정 로직 파악
- [x] 프로덕션 `blockchain_transactions`에서 실패 정산 건 조회
- [x] 실패 정산 건별로 실제 일별 기록을 재계산해 오정산 여부 분류
- [x] 사용자 계정(최석재 포함) 영향 회원 목록 확정
- [x] 보상 기준안과 실행 초안 작성
- [x] 결과/리스크를 문서화하고 사용자에게 보고

## Investigation Notes
- 감사 범위:
  - 프로덕션 `blockchain_transactions`의 `challenge_settlement` 실패 기록 16건(raw) 조회
  - 동일 사용자/챌린지/정산일 기준 중복 기록을 정리해 14건(group)으로 재검산
- 재검산 기준:
  - 7일/30일 챌린지: 해당 일자 `daily_logs` 합산 포인트가 65P 이상이면 1일 인정
  - 3일 챌린지: 식단/운동/마음 3개 카테고리 모두 충족 시 1일 인정
  - 정산일(KST) 기준으로 챌린지 윈도우를 역산해 일별 로그를 재평가

### 오정산으로 확인된 회원
1. 최석재 (`KwrwGEa2qoOljcAQkrpuk9MRS6G3`)
   - 대상 챌린지: `challenge-7d`
   - 정산일: `2026-04-19` KST
   - 기록상 실패: `completedDays = 4`, `successRate = 57.14%`
   - 실제 재계산: `7/7`, `successRate = 100%`
   - 실제 장부:
     - `challenge_failure`: 반환 `2500 HBT`, 소각 `2500 HBT`
     - 성공이었으면 받아야 할 값: `7500 HBT`(원금 5000 + 보너스 2500), `100P`
   - 원상회복 기준 순부족분: `5000 HBT + 100P`

2. 정현수 (`USB72AB7z5Pan26I1aQF8emKoHh1`)
   - 대상 챌린지: `challenge-3d`
   - 정산일: `2026-04-10` KST
   - 기록상 실패: `completedDays = 1`, `successRate = 33.33%`
   - 실제 재계산: `3/3`, `successRate = 100%`
   - 스테이킹 0이어서 HBT 손실은 없음
   - 원상회복 기준 순부족분: `30P`

### 재검산 결과 요약
- 실제 피해 회원은 2명
- 사용자 본인 계정 포함
- 나머지 실패 정산 그룹은 모두 실제 기준으로도 실패가 맞았음

## Compensation Policy
- 사과 보상 없이 실제 피해분만 지급
- 기존 실패 정산 기록은 삭제하지 않음
- 별도 보상 장부를 추가해 추적 가능하게 처리
- 최석재 건은 이미 `2500 HBT 반환 + 2500 HBT 소각`이 집행되었으므로, 추가 지급은 순부족분 `5000 HBT`만 지급
- 포인트는 `coins` 증액으로 반영하고, `blockchain_transactions`와 `admin_compensations`에 별도 기록

## Execution Result
- 2026-04-20 KST 보상 집행 완료

### 지급 내용
- 최석재:
  - `5000 HBT` 온체인 지급
  - `100P` 지급
- 정현수:
  - `30P` 지급

### 온체인 TX
- 최석재 `5000 HBT` 보상 TX:
  - `0x06df751bff576fc9359d8255770bc285385c21bf94af7c5c5576e16a57f9e331`

### Firestore 장부
- `blockchain_transactions/challenge_comp_tx_challenge_false_failure_2026_04_20_kwrw_weekly`
- `blockchain_transactions/challenge_comp_tx_challenge_false_failure_2026_04_20_usb72_mini`
- `admin_compensations/challenge_false_failure_2026_04_20_kwrw_weekly`
- `admin_compensations/challenge_false_failure_2026_04_20_usb72_mini`

### 사후 검증
- 최석재 온체인 잔액: `64664.0 -> 69664.0 HBT`
- 최석재 포인트: `1217 -> 1317`
- 정현수 포인트: `1100 -> 1130`

## Review
- 프로덕션 재검산 결과, 이번 오정산 버그로 실제 피해를 본 회원은 2명으로 확정했다.
- 사용자 본인 계정은 실질 HBT 손실이 확인되었고, 다른 1명은 무료 챌린지 포인트 누락만 발생했다.
- 원상회복분만 지급했고, 사과 보상은 별도로 넣지 않았다.
- 지급 후 장부와 잔액을 다시 확인해 보상 누락/중복이 없음을 검증했다.
