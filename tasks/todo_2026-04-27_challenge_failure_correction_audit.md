# 2026-04-27 Challenge Failure Correction Audit

## Goal
- production에서 2026-04-27에 생성된 챌린지 실패 정산 후보를 읽기 전용으로 확인한다.
- Firestore 거래 기록과 현재 사용자 챌린지 상태를 대조해 데이터 보정 필요 대상을 분류한다.
- 온체인 정산이 실제 실행된 경우 별도 보정이 필요한지 확인한다.

## Checklist
- [x] 실패 정산 거래 필드 구조 확인
- [x] production Firestore 후보 조회
- [x] 사용자별 보정 필요성 분류
- [x] 결과 보고

## Review
- 2026-04-27 KST 실패 정산 후보는 총 9개였다.
- 실제 성공인데 실패/소각 처리된 보정 핵심 대상은 `KwrwGEa2qoOljcAQkrpuk9MRS6G3`의 `challenge-7d` 1건이다.
- 해당 사용자는 2026-04-20부터 2026-04-26까지 7일 모두 65P 이상 기록해 7/7 성공 조건을 충족했다.
- 실제 온체인 실패 정산 tx `0xe1fe6f26a0244c4c4659456b3d54356d1ea195fc2120b2e95e603a28f528f668`은 BSC receipt status `0x1`로 성공했고, 2,500 HBT 반환 + 2,500 HBT 소각 로그가 확인됐다.
- 나머지 후보는 무예치/미달성 또는 중복 Firestore 실패 로그로, 성공 복구 대상은 아니다.
