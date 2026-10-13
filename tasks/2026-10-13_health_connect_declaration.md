# Health Connect 권한 선언 · 데이터 보안 (1.0.10)

작성 2026-10-13. Play Console → 앱 콘텐츠 → **Health Connect 권한**, **데이터 보안**에 넣을 문구.
코드와 맞춘 사실만 적었다 (`HealthConnectManager.kt`, `js/health-connect-*.js`, `privacy.html` 1-라).

## 공통 사실 (어느 칸이든 이와 어긋나게 쓰지 않는다)

- **읽기만** 한다. 쓰기·삭제 권한 없음. 백그라운드 읽기(`READ_HEALTH_DATA_IN_BACKGROUND`) 없음
- 읽는 때: 앱을 열 때, 걸음수 동기화 버튼, 프로필의 "Health Connect 에서 가져오기" 버튼 — 모두 앱이 앞에 있을 때
- 읽은 값은 **입력칸을 채우기만** 한다. 회원이 저장을 눌러야 계정(Firestore, 서울)에 저장
- 걸음수 요약만 위젯 표시용으로 기기에 캐시
- 광고·마케팅 사용 없음, 판매 없음, 제3자 제공 없음
- 체중·체성분은 별도 민감정보 동의가 있어야 가져오기 버튼이 동작
- 권한은 항목별로 따로 묻는다: 걸음수 / 수면·운동 / 체성분. 하나를 거절해도 나머지는 동작
- 개인정보처리방침: https://habitschool.web.app/privacy (1-라), 영문 /en/privacy (1-d)

## 앱 설명 (선언 첫 칸 — "앱이 건강 데이터를 어떻게 쓰는지")

**한국어**
해빛스쿨은 식단·운동·수면·마음 습관을 매일 기록하고 건강습관 점수(미국심장협회 Life's Essential 8 기반)와
대사건강 점수로 변화를 보여 주는 습관 관리 앱입니다. Health Connect 에서 걸음수·수면·운동·체성분을
읽어 그날의 기록 칸을 자동으로 채워, 회원이 숫자를 손으로 옮겨 적지 않아도 되게 합니다. 읽은 값은
화면에 먼저 보여 주고 회원이 저장을 눌렀을 때만 기록됩니다. 해빛스쿨은 Health Connect 에 쓰거나
지우지 않으며, 받은 데이터를 광고에 쓰거나 판매·제3자 제공하지 않습니다.

**English**
Habitschool is a habit-tracking app where members log their diet, exercise, sleep and mental-wellbeing
habits every day and see their progress through a health habit score (based on the American Heart
Association's Life's Essential 8) and a metabolic health score. The app reads steps, sleep, exercise and
body composition from Health Connect to fill in that day's record automatically, so members do not have
to copy numbers by hand. Values are shown on screen first and are saved only when the member taps Save.
Habitschool never writes to or deletes from Health Connect, and does not use the data for advertising,
sell it, or share it with third parties.

## 권한별 사용 이유

| 권한 | 한국어 | English |
|---|---|---|
| READ_STEPS (기존) | 오늘 걸음수를 운동 기록에 채우고, 건강습관 점수의 신체활동 항목과 홈 화면 위젯에 표시합니다. | Fills today's step count into the exercise record, the physical-activity part of the health habit score, and the home-screen widget. |
| READ_EXERCISE | 오늘 한 운동(종류·시작·종료 시각)을 운동 기록에 보여 주고, 신체활동 시간을 계산합니다. 걷기·달리기는 걸음수와 겹치지 않게 큰 쪽만 셉니다. | Shows today's exercise sessions (type, start and end time) in the exercise record and counts active minutes for the physical-activity score. Walking and running are not double-counted with steps. |
| READ_ACTIVE_CALORIES_BURNED | 운동 기록마다 소모 칼로리를 함께 보여 줍니다. | Shows calories burned alongside each exercise session. |
| READ_DISTANCE | 운동 기록마다 이동 거리를 함께 보여 줍니다(걷기·달리기·자전거 등). | Shows distance alongside each exercise session (walking, running, cycling). |
| READ_SLEEP | 어젯밤 잠든 시각과 깬 시각으로 수면 시간을 계산해 그날 수면 기록 칸을 채우고, 건강습관 점수의 수면 항목에 씁니다. 낮잠은 빼고, 회원이 직접 적은 값은 덮지 않습니다. | Calculates last night's sleep duration from the sleep session to fill that day's sleep record and the sleep part of the health habit score. Naps are excluded and a value the member typed is never overwritten. |
| READ_WEIGHT | 프로필의 체중과 오늘 체중 칸을 채워 BMI와 건강습관 점수에 씁니다. | Fills the profile and today's weight fields, used for BMI and the health habit score. |
| READ_BODY_FAT | 체지방률을 프로필 체성분 칸에 채우고, 체중과 함께 체지방량을 계산해 대사건강 점수에 씁니다. | Fills body fat percentage in the profile; with weight it gives body fat mass for the metabolic health score. |
| READ_BASAL_METABOLIC_RATE | 기초대사량을 프로필 체성분 칸에 채웁니다. | Fills basal metabolic rate in the profile body composition fields. |
| READ_LEAN_BODY_MASS | 제지방량을 체성분 기록에 남겨 변화 추이를 보여 줍니다. | Saves lean body mass to the body composition history to show change over time. |
| READ_BONE_MASS | 골량(무기질)을 체성분 기록에 남겨 변화 추이를 보여 줍니다. | Saves bone mass to the body composition history to show change over time. |
| READ_BODY_WATER_MASS | 체수분을 체성분 기록에 남겨 변화 추이를 보여 줍니다. | Saves body water mass to the body composition history to show change over time. |
| READ_HEIGHT | 프로필의 키 칸이 비어 있을 때만 채워 BMI 계산에 씁니다. | Fills the profile height only when it is empty, for BMI. |

## 데이터 보안 양식 — 바뀌는 곳

**건강 및 피트니스** 카테고리
- **건강 정보**: 수집 ✅ (수면, 체성분 — 이미 체중·체성분 입력이 있으면 체크돼 있을 수 있음)
- **피트니스 정보**: 수집 ✅ (걸음수 — 이미 있음, 운동 세션·칼로리·거리 추가)

두 항목 모두 같은 답:
- 공유: **아니요**
- 일시적 처리만?: **아니요** (저장을 누르면 계정에 저장)
- 필수/선택: **선택** (회원이 연동·저장을 선택)
- 목적: **앱 기능**, (건강습관 점수 화면이 있으므로) **맞춤설정**은 체크하지 않는다 — 추천/개인화 광고가 아니다.
  기존 걸음수 항목에 고른 목적과 맞춘다
- 전송 중 암호화: 예 / 삭제 요청 가능: 예 (기존 답 그대로)
