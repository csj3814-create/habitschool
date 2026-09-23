# 진행 중 — 2026-09-23

계획 본문: `tasks/2026-09-23_body_composition_igrip.md`,
`tasks/2026-09-23_first_coupon_acceleration.md`

결정된 것:
- 체성분 유입 = **공유 시트(CSV) + 사진 판독**. Health Connect·BLE 는 안 한다
- 첫 쿠폰 = **0+1+2+3단계 전부**

---

## A. 체성분 (atflee iGrip X)

- [x] A1 `inbodyHistory` 확장 필드 정의 — weight, bodyFatPct, bodyWater, protein,
      boneMass, bmi, segmental, source, measuredAt (규칙 변경 불필요, 확인함)
- [x] A2 `storage.rules` 에 `body_composition/{userId}/**` 추가
      ← **배포 승인 따로 받을 것**
- [x] A3 `functions/runtime.js` `analyzeBodyComposition` 콜러블
      (`analyzeBloodTest` 본뜸: 동의 서버검증 · SSRF 가드 · 마감선 · 오래된 측정 가드)
- [x] A4 `js/diet-analysis.js` `requestBodyCompositionAnalysis`
- [x] A5 `js/app-core.js` `uploadBodyCompositionPhoto` + 프로필 인바디 섹션 버튼
      — 판독값은 입력칸에 채우기만. 사람이 확인 후 저장
- [x] A6 `manifest.json` / `manifest-en.json` share_target accept 에 `text/csv` 추가
- [x] A7 `sw.js` 공유 수신에서 image/jpeg 기본값 박힌 자리 손보기
- [x] A8 CSV 파서 (`js/body-composition-csv.js`) + 단위 테스트
      — 열 매핑을 표로 보여주고, 못 알아본 열은 못 알아봤다고 말한다
- [x] A9 공유 수신 → CSV 미리보기 → 확인 → `inbodyHistory` batch 쓰기
- [x] A10 측정일이 오늘이면 `daily_logs.metrics.weight` 도 채운다 (BMI/LE8 연결)

## B. 첫 쿠폰 당기기

- [x] B0 잠긴 카드에 남은 거리 표시 — `js/reward-pace.js` (순수) + 테스트 12개
      `1,240P 남았어요 · 요즘 속도면 약 13일`. **포인트 비용 0**  → `8b8d32f`
- [ ] B1 배지 포인트 — **다음 턴으로 미룸** (사용자 결정 2026-09-23)
      판정 입력(`weeklyMissionData`·`missionStreak`·`missionHistory`)이 전부
      클라이언트 것이라, 주간 정산 자체를 서버로 옮겨야 위조가 막힌다.
      지금은 미션 데이터가 어떤 지급에도 안 쓰여서 **현재 위험은 없다** —
      포인트를 붙이는 순간 구멍이 된다.
  - [ ] B1a `functions/runtime.js` `claimMissionBadgeBonus` (+원장 `_badges`)
  - [ ] B1b `firestore.rules` 차단 키에 `missionBadges` 등 추가 ← **배포 승인 따로**
  - [ ] B1c `js/app-core.js:17694` 클라이언트 arrayUnion → 콜러블 호출
  - [ ] B1d `renderMissionBadges` 에 `+NNP 받기` 버튼
- [x] B2 마일스톤 초반 상향 → `a49fad3`
      1/3/7일차만 올리고 14/30/60일차는 안 깎음. 1주 누적 125P → 270P
      `tests/milestone-single-source.test.js` 가 두 파일을 붙들고 있다
      (그 시험이 streak7 45P > streak14 30P 역전을 잡아냈다 → 14일차 50P 로 수정)
- [x] B3 첫 쿠폰 1인 1회 1,400P → `e09a24b`
      `quoteCatalogItem` 한 곳에서 해결 — 스냅샷·교환·레거시가 다 지나는 길목이라
      보여준 값과 빼는 값이 어긋날 수 없다. 차감 트랜잭션 안에서 표식을 다시 보고,
      환불되면 할인을 돌려준다. `REWARD_MARKET_FIRST_REDEMPTION_ENABLED=N` 로 끈다

## B트랙 결과 (배지 포인트 없이)

첫 커피까지 걸리는 날:

| 회원 유형 | 하루 적립 | 전 | 후 |
|---|---|---|---|
| 매일 만점 | 80P | 20일차 | **12일차** |
| 보통 | 45P | 31일차 | **18일차** |
| 가볍게 | 25P | 55일차 | **30일차** |

늘어난 발행량: 마일스톤 +165P/명, 첫 쿠폰 할인 600P 상당(1회).

## 검증

- [x] `npm test` 통과 — 2,295개
- [ ] 에뮬레이터 규칙 테스트: `missionBadges` 클라이언트 쓰기가 **거부**되는지
- [ ] 스테이징 배포 후 실제 동작 확인
- [ ] 첫 저장 뒤 Firestore 콘솔에서 **문서가 실제로 들어갔는지 눈으로 본다**
      (토스트만 보고 끝내지 않는다 — 2026-08-15 교훈)

## 리뷰 — 2026-09-23

### 한 일

| | 커밋 |
|---|---|
| 잠긴 교환 카드에 남은 거리·예상 일수 | `8b8d32f` |
| 마일스톤 1·3·7일차 상향 (뒤쪽은 안 깎음) | `a49fad3` |
| 첫 쿠폰 1인 1회 1,400P | `e09a24b` |
| 체성분 결과 사진 판독 | `4e824ea` |
| Fitdays CSV 공유 시트로 들여오기 | `1a7224c` |

테스트 2,295개 통과. 새로 쓴 것 67개.

### 남은 것 — **배포해야 적용된다**

- `storage.rules` 에 `body_composition/` 추가됨 → **`--only storage` 승인 필요**
  안 올리면 사진 업로드가 전부 조용히 거부되고 화면은 멀쩡해 보인다
- `functions/` 바뀜 → `--only functions`
- `js/`·`*.html`·`*.css`·`manifest`·`sw.js` 바뀜 → `--only hosting`
- `firestore.rules` 는 **안 바뀜** (`inbodyHistory` 는 필드 화이트리스트가 없고,
  `firstRewardDiscountUsedAt` 는 서버만 쓰며 클라 화이트리스트에 없어 위조 불가)

### 실기기로 확인할 것

1. iGrip X 로 한 번 측정 → 사진 판독 → **Firestore 콘솔에서 문서를 눈으로 본다**
2. Fitdays 내보내기 → 공유 → 해빛스쿨이 시트에 뜨는지
3. 들여온 뒤 대사건강 점수의 근지방비가 숫자로 바뀌는지

### 미룬 것

- B1 배지 포인트 — 주간 정산을 서버로 옮기는 별도 작업 (위 B1 항목 참조)
- 부위별(segmental) 데이터는 저장만 하고 화면은 아직 없음
