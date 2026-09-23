# 진행 중 — 2026-09-23

계획 본문: `tasks/2026-09-23_body_composition_igrip.md`,
`tasks/2026-09-23_first_coupon_acceleration.md`

결정된 것:
- 체성분 유입 = **공유 시트(CSV) + 사진 판독**. Health Connect·BLE 는 안 한다
- 첫 쿠폰 = **0+1+2+3단계 전부**

---

## A. 체성분 (atflee iGrip X)

- [ ] A1 `inbodyHistory` 확장 필드 정의 — weight, bodyFatPct, bodyWater, protein,
      boneMass, bmi, segmental, source, measuredAt (규칙 변경 불필요, 확인함)
- [ ] A2 `storage.rules` 에 `body_composition/{userId}/**` 추가
      ← **배포 승인 따로 받을 것**
- [ ] A3 `functions/runtime.js` `analyzeBodyComposition` 콜러블
      (`analyzeBloodTest` 본뜸: 동의 서버검증 · SSRF 가드 · 마감선 · 오래된 측정 가드)
- [ ] A4 `js/diet-analysis.js` `requestBodyCompositionAnalysis`
- [ ] A5 `js/app-core.js` `uploadBodyCompositionPhoto` + 프로필 인바디 섹션 버튼
      — 판독값은 입력칸에 채우기만. 사람이 확인 후 저장
- [ ] A6 `manifest.json` / `manifest-en.json` share_target accept 에 `text/csv` 추가
- [ ] A7 `sw.js` 공유 수신에서 image/jpeg 기본값 박힌 자리 손보기
- [ ] A8 CSV 파서 (`js/body-composition-csv.js`) + 단위 테스트
      — 열 매핑을 표로 보여주고, 못 알아본 열은 못 알아봤다고 말한다
- [ ] A9 공유 수신 → CSV 미리보기 → 확인 → `inbodyHistory` batch 쓰기
- [ ] A10 측정일이 오늘이면 `daily_logs.metrics.weight` 도 채운다 (BMI/LE8 연결)

## B. 첫 쿠폰 당기기

- [ ] B0 `js/reward-market.js:471` `포인트 부족` → `커피까지 N,NNNP · 약 N일`
      (최근 7일 적립 평균). **포인트 비용 0**
- [ ] B1 배지 포인트 — **서버화가 먼저다**
  - [ ] B1a `functions/runtime.js` `claimMissionBadgeBonus` (+원장 `_badges`)
  - [ ] B1b `firestore.rules` 차단 키에 `missionBadges` 등 추가 ← **배포 승인 따로**
  - [ ] B1c `js/app-core.js:17694` 클라이언트 arrayUnion → 콜러블 호출
  - [ ] B1d `renderMissionBadges` 에 `+NNP 받기` 버튼
- [ ] B2 마일스톤 초반 상향 — `functions/runtime.js:4864` +
      `js/firebase-config.js:366` **동시에** (한쪽만 고치면 표시와 지급이 갈라짐)
- [ ] B3 첫 쿠폰 1인 1회 1,400P — `functions/reward-market.js`, 서버 판정

## 검증

- [ ] `npm test` 통과
- [ ] 에뮬레이터 규칙 테스트: `missionBadges` 클라이언트 쓰기가 **거부**되는지
- [ ] 스테이징 배포 후 실제 동작 확인
- [ ] 첫 저장 뒤 Firestore 콘솔에서 **문서가 실제로 들어갔는지 눈으로 본다**
      (토스트만 보고 끝내지 않는다 — 2026-08-15 교훈)

## 리뷰

(작업 후 작성)
