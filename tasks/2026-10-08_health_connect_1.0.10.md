# Health Connect 1.0.10 (versionCode 13) — 수면·운동·체성분 권한 켜기

작성 2026-10-08. 프로덕션 1.0.9(12) 심사 중. 1.0.10 은 승인·공개 뒤에 올린다.

## 정한 것

- 수면·운동 4개 권한(9/24 계획 그대로)을 켠다
- 체성분은 **Health Connect 가 주는 만큼 전부** 받는다 (사용자 결정 10-08).
  9/23 `todo.md` 의 "체성분은 HC 안 한다" 를 대체한다 — 공유 시트·사진 판독은 그대로 두고,
  HC 는 삼성헬스·다른 체중계 앱을 쓰는 회원용 경로로 더한다
  - 기존 4개: 체중 · 체지방률 · 기초대사량 · 제지방량
  - 더하는 3개: **골량(무기질)** · **체수분** · **키**
  - 골격근량·내장지방은 규격에 없다 → 여전히 손대지 않는다
- 체성분 값은 **같은 측정에서 나온 것만** 묶는다. 각 항목의 "가장 최근" 을 따로 고르면
  오늘 체중과 석 달 전 제지방량이 한 기록(오늘 날짜)에 들어간다. 기준 기록(체중)과
  12시간 넘게 떨어진 값은 버린다. 키는 측정이 아니라 설정값이라 예외
- 키는 프로필 키 칸이 **비어 있을 때만** 채운다 (BMI 에 쓰임)

## 체크리스트

- [x] Kotlin: 골량·체수분·키 읽기, 같은 측정 묶기, `bodyPermissions` 7개
- [x] `AppRoutes.withHealthConnectBody` 에 `hcBoneMass` `hcBodyWater` `hcHeight`
- [x] 매니페스트 건강 권한 12개, versionCode 13 / 1.0.10
- [x] 권한 안내 문구(strings.xml) — "걸음 수만" 문구가 틀려졌다
- [x] 웹 `health-connect-body.js` 파싱·범위, `app-core.js` 칸 채우기·`inbodyHistory` 저장
- [x] `privacy.html` — Health Connect 항목·목적·보관·철회 절을 새로 둔다 (지금은 한 줄도 없다)
- [x] 테스트 갱신, vitest, Kotlin 컴파일
- [x] 커밋·푸시 → 스테이징(hosting + firestore:rules)
- [x] 운영(10-08 배포 완료, v497): 사용자 확인 뒤 (hosting + firestore:rules). 규칙은 1.0.10 보다 먼저
- [ ] AAB 빌드 → 내부 테스트 실기기 확인 → Play Console 건강 권한 선언·데이터 보안 갱신 → 프로덕션 제출 (승인 뒤, 사람)

## 결과 (2026-10-08)

- `e02c2ef`. vitest 2637 통과, `:app:compileDebugKotlin` 통과
- 스테이징 hosting + firestore:rules 배포 완료 (`sleepAndMind.sleepSync` 허용 포함)
- 개인정보처리방침 시행일은 8/15 그대로 — 바꾸면 `CONSENT_DOC_VERSION` 이 움직여 전원 재동의.
  "최근 변경: 10/8" 한 줄로 남겼다. 영문(1-d)도 같이
- 아직 실기기 미확인. AAB 는 1.0.9 승인·공개 뒤 빌드

## 스토어 공개 뒤 함께 할 일 (10-08 결정)

- `js/pwa-install.js` `PLAY_STORE_LISTED = true` — 얇은 권유 줄(#android-app-invite)과
  "앱으로 열기" 줄(#open-in-app-banner)이 다시 보인다. 누르면 스토어로 바로 간다
- 화면을 덮는 시트 둘(로그인 뒤 · 저장 직후)과 테스터 3단계 안내는 지웠다 (`71d066e`). 되살리지 않는다
- `SUPPRESS_ANDROID_PWA_INSTALL` 은 true 로 둔다 — 안드로이드 설치 경로는 Play 앱 하나
