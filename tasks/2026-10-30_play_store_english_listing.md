# 플레이스토어 영어(en-US) 등록정보 문구

2026-10-30. 플레이 콘솔 → 기본 스토어 등록정보 → 언어 "영어(미국) – en-US" 에 붙여 넣는다.
AI 번역을 먼저 돌렸다면 세 칸을 아래로 바꾼다.

원칙 (한국어 등록정보 2026-08-26 과 같다):
- 영어 회원이 플레이 앱에서 실제로 쓸 수 있는 것만 적는다. **쿠폰·기프티콘 교환은 한국 전용이라 넣지 않는다.**
  HBT·지갑은 플레이 앱에서 숨겨져 있어 넣지 않는다.
- 혈액검사 AI 분석·건강 점수는 앱에 있어도 앞세우지 않는다(의료 앱 심사 기준이 따라붙는다).
- 끝에 의료 면책 문장을 둔다.
- 개인정보처리방침 링크는 영어 판(/en/privacy).

---

## 앱 이름 (30자 제한)

```
Habit School: Healthy Habits
```

28자. 앱 화면 이름 "Habit School" 에 검색어를 하나 붙였다. 한국어 이름이 "습관학교 - 즐겁게 좋은 습관 만들기" 를 붙인 것과 같은 이유.
짧게 가려면 `Habit School` (12자).

## 짧은 설명 (80자 제한)

```
Snap your meals, workouts and sleep. Build healthy habits one day at a time.
```

## 자세한 설명 (4,000자 제한)

```
Doctors handle the emergencies. Staying well is yours to keep.

Habit School is a gentle way to build good habits: meals, movement, sleep and a calmer mind, all in one place.

■ One photo is a log
Snap what you ate, the workout you did or how you slept. No long forms. One photo and your day is on record.

■ AI feedback on your meals
Upload a meal photo and AI sorts what's on the plate into natural, processed and ultra-processed foods, with one practical tip for next time. Workout photos and videos get feedback too.

■ Pick a way of eating
Choose a food method such as Mediterranean, Low-Carb High-Protein, 16:8 Intermittent Fasting or Two Weeks Without Ultra-Processed Food, and get meal-time reminders that fit your eating window.

■ Weekly missions that show your progress
Your daily logs add up to weekly missions, so you can see which habits are sticking and which days slip. After 30 days, get a report of how far you've come.

■ Points and badges for showing up
Every log earns points, and new members start with a 200P welcome gift. Use your points on Haebit badges that appear next to your name in the gallery.

■ Better together
See other members' check-ins in the gallery and cheer them on. Posts are translated into your language automatically. Join a small group to keep each other going, or say hello in our Telegram group.

■ Health Connect (Android)
Connect Health Connect to bring in your steps, sleep, workouts and body composition automatically, so you don't have to type them in.

■ A calmer mind
Write down what you're grateful for, then follow a guided breathing session (belly breathing, 4-7-8 or box breathing) to wind down.

■ English or Korean
Switch languages any time from your profile. Your account and records stay the same.

Habit School does not provide medical advice, diagnosis or treatment. It helps you keep track of everyday habits. Please talk to a qualified healthcare professional about your health.

Contact: habitschool0@gmail.com
Privacy Policy: https://habitschool.web.app/en/privacy
```

---

## 확인한 것

- 각 기능이 영어 앱에 있다: 식단·운동 AI 분석(js/diet-analysis.js 영어 갈래), 식단 방법 이름(i18n-en `diet.method.*.name`),
  주간 미션·30일 결과지(v544), 해빛 배지(global-rewards.js), 갤러리 자동 번역(v541), 소모임(v535~), 텔레그램 방(openCommunityChat),
  호흡법 세 가지(meditation-guide.js 영어 표), 언어 바꾸기(v549), 가입 선물 200P(login.point3).
- Health Connect 걸음·수면·운동·체성분은 플레이 앱 1.0.10 부터.
- /en/privacy 는 200 으로 열린다.
