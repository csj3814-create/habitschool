# 심플형(`/simple`) 정리 — 2026-11-11 · **대표 승인 대기**

`/simple` 주소는 살려 두고, 들어오면 기본 앱(`/`)으로 넘긴다. 심플 전용 코드는 이번에 지우지 않는다.

## 먼저 확인한 것 (코드는 아직 안 고침)

- **초대 QR 이 전부 `/simple?ref=코드` 를 가리킨다.** 심플 프로필뿐 아니라 기본 앱의 초대 창 QR 도 그렇다
  (`buildSimpleModeReferralQrUrl`, `js/app-core.js` 1278·32078, 2026-04-15 결정). 이미 찍혀 나간 QR 이
  있으므로 넘길 때 `?ref=` 가 떨어지면 초대 보상이 끊긴다 — 쿼리 보존이 이번 작업의 핵심이다.
- **설치된 앱은 이미 `/` 로 열린다.** `manifest.json` 의 `start_url`·`id` 는 처음부터 `/` 였다(git 이력에
  `/simple` 없음). 남는 것은 `/simple` 주소로 만든 바로가기(아이폰 홈 화면·삼성 인터넷)뿐이고 넘김으로 해결된다.
  `sw.js` 는 화면 이동을 네트워크 먼저 받고, 캐시 이름을 올리면 옛 `/simple` 응답이 지워진다. 오프라인이면
  `index.html` 이 대신 뜨는데, 그때도 머리 스크립트가 넘긴다.
- **새로 잠기는 기능이 없다.** 기능 잠금은 `/simple` 에서도 같은 코드로 이미 걸려 있다(심플 분기 없음).
  출시 전 가입 + 기록 1일 이상이면 전부 열린다는 약속(`js/feature-unlock.js`)은 주소와 무관하다.
- sitemap·소개 페이지·`marketing/` 원고에는 `/simple` 링크가 없다. 바꿀 링크는 위 초대 QR 하나다.
- 운영의 `/simple/?ref=x` → `/simple?ref=x` 301 은 쿼리를 지닌다. 다만 `trailingSlash` 동작과 겹쳐서
  "설정한 redirect 가 쿼리를 지닌다" 는 증거로는 부족하다 → 스테이징에서 직접 본다.

## 할 일

### 1. `/simple` → `/` 넘기기
- [ ] `index.html`·`en/index.html` 머리 스크립트: `/simple` 이면 `simple-mode` 를 붙이는 대신
      `location.replace('/' + search + hash)` (넘어가는 동안 화면은 가린다)
- [ ] `firebase.json`: `/simple`·`/simple/` → `/` 301 추가. rewrite 는 폴백으로 남긴다
      — 서버에서 넘기면 페이스북·네이버 유입 출처가 GA4 에 그대로 남는다(스크립트로만 넘기면 "직접" 으로 바뀜)
- [ ] 스테이징에서 `curl -I "/simple?ref=x&chatbotConnectToken=y"` 의 `Location` 확인.
      **쿼리가 떨어지면 서버 301 을 빼고 머리 스크립트만 쓴다**
- [ ] 테스트: `/simple?ref=x#diet` → `/?ref=x#diet`, 플레이 앱 안에서도 같은지
      (`tests/korean-app-unchanged-i18n.test.js` 68·116행 기대값을 "넘긴다" 로 바꾼다. `getRouteContext` 47행은 그대로)

### 2. 버전 선택에서 심플 빼기
- [ ] `index.html`·`en/index.html` 로그인 화면·프로필 스위처의 심플 단추 삭제,
      안내 문장 → "기본형·English·라이트 버전을 골라 쓸 수 있어요."
- [ ] `APP_VERSION_PATHS`(app-core)·`APP_VERSION_LABELS`(auth)·로그인 뒤 이동 표(auth 1788)에서 `simple` 제거
- [ ] `habitschool_pending_app_version` 에 `simple` 이 남은 사람은 `ko` 로 읽어 `/` 로 보낸다
- [ ] `js/i18n-en.js` 의 `version.simple` 삭제, `tests/play-mode.test.js` 91행 기대값 수정
- [ ] `tests/fixtures/korean-text-baseline.json` 은 지운 글자("심플" 3곳, 안내 문장 1곳)만 손으로 고친다

### 3. 초대 QR 을 `/?ref=코드` 로
- [ ] `buildSimpleModeReferralQrUrl` 이 기본 앱 주소를 만들게 한다 + 테스트

### 4. 설치 회원·기능 잠금 — 코드 변경 없음
- [ ] 스테이징에서 `/simple` 로 열어 둔 탭이 새 배포 뒤 `/` 로 열리는지, 잠금 상태가 같은지 확인만 한다

### 5. 이번에는 지우지 않는다
- `isSimpleMode()` 분기, `SIMPLE_TABS`, 심플 프로필 화면, `styles-base.css` 의 `simple-mode` 규칙.
  1~4 가 운영에서 문제없음을 본 뒤 별도 변경으로 지운다.

### 6. 문서
- [ ] `functions/account-deletion.js` 35행 주석과 `tasks/2026-10-29_account_deletion_grace.md` 27행에
      "`daily_logs` 는 챗봇도 읽는다(!오늘·!순위). 챗봇이 `account_holds/{uid}` 로 거른다" 를 남긴다 (주석만, 함수 배포 불필요)
- [ ] `CHANGELOG.md`·`changelog.html` 에 한 줄: 심플형이 기본 앱으로 합쳐졌고 예전 주소·초대 QR 은 그대로 쓸 수 있다

### 7. 버전·검증·배포
- [ ] `?v=596` → `597`, `sw.js` `CACHE_NAME` → `habitschool-v597`
- [ ] `npx vitest run` 전체 통과
- [ ] 내가 고친 파일만 커밋 → `git push origin main`
- [ ] `firebase deploy --project staging --only hosting`
- [ ] 스테이징 브라우저 확인: `/simple?ref=x#diet` 가 쿼리·해시를 지닌 채 `/` 로, 버전 선택에 심플 없음, 초대 QR 주소
- [ ] 운영 배포는 대표가 "본서버 배포" 라고 할 때만

## 달라지는 점 하나

지금은 `/simple` 로 처음 온 사람이 바로 로그인 화면을 본다. 넘긴 뒤에는 `/` 의 규칙을 따른다 —
`?ref=` 같은 쿼리가 있으면 로그인 화면, 아무것도 없이 처음 온 사람은 소개 페이지.

## 함께 판단할 것 (의견)

- **GA4 `app_mode` 맞춤 측정기준: 등록하지 않는 쪽.** 등록해도 그 뒤 데이터부터만 나뉘는데, 그때는 심플이
  없어져 값이 전부 `default` 다. 나눠 보고 싶은 것이 생기면 "웹·플레이 앱·설치 앱" 을 가르는 값을 새로 정해
  그것을 등록하는 편이 쓸모 있다. `app_mode` 파라미터 자체는 5번(심플 코드 삭제) 때 같이 정리한다.
- **탈퇴 보관 중 `daily_logs`**: 위 6번대로 주석·설계 문서에 남긴다. 읽는 쪽이 둘(앱·챗봇)이라는 사실이
  코드에 없으면 다음에 또 "본인·관리자만 읽는다" 를 믿고 고치게 된다.

---

# 진행 중 — 2026-09-23

계획 본문: `tasks/2026-09-23_body_composition_igrip.md`,
`tasks/2026-09-23_first_coupon_acceleration.md`

결정된 것:
- 체성분 유입 = **공유 시트(CSV) + 사진 판독**. BLE 는 안 한다. Health Connect 는 10-08 에 바뀜 — HC 가 주는 7개를 받는다 (`tasks/2026-10-08_health_connect_1.0.10.md`)
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
- [x] B1 배지 포인트 — **접음** (2026-09-23). 첫 쿠폰 단축 효과가 하루뿐이고,
      주간 미션 자체를 신규 회원에게 접기로 했다 (`40fdf0d`).
- [ ] **2026-10-23 주간 미션 재평가** — 9/23 과 같은 집계를 다시 돌린다
      (최근 14일 기록 회원 중 이번·지난주 미션 설정 수, 정산 달성률) +
      GA `weekly_mission_gate_opened`. 9/23 기준: 활동 22명 중 5명, 중앙값 88%.
      더 줄었으면 은퇴 — 헤더 "Lv." 와 관제탑 레벨 열 정리, 받은 배지는 읽기 전용으로 남김
- (지난 기록) B1 배지 포인트 — 다음 턴으로 미뤘던 항목 (사용자 결정 2026-09-23)
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

- [ ] **9/12 프로덕션 액세스 재신청** (8/29 반려)
      신청서 3단계 답변 초안 + 테스터 메일 초안: `tasks/2026-09-10_play_reapply_prep.md`
      - [ ] **하드 게이트**: 12명 이상이 직전 14일 "연속" 옵트인인지 확인.
            중간 이탈자는 14일을 처음부터 다시 센다. 걸쳐 있으면 신청을 미루는 편이 낫다
      - [ ] 테스터 안내 메일 발송 (BCC, 문의 주소 `csj38141@gmail.com`)
      - [ ] 가능하면 한 번 더 업데이트. 트랙에 쌓인 것은 8/31(빈 빌드)과 9/10 둘뿐이다
      - [ ] 검토용 계정 로그인이 지금도 되는지 재확인
      - 핵심: **2번 사유는 근거가 넘치는데 전달이 안 됐다.** 반려 이후 사용자 향
        커밋이 57건인데 TWA 라 대부분 호스팅으로 나가 Play 트랙에는 안 보인다.
        신청서에서 이 구조를 먼저 설명해야 한다

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

- `storage.rules` 에 `body_composition/` 추가됨 → **스테이징 배포 완료 (2026-09-23)**,
  라이브 규칙셋을 받아 로컬 파일과 바이트 비교해 일치 확인.
- **운영 배포 완료 2026-09-23** (`c76f897`, v436): storage → functions → hosting.
  functions 는 exit 0 이었지만 28개가 429 로 실패 — 이번 릴리스가 쓰는 함수
  (analyzeBodyComposition 생성, redeem·snapshot·milestone 갱신)는 첫 회에 성공했고,
  실패한 28개만 7개씩 75초 간격으로 다시 올려 28/28 확인.
  운영 storage 규칙셋도 로컬과 바이트 일치, 제공 중인 sw.js·manifest·JS 가 v436 인 것 확인
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

## 체성분 유입 — 2026-09-23 운영 (v438)

- [x] Fitdays 공유가 "사진을 찾지 못했어요" 로 버려지던 것 — 서비스 워커가 파일 내용으로 사진·CSV 를 가린다 (`4fc04e3`)
- [x] 체성분 화면을 공유하면 고르는 창 없이 바로 체성분 칸으로 (`e841aaf`)
- [x] 프로필 "나의 체성분": 사진 / Fitdays 공유 / 헬스커넥트, 저장 시 출처·측정일 기록
- [ ] **APK 1.0.6** (versionCode 9): Fitdays **CSV 공유** 받기 — 빌드·Play 업로드 남음
- [ ] **APK 1.0.10** (versionCode 13): 헬스커넥트 체성분 권한 4개 + 수면·운동 권한 4개 추가
      — **프로덕션 액세스 승인 뒤에.** Play Console 건강 권한·데이터 보안 선언을 새로 써야 한다.
      코드와 웹 버튼은 준비됨, 웹은 versionCode 13 부터 버튼을 보인다.
      (1.0.9 / versionCode 12 는 권한 없이 수면·운동 코드만 싣고 나갔다 — `tasks/2026-09-24_health_connect_sleep_exercise.md`)
      `tests/android-launch-health-sync.test.js` 의 READ_STEPS 한정 규칙도 그때 푼다.
