# 2026-04-27 최석재 7일 챌린지 오정산 보정

## 목표
- 최석재 계정(`KwrwGEa2qoOljcAQkrpuk9MRS6G3`)의 2026-04-20~2026-04-26 7일 챌린지가 실제로는 7/7 성공이었는데 2026-04-27 실패 정산된 건을 보정한다.
- 이미 온체인에서 실패 정산으로 2,500 HBT 반환 + 2,500 HBT 소각이 완료되었으므로, 성공 정산 기준과의 차액을 별도 보정 거래로 남긴다.

## 보정 기준
- 챌린지: `challenge-7d`, weekly
- 기간: 2026-04-20 ~ 2026-04-26
- 실제 달성: 7/7일, 각 일자 `daily_min_points >= 65`
- 잘못 처리된 실패 정산: 원금 5,000 HBT 중 2,500 HBT 반환, 2,500 HBT 소각
- 성공 정산 기준: 원금 5,000 HBT 반환 + 보너스 2,500 HBT + 100P
- 추가 보정 필요: 5,000 HBT + 100P

## 체크리스트
- [x] production 현재 상태 재확인
- [x] 온체인 보정 실행 경로 확인
- [x] 보정 HBT 5,000 전송/민팅 처리
- [x] Firestore 포인트 100P 보정
- [x] Firestore 보정 거래 기록 생성
- [x] 기존 실패/중복 기록에 보정 메타데이터 부여
- [x] 보정 결과 검증

## 검증 메모
- 보정 거래 문서: `blockchain_transactions/challenge_comp_tx_challenge_false_failure_2026_04_27_kwrw_weekly`
- 운영 보정 문서: `admin_compensations/challenge_false_failure_2026_04_27_kwrw_weekly`
- 온체인 보정 TX: `0xa77dd5fef4aeb55ba4ed1a42795b8ed3e63e120c9209c2247a9b9ebe6642629f`
- BSC block: `94904497`
- 온체인 검증: receipt `status=1`, 최석재 지갑으로 `5,000 HBT` mint 확인
- HBT 잔액: `75,164 HBT` -> `80,164 HBT`
- 포인트 잔액: `1,147P` -> `1,247P`
- 기존 실패/중복 거래 7건에 `correctionStatus=superseded_by_false_failure_correction`, `correctionTxId=challenge_comp_tx_challenge_false_failure_2026_04_27_kwrw_weekly` 부여
