# atflee iGrip X 체성분 데이터 앱 연동 계획

작성 2026-09-23. 조사만 끝난 상태이고 코드는 아직 건드리지 않았다.

## 지금 앱이 가진 것

체성분 자리는 이미 있다. 비어 있을 뿐이다.

| 위치 | 내용 |
|---|---|
| `users/{uid}/inbodyHistory/{YYYY-MM-DD}` | `smm` `fat` `visceral` `bmr` + `date` `timestamp`. 손으로 넣는다. |
| `users/{uid}.healthProfile` | 위 4개의 최신값 거울 + `heightCm` 등 |
| `daily_logs/{uid}_{date}.metrics.weight` | 체중. 식단 탭에서 따로 손입력 |
| `js/metabolic-score.js` | 근지방비 25점 = 골격근량 ÷ 체지방량. 데이터 없으면 `📋 인바디 데이터 필요` |
| `functions/health-trends.js` | `weight` `bmi` `bodyFat` `muscle` 지표 정의가 이미 있다 |
| `js/app-core.js:15681` `loadInbodyHistory` | 📈 체성분 변화 추이 표 — 이미 만들어져 있고 데이터가 없어서 안 뜬다 |

즉 **그릇은 다 있고 숟가락이 없다.** 손으로 네 숫자를 넣는 사람이 거의 없어서
대사건강 점수의 근지방비 항목과 30일 리포트의 체성분 줄이 대부분 비어 있다.

## 기기에서 데이터가 나오는 경로

iGrip X 는 전용 앱이 아니라 **Fitdays**(cn.fitdays.fitdays, 제조사 Mattin)를 쓴다.
확인한 것:

- Fitdays 는 **CSV 내보내기**가 있다 (점 세 개 → Export → 전체/이번달/지난달 → 공유)
- Apple Health / Google Fit / Fitbit / Samsung Health 연동을 문서에 적어 둔다
- **Health Connect 는 문서에 없다.** Google Fit 안드로이드 API 는 Health Connect 로
  대체되는 중이라, 이 경로가 살아 있는지 아닌지는 **실기기로 확인하기 전에는 모른다.**

그래서 경로를 세 개로 나눈다. 순서가 중요하다 — 1번만으로도 오늘 바로 쓸 수 있다.

---

## v1 — 결과 사진 판독 (먼저 만든다)

혈액검사 결과지 판독(`analyzeBloodTest`)과 **완전히 같은 모양**으로 만든다.
그 코드가 이미 SSRF 가드·동의 서버검증·마감선·JSON 파싱 실패 처리까지 다 갖고 있다.

### 서버 — `functions/runtime.js`

`exports.analyzeBodyComposition = onCall(...)`

- `analyzeBloodTest` 를 그대로 본뜬다: 로그인 확인 → **서버에서** `consents.sensitive.agreed`
  확인 → `https://firebasestorage.googleapis.com/` 로 시작하는 URL 만 허용 → 이미지 fetch
- 모델 `gemini-2.5-flash`, `responseMimeType: "application/json"`,
  `thinkingConfig: { thinkingBudget: 0 }` (프로젝트 규칙)
- 새 프롬프트 `BODY_COMPOSITION_ANALYSIS_PROMPT` — 저울 LCD 화면과 Fitdays 결과 화면
  **둘 다** 읽을 수 있어야 한다. 체성분 화면이 아니면 `notBodyComposition: true` 로
  돌려보낸다 (걸음수 판독의 `notHealthApp` 과 같은 방식)
- 반환 JSON:
  `{ measuredDate, weight, smm, fat, bodyFatPct, visceral, bmr, bodyWater, protein, boneMass, bmi, segmental, summary, advice }`
- 저장:
  - `users/{uid}/inbodyHistory/{measuredDate||오늘}` merge
  - `healthProfile` 최신값 거울은 **`update()` + 점 표기**로 쓴다.
    `set()` 에 `'healthProfile.smm'` 을 넘기면 점이 든 최상위 필드가 생긴다 —
    `analyzeBloodTest` 주석에 같은 사고가 적혀 있다. 반복하지 않는다.
  - 오래된 결과지 가드도 그대로 가져온다 (`BLOOD_TEST_FRESH_DAYS` 와 같은 발상).
    5년 전 체성분으로 오늘 점수를 매기지 않는다.
  - 측정일이 오늘이면 `daily_logs/{uid}_{today}.metrics.weight` 도 채운다 →
    BMI·LE8·30일 리포트가 바로 살아난다

### 클라이언트

- `js/diet-analysis.js` — `requestBodyCompositionAnalysis(imageUrl)`
  (`requestBloodTestAnalysis` 와 같은 자리, 같은 실패 문구 규약)
- `js/app-core.js` — `uploadBodyCompositionPhoto(inputEl)`
  (`uploadBloodTestPhoto` 를 본뜸: 동의 게이트 → 타입 검사 → 압축 → 업로드 → 분석)
- **판독 결과를 바로 저장하지 않는다.** 기존 `prof-smm` `prof-fat` `prof-visceral`
  `prof-bmr` 입력칸을 채워 주고, 사람이 보고 고친 뒤 기존 저장 버튼을 누른다.
  OCR 을 무조건 믿으면 틀린 숫자가 점수에 들어가고 아무도 모른다.
- 프로필 인바디 섹션에 `📷 체성분 결과 사진으로 채우기` 버튼 추가

### 인프라 — 승인 따로 받아야 하는 것

- `storage.rules` 에 `match /body_composition/{userId}/{allFiles=**}` 추가
  (`blood_tests` 규칙과 같은 모양, 이미지만, 소유자만)
- **`firebase deploy --only storage` 를 따로 승인받는다.** 규칙을 파일에만 적고
  hosting/functions 만 올리면 사진 업로드가 전부 조용히 거부된다 — 2026-08-15 의
  `consents` 사고와 같은 종류다.
- `firestore.rules` 는 **건드릴 필요 없다.** `inbodyHistory` 는 소유자에게
  필드 화이트리스트 없이 열려 있어서 새 필드가 그냥 들어간다. (확인함)

---

## v2 — Fitdays CSV 올리기 (되돌아보기용)

사진은 한 번에 한 측정이다. CSV 는 **지금까지 잰 전부**를 한 번에 가져온다.
변화 추이 표가 첫날부터 의미를 갖게 되는 건 이쪽이다. AI 비용도 0이다.

- 같은 섹션에 `<input type="file" accept=".csv,text/csv">`
- **브라우저에서 파싱한다.** 서버로 보낼 이유가 없다 — 숫자를 읽는 일이지 판독이 아니다
- 열 이름은 Fitdays 버전·언어마다 다르다. 관대하게 맞추되 **무엇을 무엇으로 읽었는지
  표로 보여주고**, 못 알아본 열은 못 알아봤다고 말한다. 조용히 추측하지 않는다
- 미리보기 → 사람이 확인 → 날짜별로 `inbodyHistory` 에 batch 쓰기 (같은 날은 마지막 것)

## v3 — Health Connect (아직 만들지 않는다)

`android/` 에 Health Connect 읽기가 이미 있지만 **`READ_STEPS` 하나뿐이고,
결과는 SharedPreferences 에만 남고, 웹으로 넘기는 다리가 없다.**
`android/README.md` 의 "아직 남은 일" 5번이 바로 그 다리를 정하는 일이다.

게다가 Fitdays 가 Health Connect 에 쓰는지 자체가 확인되지 않았다.

**만들기 전에 폰으로 확인할 것 (5분):**
1. Fitdays 설치 → iGrip X 로 한 번 측정
2. Health Connect 앱 → 데이터 및 액세스 → 신체 측정
3. 체중 / 체지방 / 제지방량 행에 출처가 `Fitdays` 로 뜨는가?

**뜨지 않으면 이 경로는 없는 것이다.** 뜨면 그때
`READ_WEIGHT` `READ_BODY_FAT` `READ_LEAN_BODY_MASS` `READ_BASAL_METABOLIC_RATE` 를
더하고, 네이티브→웹 다리를 정하고, TWA 가 실제로 배포된 뒤에 착수한다.

---

## 이 데이터가 쓰이는 곳 (저장만 하고 끝내지 않는다)

| 살아나는 것 | 필요한 값 |
|---|---|
| 대사건강 점수 — 근지방비 25점 | `smm`, `fat` |
| LE8 건강습관 점수 — BMI 항목 | `weight` + `healthProfile.heightCm` |
| 30일 리포트 / `health-trends.js` | `weight` `bmi` `bodyFat` `muscle` — 지표 정의는 이미 있다 |
| 📈 체성분 변화 추이 표 | 측정 2회 이상 |

## 검증

- `npm test` — CSV 파서 단위 테스트, 프롬프트 JSON 스키마 테스트를 새로 쓴다
- 실기기 1회: iGrip X 측정 → 사진 판독 → **Firestore 콘솔에서 문서가 실제로
  들어갔는지 눈으로 본다** → 대사건강 점수의 근지방비 항목이 숫자로 바뀌는지 확인
- 성공 토스트만 보고 끝내지 않는다. 규칙이 막고 있어도 화면은 멀쩡해 보인다

## 부위별(segmental) 데이터

iGrip X 는 핸드바가 있어서 상체를 직접 잰다 — 부위별 근육·지방이 나온다.
**저장은 하되 v1 에서는 그리지 않는다.** `segmental: { rightArm, leftArm, trunk,
rightLeg, leftLeg }` 로 넣어 두고, 화면은 값이 쌓인 뒤에 정한다.
