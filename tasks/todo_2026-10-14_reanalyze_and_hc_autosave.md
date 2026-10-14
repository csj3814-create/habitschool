# 2026-10-14 — AI 다시 분석 · Health Connect 자동 저장 · HC 수면 점수

요청:
1. AI 분석이 틀렸을 때 다시 분석. "분석 접기" 버튼을 반으로 나눠 "다시 분석"을 넣고,
   다시 분석할 때 참고할 말("오징어채를 짠지로 잘못 읽었어")을 넣게.
2. 앱으로 접속할 때 Health Connect 정보를 최대한 가져와 한 번에 적용. 사용자가 직접 넣은 값은 뺀다.
3. Health Connect 수면도 점수로 인정.

결정(사용자 답):
- 적용 방식 = **자동 저장** (저장 버튼 없이 그날 기록에 쓰고 점수도 반영)
- 범위 = **걸음수·수면·운동** (웹만 — 앱 업데이트 없음. 체성분은 안 함)
- 시점 = **앱을 열 때마다**
- HC 수면 = **캡처와 같은 10P** (`mind_sleep` 한 칸, 둘 다 있어도 10P)

---

## A. HC 수면 점수
- [x] A1 `functions/points-utils.js` — `sleepSync` 가 그날 깬 HC 밤잠이고 `sleepHours` 와 같으면 `mind_sleep` 10P (evidenceType `health_connect_sleep`). 사진이 먼저.
- [x] A2 앱 미리 계산(`calculateAwardedPointsFromLogData`)도 같은 기준
- [x] A3 테스트

## B. HC 자동 저장 (앱을 열 때)
- [x] B1 오늘 기록을 읽어, 직접 넣은 값이 아닌 칸만 고른다
  - 걸음수: 저장된 게 없거나 `source === 'health_connect'` 일 때만
  - 수면: 저장된 시간이 없거나, 저장된 시간이 저장된 `sleepSync` 와 같을 때만
  - 운동: `exercise.healthSessions` 는 HC 전용 — 늘 새 목록으로
- [x] B2 `daily_logs` 에 merge 로 그 칸만 쓴다 (userId·date 포함 — 문서 생성 규칙)
- [x] B3 실패는 로그 남기고 다음 실행에 다시 (조용히 삼키지 않기)
- [x] B4 저장 뒤 서버 정산 확정값 반영(`reconcileSettlementAfterSave`)
- [x] B5 안내 문구: "저장 버튼을 누르면" → "기록에 반영했어요"
- [x] B6 테스트

## C. AI 다시 분석
- [x] C1 서버 `analyzeDiet`·`analyzeExercise`·`analyzeExerciseVideo`·`analyzeSleepMind` 가 `correction`(300자) 받기 — 프롬프트 끝에 "회원이 알려 준 정정"
- [x] C2 `js/diet-analysis.js` request* 가 correction 을 넘김
- [x] C3 펼친 분석 아래 [분석 접기 | 다시 분석] 반반. 다시 분석 → 입력칸 + 다시 분석/취소
- [x] C4 식단·운동 사진·운동 영상·수면 모두. 결과 교체·저장은 기존 분석 저장 경로 그대로
- [x] C5 테스트

## 배포
- 규칙 변경 없음 (sleepSync·healthSessions 는 이미 허용)
- staging 먼저, 운영은 신호 받고

---

## 결과 (v507)
- 테스트 2,696개 통과 (새 파일 3개: health-connect-sleep-points · health-connect-autosave · analysis-reanalyze)
- 규칙 변경 없음 → hosting·functions 만 배포
- 확인 못 한 것: 실제 기기에서 앱을 열 때 자동 저장 토스트와 점수, 로그인 화면에서 다시 분석 버튼 모양.
  스테이징에서 사람이 한 번 본다.
- 열어 둔 위험: HC 걸음수와 같이 HC 수면도 회원 기기가 보낸 값을 믿는다(사진 같은 서버 검증이 없다).
