# 2026-04-03 관리자 콘솔 잡음 정리

> **상태**: 완료

## 작업
- [x] 관리자 페이지의 `favicon 404` 원인 확인
- [x] `frame-ancestors` 메타 CSP 경고 원인 확인
- [x] localhost 관리자 페이지가 필요한 연결을 막지 않도록 메타 CSP 정리

## 결과

- `admin.html`에 `icons/icon-192.svg` 파비콘 링크를 추가해 브라우저의 기본 `/favicon.ico` 404를 피했다.
- 관리자 페이지 메타 CSP는 유지하되, 브라우저가 무시하면서 경고를 남기던 `frame-ancestors`는 제거했다.
- `connect-src`와 `frame-src`는 현재 로컬/staging 점검에 필요한 Firebase, Google Auth, emulator, 온체인 조회 엔드포인트 기준으로 넓혀 두었다.

## 메모

- 현재 emulator 로그에 남는 `Detected non-HTTP/2 connection`, websocket connect/disconnect, callable verification DEBUG는 로컬 Firebase 동작 과정의 정보 로그로 보이며 앱 장애는 아니다.
- Chrome DevTools의 `Cross-Origin-Opener-Policy ... window.closed` 메시지는 Firebase popup 로그인에서 자주 보이는 브라우저 경고라서, 로그인 실패가 동반되지 않으면 제품 버그로 보지 않아도 된다.

# 2026-04-03 로컬 포인트 적립 미반영 수정

> **상태**: 완료

## 작업
- [x] `daily_logs` 저장은 되지만 `users.coins` 누적이 안 되는 원인 확인
- [x] Cloud Functions의 `FieldValue` 사용 패턴을 emulator 호환 방식으로 정리
- [x] 로컬 emulator에서 식단/운동/마음 포인트가 실제 적립되는지 합성 테스트로 재검증

## 결과

- 원인: `functions/index.js`에서 `admin.firestore.FieldValue.*`를 직접 쓰던 구간들이 emulator 런타임에서 깨지면서 `awardPoints` 트리거가 중간에 실패했다.
- 수정: `firebase-admin/firestore`에서 가져온 `FieldValue`를 직접 사용하도록 포인트/보상/관리자 조정/소셜 챌린지 관련 구간을 정리했다.
- 검증:
  - `npm test` 통과 (`117 passed`)
  - Functions 파일 로드 확인
  - 로컬 emulator 재시작 후 합성 `daily_logs` 생성
  - `users/<uid>.coins = 40`, `daily_logs.currentStreak = 1` 반영 확인

## 메모

- 기존에 실패했던 로컬 저장은 트리거가 이미 한 번 지나간 상태라 자동 소급 적립되지 않는다.
- 새로 저장하는 기록부터는 정상 적립되고, 이전 로컬 테스트 데이터를 살리려면 별도 재정산이 필요하다.

# 2026-04-03 Firebase staging / emulator 환경 분리

> **상태**: 진행 중

## 할 일

- [x] staging Firebase 프로젝트, Web App, Firestore, Storage, Google Auth, VAPID 키 준비
- [x] `.firebaserc`에 `prod` / `staging` alias와 hosting target 매핑 추가
- [x] `firebase.json`에 hosting target 공통화, localhost CSP 허용, emulator 포트 설정 추가
- [x] `js/firebase-config.js`에 `prod / staging / local` 분기와 공용 Functions 인스턴스 추가
- [x] `js/auth.js`, `js/app.js`, `js/diet-analysis.js`, `js/blockchain-manager.js`, `admin.html`, `sw.js`에서 본서버 하드코딩 제거
- [x] localhost 와 staging 에서 실제 점검 순서 문서화
- [x] Java 21 기준으로 emulator 실행과 localhost 응답 검증
- [ ] staging 배포용 명령 순서 검증

## 검토 메모

- localhost 는 staging 프로젝트 설정을 재사용하되 Firestore / Functions / Storage 는 emulator 로 붙도록 구성했다.
- Auth 는 로컬에서 Google 로그인 흐름을 유지하기 위해 우선 staging Auth 를 그대로 사용하고, 대신 데이터 계층만 emulator 로 분리했다.
- Hosting 은 `target: "app"` 하나로 통합해서 prod 에서는 두 사이트, staging 에서는 staging 사이트 하나로 같은 설정을 재사용하게 만들었다.
- 실제 점검 순서는 `tasks/Firebase_staging_로컬_점검_절차.md` 문서로 분리해 저장했다.
- Firebase CLI `15.8.0` 기준으로 Firestore emulator 실행에는 Java 21 이상이 필요했다. Java 17은 설치돼 있어도 emulator가 뜨지 않았다.
- `C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot\bin` 을 PATH에 앞에 두고 `firebase emulators:start --project staging --debug` 로 기동했을 때 Java 프로세스가 정상적으로 올라왔다.
- `http://127.0.0.1:5000/`, `http://127.0.0.1:5000/admin.html`, `http://127.0.0.1:4000/` 에 대해 모두 `200` 응답을 확인했다.
- 콘솔 타임아웃으로 Firebase CLI가 `EPIPE` 와 함께 죽는 문제를 피하려고 `scripts/start-firebase-emulators.ps1` helper script 를 추가했다.
- helper script 기준으로 auth `9099`, functions `5001`, firestore `8080`, hosting `5000`, storage `9199`, emulator UI `4000` 포트가 모두 LISTEN 상태로 올라오는 것을 확인했다.
- 로컬 검증 시 `community-history.html` 까지 `200` 응답을 확인했고, 함수 포트는 실제 callable URL에 대해 `400`, storage 포트는 root 요청에 대해 `501`, auth 포트는 `200` 응답을 반환했다. 이 정도면 각 emulator 가 실제로 살아 있다고 봐도 된다.
- 사용자가 같은 스크립트를 다시 실행하면 포트 충돌이 나기 때문에, `scripts/start-firebase-emulators.ps1` 에 기존 emulator 감지 / 주소 안내 / `-Restart` 옵션을 추가했고, 별도 정리용 `scripts/stop-firebase-emulators.ps1` 도 만들었다.

# 2026-04-03 수정·개선 우선순위 로드맵

> **상태**: 완료

## 할 일

- [x] 기존 분석 문서에서 핵심 리스크를 추출
- [x] 보안, 자산 정합성, 상태 머신, 알림, 운영 UX 기준으로 우선순위 재배열
- [x] P0/P1/P2 로드맵과 추천 작업 묶음 정리
- [x] 바로 시작할 첫 작업 후보까지 포함해 한글 문서로 저장

## 결과 문서

- `tasks/수정_개선_우선순위_로드맵.md`

## 검토 메모

- 가장 먼저 막아야 할 것은 `daily_logs` 전체 공개 구조와 과개방 Firestore 규칙이다.
- 그 다음은 포인트/HBT 원장 정합성이다. 특히 관리자 화면과 사용자 화면이 같은 값을 다른 의미로 읽는 문제를 먼저 끊어야 한다.
- 개인 챌린지, 소셜 챌린지, 주간 미션은 상태 머신을 서버 중심으로 더 단순하게 정리하는 편이 안전하다.
- 알림은 `notifications` 문서형 인앱 토스트와 FCM 푸시가 분리돼 있어, 중기적으로는 단일 이벤트 소스 재정의가 필요하다.
- 실제 구현은 보안/권한 패치 → 경제 정합성 패치 → 상태 머신 정리 → 알림 통합 → 운영 UI 정리 순서가 가장 안정적이다.

## 다음 확인 사항

- 큰 분석 및 우선순위 정리 완료
- 다음 단계 후보: P0 1차 수정 작업 착수

---

# 2026-04-03 알림 도메인 모델과 읽음/토스트 처리 분석

> **상태**: 완료

## 할 일

- [x] `notifications` 규칙, 인덱스, 생산자/소비자 코드 경로 추적
- [x] 인앱 알림과 FCM 푸시가 각각 어떤 이벤트를 담당하는지 구분
- [x] 읽음 상태가 Firestore인지 `localStorage`인지 실제 기준 확인
- [x] 알림 타입별 미소비/누락 가능성 정리
- [x] 분석 결과를 한글 문서로 정리해 `tasks/`에 저장

## 결과 문서

- `tasks/알림_도메인_모델_읽음_토스트_처리_분석.md`

## 검토 메모

- 현재 알림은 `notifications` 문서 기반 인앱 토스트와 FCM 기반 브라우저 푸시가 분리된 이중 구조다.
- 인앱 알림은 Firestore `read` 필드를 쓰지 않고 `localStorage` 마지막 확인 시각으로만 읽음을 처리해 기기 간 동기화가 없다.
- 서버는 `challenge_started` 알림도 만들지만 클라이언트 소비 로직은 `challenge_invite`, `challenge_settled`만 조회해 시작 알림이 토스트로는 보이지 않는다.
- 친구 스트릭/챌린지 알림은 최근 5개만 조회하므로 미확인 알림이 많으면 오래된 문서는 토스트 기회를 잃을 수 있다.
- `notifications` 규칙은 실제 의도보다 넓어서, 로그인 사용자라면 임의의 알림 문서를 만들 수 있고 수신자는 문서를 수정/삭제할 수 있다.
- 반대로 FCM 리마인더/전체 공지는 `notifications` 문서로 남지 않아 인앱 이력과 OS 푸시 이력이 합쳐지지 않는다.

## 다음 확인 사항

- 큰 분석 주제 정리 완료
- 다음 단계 후보: 개선 우선순위 문서화 또는 리스크별 수정 계획 수립

---

# 2026-04-03 관리자 자산/거래 이력 모델 분석

> **상태**: 완료

## 할 일

- [x] 관리자 대시보드, 회원 상세, 경제 탭이 읽는 자산/거래 데이터 원천 추적
- [x] `users`, `daily_logs`, `blockchain_transactions`, `monthly_rewards`, `pointAdjustments` 역할 구분
- [x] 사용자 자산 탭과 관리자 화면의 HBT/포인트 의미 차이 정리
- [x] 통합 포인트 지급 내역이 실제 원장을 얼마나 복원하는지 점검
- [x] 분석 결과를 한글 문서로 정리해 `tasks/`에 저장

## 결과 문서

- `tasks/관리자_자산_거래이력_모델_분석.md`

## 검토 메모

- 관리자 화면은 경제 상태를 하나의 원장에서 읽지 않고 `users`, `daily_logs`, `blockchain_transactions`, `monthly_rewards`, `meta/communityStats`를 섞어 본다.
- 현재 포인트 잔액 기준은 사실상 `users.coins`지만, HBT 열은 `users.hbtBalance || users.totalHbtEarned`를 사용해 사용자 자산 탭의 온체인 잔액 개념과 어긋난다.
- `blockchain_transactions`는 HBT 중심 이벤트 로그에 가깝고, 반응 포인트·가입 축하·추천 보너스·관리자 수동 조정까지 포함한 전체 포인트 원장은 아니다.
- 경제 탭의 통합 포인트 지급 내역은 `challenge_settlement.rewardPoints`를 기대하지만 서버 기록에는 그 필드가 저장되지 않아 챌린지 포인트 보상이 실제보다 비어 보일 가능성이 있다.
- 공용 캐시가 최근 500건 `daily_logs`만 읽기 때문에 대시보드 활동 지표와 회원 모달 30일 기록은 전체 데이터가 아니라 부분 집계일 수 있다.
- 대시보드의 총 발행 HBT 카드는 `meta/communityStats.totalHbtMinted`를 읽지만, 현재 커뮤니티 통계 재계산 로직은 그 필드를 직접 쓰지 않는다.

## 다음 확인 사항

- 알림(`notifications`) 도메인 모델과 읽음/토스트 처리 분석

---

# 2026-04-03 갤러리 공개 범위 및 신고·차단 정책 분석

> **상태**: 완료

## 할 일

- [x] 게스트/로그인 갤러리 진입과 공개 피드 조회 범위 추적
- [x] `daily_logs` 저장 구조와 실제 갤러리 노출 조건 정리
- [x] 신고(`reports`), 차단(`blockedUsers`), 관리자 후속 처리 흐름 정리
- [x] Firestore rules 기준 실제 강제 수준과 UI 정책 차이 정리
- [x] 분석 결과를 한글 문서로 정리해 `tasks/`에 저장

## 결과 문서

- `tasks/갤러리_공개범위_신고차단_정책_분석.md`

## 검토 메모

- 갤러리는 별도 게시물 컬렉션이 아니라 `daily_logs`를 최근 30일 기준으로 읽어 피드를 만들며, 비로그인 사용자도 의도적으로 접근 가능하다.
- 현재 코드에는 공개/비공개 토글이 없어 기록 저장과 갤러리 원본 생성이 사실상 분리돼 있지 않다.
- UI는 사진·감사일기·반응 중심으로 보여 주지만, Firestore rules는 `daily_logs` 전체 읽기를 `allow read: if true`로 열어 두고 있어 실제 공개 범위가 더 넓다.
- 차단은 `users.blockedUsers`에 저장되는 개인별 피드 숨김 기능에 가깝고, 서버 강제 차단이나 상호작용 차단은 아니다.
- 신고는 `reports` 컬렉션에 쌓인 뒤 관리자 화면에서 수동 처리된다. 자동 숨김·자동 제재 정책은 코드상 보이지 않는다.
- `daily_logs`의 `comments`/`reactions` 업데이트 규칙은 정상 앱 경로보다 넓게 열려 있어, 보안 정책 관점에서는 실제 강제 수준이 약한 편이다.

## 다음 확인 포인트

- 관리자 관제 화면에서 보는 자산/거래 이력 모델 분석
- 알림(`notifications`) 도메인 모델과 읽음/토스트 처리 분석

---

# 2026-04-03 소셜 챌린지 상태 머신 분석

> **상태**: 완료

## 할 일

- [x] 소셜 챌린지 생성, 초대, 수락, 거절, 만료 경로 추적
- [x] `group_goal`/`competition` 결산과 스테이크 락업/환불 규칙 정리
- [x] 대시보드 UI, 알림, Firestore rules/indexes, 어뷰징 방지 장치 정리
- [x] 분석 결과를 한글 문서로 정리해 `tasks/`에 저장
- [x] 검토 메모와 다음 확인 포인트를 `tasks/todo.md`에 남기기

## 결과 문서

- `tasks/소셜_챌린지_상태_머신_분석.md`

## 검토 메모

- 소셜 챌린지는 `social_challenges` 단일 컬렉션 문서가 `pending → active → settled / cancelled`로 전이되는 별도 상태 머신이다.
- 현재 어뷰징 방지 장치는 상호 친구 관계, 최근 30일 내 5일 활동 이력, 1:1 경쟁 인원 제한, 스테이크 상한, 0활동 무효 규칙까지는 포함한다.
- 다만 중복 제한은 `creatorId` 기준만 보므로, 다른 사람이 만든 챌린지에 참여 중인 사용자를 추가로 막지는 않는다.
- `activeDays`는 기간 내 `daily_logs` 문서 수를 세는 방식이라, 완전한 3종 인증일이 아니라 “그날 기록이 있었는가”에 더 가깝다.
- 대시보드는 `pending`/`active`만 보여 주고 `settled`/`cancelled`는 숨긴다. 또 서버는 `challenge_started` 알림을 쓰지만 현재 클라이언트 토스트 조회는 그 타입을 읽지 않는다.
- Firestore rules 레이어에서는 signed-in 사용자의 `pending` 문서 직접 create가 열려 있어, 서버 callable에 들어 있는 검증이 규칙 레벨에서 완전히 강제되지는 않는다.

## 다음 확인 포인트

- 갤러리 공개 범위와 신고/차단 정책 분석
- 관리자 관제 화면에서 보는 자산/거래 이력 모델 분석
- 알림(`notifications`) 도메인 모델과 읽음/토스트 처리 분석

---

# 2026-04-03 개인 챌린지 상태 전이 분석

> **상태**: 완료

## 할 일

- [x] 개인 챌린지 시작 조건과 티어별 상태 저장 구조 추적
- [x] 진행도 누적, `claimable`/`expired` 전환, 로그인 시 정산 흐름 정리
- [x] 수령, 실패 정산, 포기, 레거시 호환 분기 정리
- [x] 분석 결과를 한글 문서로 정리해 `tasks/`에 저장
- [x] 검토 메모와 다음 확인 포인트를 `tasks/todo.md`에 남기기

## 결과 문서

- `tasks/개인_챌린지_상태_전이_분석.md`

## 검토 메모

- 개인 챌린지는 `users.activeChallenges`를 중심으로 움직이고, 실제 분기 처리는 클라이언트(`updateChallengeProgress`, `settleExpiredChallenges`, `forfeitChallenge`)와 서버(`startChallenge`, `claimChallengeReward`, `settleChallengeFailure`)가 나눠 맡는다.
- `endDate`는 UI에선 종료일처럼 보이지만, 실제 코드상으로는 더 이상 누적하지 않는 경계일처럼 동작한다.
- `expired`는 내부 상태지만 UI 활성 카드와 시작 차단 조건에서 빠져 있어, 정산 전 짧은 구간에 같은 티어가 다시 열릴 가능성이 코드상 존재한다.
- 실패 정산은 `challenge_settlement` 실패 로그와 `challenge_failure` 성공 로그가 함께 남고, 경로에 따라 실패 로그가 중복될 수 있다.
- 거래 기록 UI는 `challenge_failure`를 전용 타입으로 이해하지 못해, 사용자 관점 표시와 내부 정산 로그가 어긋날 여지가 있다.

## 다음 확인 포인트

- 소셜 챌린지 상태 머신과 어뷰징 방지 규칙 상세 분석
- 갤러리 공개 범위와 신고/차단 정책 분석
- 관리자 관제 화면에서 보는 자산/거래 이력 모델 분석

---

# 2026-04-03 주간 미션 상태 전이 분석

> **상태**: 완료

## 할 일

- [x] 주간 미션 초기화와 레거시 마이그레이션 흐름 추적
- [x] 미션 달성률 계산, 배지 부여, 연속 주차(streak) 규칙 정리
- [x] 주차 전환 시 archive/reset 흐름과 레이스 방지 장치 분석
- [x] 분석 결과를 한글 문서로 정리해 `tasks/`에 저장
- [x] 검토 메모와 다음 확인 포인트를 `tasks/todo.md`에 남기기

## 결과 문서

- `tasks/주간_미션_상태_전이_분석.md`

## 검토 메모

- 주간 미션은 별도 컬렉션이 아니라 `users` 문서 내부 상태(`weeklyMissionData`, `missionHistory`, `missionStreak`, `missionBadges`)로 관리된다.
- 주차 전환은 서버 스케줄이 아니라 대시보드 렌더 시점에 감지되고, 아카이브는 백그라운드로 실행된다.
- 레이스 방지를 위해 `_archivedWeekIds` 중복 가드와 `freshMissionWeekId` 재조회가 들어가 있지만, 첫 렌더에서 새 주 화면이 먼저 보이는 구조라 반영 타이밍을 이해하고 봐야 한다.
- 진행 중 화면의 달성률은 미션 평균 방식이고, 아카이브 후 `completionRate`는 목표 일수 가중치 방식이라 같은 주라도 숫자 해석이 달라질 수 있다.
- 커스텀 미션은 자유 문구처럼 보이지만 실제 판정은 `diet/exercise/mind` 카테고리 일수 카운터를 재사용한다.

## 다음 확인 포인트

- 개인 챌린지 상태 전이와 실패/수령 분기 상세 분석
- 소셜 챌린지 상태 머신과 어뷰징 방지 규칙 상세 분석
- 갤러리 공개 범위와 신고/차단 정책 분석

---

# 2026-04-03 포인트/보상 규칙 분석

> **상태**: 완료

## 할 일

- [x] 일일 기본 포인트 계산식 추적
- [x] `daily_logs.awardedPoints`와 `users.coins` 반영 흐름 추적
- [x] 추천, 마일스톤, 리액션, MVP, 관리자 조정 규칙 정리
- [x] 개인 챌린지, 소셜 챌린지, HBT 변환 보상 구조 정리
- [x] 분석 결과를 한글 문서로 정리해 `tasks/`에 저장
- [x] 검토 메모와 다음 확인 포인트를 `tasks/todo.md`에 남기기

## 결과 문서

- `tasks/포인트_보상_규칙_분석.md`

## 검토 메모

- 일일 기본 포인트는 클라이언트가 계산하지만, 실제 `coins` 증가는 서버 트리거가 확정한다.
- 현재 구현은 기본 포인트를 증가분만 반영하므로, 같은 날짜 기록을 줄여도 이미 지급된 포인트는 회수되지 않는다.
- 보상 소스는 가입/추천/마일스톤/리액션/MVP/개인 챌린지/소셜 챌린지/관리자 조정으로 분산돼 있어, 한 파일만 보면 전체가 보이지 않는다.
- 참고용 설정과 실제 지급 로직 사이에 남아 있는 차이도 있다. 대표적으로 HBT 일일 한도는 실제 12000인데 설정 파일에는 1000이 남아 있고, 30일 마스터 챌린지 보너스율도 참고 설정과 실제 서버/UI가 다르다.

## 다음 확인 포인트

- 주간 미션 상태 전이와 아카이브 로직 분석
- 개인 챌린지 상태 전이와 실패/수령 분기 상세 분석
- 소셜 챌린지 상태 머신과 어뷰징 방지 규칙 상세 분석

---

# 2026-04-03 데이터 모델 분석

> **상태**: 완료

## 할 일

- [x] 핵심 컬렉션과 서브컬렉션 목록 정리
- [x] 컬렉션별 주요 필드와 문서 ID 규칙 추적
- [x] 읽기/쓰기 주체와 컬렉션 관계 정리
- [x] 분석 결과를 한글 문서로 정리해 `tasks/`에 저장
- [x] 다음 분석 후보를 `tasks/todo.md`에 남기기

## 결과 문서

- `tasks/데이터_모델_분석.md`

## 검토 메모

- 실제 데이터 모델은 `firestore.rules`만으로는 다 보이지 않고, `functions/index.js`와 클라이언트 병합 쓰기까지 함께 봐야 전체가 드러난다.
- `daily_logs`는 개인 기록 원장이면서 공개 갤러리 포스트이기도 하다.
- `users` 문서는 현재 상태를 많이 품고 있어 도메인 응집도가 높고, 서버 전용 필드와 레거시 흔적이 함께 존재한다.
- `blockchain_transactions`는 자산 탭, 관리자 화면, 마이그레이션 이력까지 공유하는 이벤트 로그 성격이 강하다.
- `social_challenges`는 단순 초대 목록이 아니라 상태 전이가 있는 별도 도메인 모델이다.

## 다음 확인 포인트

- 포인트/보상 계산 규칙 상세 분석
- 주간 미션 상태 전이와 아카이브 로직 분석
- 갤러리 공개 범위와 신고/차단 정책 분석

---

# 2026-04-03 사용자 흐름 분석

> **상태**: 완료

## 할 일

- [x] 로그인 및 온보딩 흐름 추적
- [x] 일일 기록(식단/운동/수면/마음) 저장 흐름 추적
- [x] 포인트, HBT, 추천, 갤러리, 소셜 챌린지 흐름 추적
- [x] 분석 결과를 한글 문서로 정리해 `tasks/`에 저장
- [x] 검토 메모와 다음 확인 포인트를 `tasks/todo.md`에 남기기

## 결과 문서

- `tasks/사용자_흐름_분석.md`

## 검토 메모

- 이번 분석은 실행이 아닌 정적 코드 추적 기준으로 정리했다.
- 사용자 흐름의 중심은 `대시보드 → 기록 저장 → 서버 보상 반영 → 자산/갤러리/챌린지 확장` 구조다.
- 포인트는 프런트에서 계산값을 `daily_logs.awardedPoints`로 저장하지만, 실제 `coins` 증가는 서버 트리거가 담당한다.
- 갤러리는 비로그인 사용자에게도 열려 있으며, 커뮤니티 유입과 로그인 전환의 역할을 함께 가진다.
- 블록체인 기능은 핵심 흐름 뒤에 지연 로드되는 확장 계층으로 붙어 있다.

## 다음 확인 포인트

- `daily_logs`, `users`, `social_challenges`, `blockchain_transactions` 중심으로 데이터 모델 상세 문서 작성
- 포인트/보상 계산 규칙과 예외 케이스 문서화
- 대시보드 주간 미션과 아카이브 로직 상태 전이 정리

---

# 2026-04-02 세션 완료 보고

> **상태**: ✅ 전체 완료 · main push · Firebase 배포 완료 (hosting + functions + firestore:indexes)

---

## 이번 세션 완료한 작업

### 1. HBT 일일 변환 한도 상향 ✅
- `functions/index.js`: `MAX_DAILY_HBT` 5,000 → 12,000
- 배경: 1:4 변환율에서 3,000P → 12,000 HBT이므로 기존 한도가 너무 작았음
- 토크노믹스 검토: 온체인 USER_DAILY_CAP(20K) 이내, Phase 1 주간 목표(140K) 안전 범위 확인

### 2. 관제탑 포인트 지급 내역 통합 테이블 ✅
- 기존: 일반 포인트 / 특수 포인트 테이블 분리
- 변경: "모든 포인트 지급 내역" 단일 테이블로 통합
- 포함 항목: 일일 습관 포인트 + 월간 MVP + 소셜 챌린지 보상 + 가입 축하 + 초대 이벤트
- Firestore index 오류 수정: `blockchain_transactions` 쿼리에서 `orderBy` 제거 → 클라이언트 정렬

### 3. 관제탑 MVP 특정 월 배포 버튼 ✅
- "특정 월 배포" 버튼 + `distributeMvpForMonth()` 함수 추가
- 2월/3월 과거 데이터 소급 배포 가능

### 4. 커뮤니티 통계 백필 ✅
- `backfillCommunityStatsArchive` onCall Cloud Function 추가
- 관제탑에서 "🗂 과거 커뮤니티 통계 백필" UI로 실행
- 2월/3월 통계 백필 성공 확인

### 5. 소셜 기능 1단계: 친구 활동 피드 ✅

**A1. 대시보드 친구 오늘 현황 카드** (`js/app.js`, `index.html`)
- 친구의 오늘 식단🥗 / 운동🏃 / 마음🌙 체크 여부 표시
- 연속 기록일(🔥 N일) 표시
- 친구 없으면 카드 숨김

**A2. 스트릭 달성 시 친구 알림** (`functions/index.js`)
- 3 / 7 / 14 / 30일 스트릭 달성 시 친구에게 `friend_streak` 알림
- 중복 방지: `daily_logs.streakNotifiedDays` 배열로 마일스톤 기록
- 클라이언트: 새 friend_streak 알림 toast 표시

### 6. 소셜 챌린지 2단계: 단체 목표 + 1:1 경쟁 ✅

**Cloud Functions** (`functions/index.js`)
- `createSocialChallenge`: 생성 + 쌍방 친구 확인 + 최소 5일 활동 이력 확인 + 포인트 락업
- `respondSocialChallenge`: 수락(포인트 락업) / 거절. 전원 수락 → active 전환
- `settleDueSocialChallenges`: 매일 00:10 KST 자동 결산 스케줄

**어뷰징 안전장치 (전부 구현됨)**
| 안전장치 | 효과 |
|---|---|
| 쌍방 친구 확인 | 부계정 일방 등록 방지 |
| 최소 5일 활동 이력 | 신규 부계정 즉시 참가 차단 |
| 양쪽 최소 1일 활동 | Stake Siphon 차단 |
| 스테이크 최대 200P | 피해 규모 제한 |

**결산 로직**
- 단체 목표: 전원 70%+ 달성 → +20% 습관 포인트 보너스
- 경쟁 동점: 스테이크 양쪽 반환
- 경쟁 한쪽 0일: 무효, 전액 반환 (어뷰징 차단)
- 경쟁 승리: 상대 스테이크 + 기간 포인트 30% 보너스

**Firestore** (`firestore.rules`, `firestore.indexes.json`)
- `social_challenges` 컬렉션 읽기/생성 규칙 추가
- `status+endDate`, `creatorId+status` 복합 인덱스 추가

**프론트엔드** (`js/app.js`, `index.html`)
- 대시보드: 소셜 챌린지 카드 (친구 있을 때만 표시)
- 생성 모달: 유형(단체/경쟁) → 친구 선택 → 기간(3/7/14일) → 스테이크(50/100/200P) → 생성
- 초대 응답 모달: 수락/거절
- 결산 알림 토스트: win/loss/draw/void/success/missed 각각 메시지
- UI 개선: 설명 텍스트 주황색, 기간별 성공 기준 안내, 1:1 경쟁에서 성공 기준 문구 숨김

### 7. 카카오톡 챗봇 친구 추가 기능 ✅ (`habitchatbot`)
- `commands/addFriend.js`: `!내코드`, `!친구 [코드]` 핸들러
- `routes/kakao.js`, `routes/messengerbot.js`: 라우팅 + 도움말 업데이트
- Render.com 자동 배포 완료

### 8. auth.js createdAt 필드 추가 ✅
- 첫 로그인 시 `createdAt: serverTimestamp()` 저장
- 추후 소셜 챌린지 계정 나이 검증에 활용

---

## 배포 현황

| 대상 | 배포 방법 | 상태 |
|------|-----------|------|
| habitschool hosting | `firebase deploy --only hosting,functions` | ✅ |
| habitschool functions | 동상 | ✅ (신규: createSocialChallenge, respondSocialChallenge, settleDueSocialChallenges) |
| firestore indexes | `firebase deploy --only firestore:indexes` | ✅ |
| habitchatbot | git push → Render 자동 배포 | ✅ |

---

## 커밋 이력 (이번 세션)

### habitschool
| 커밋 | 내용 |
|------|------|
| `0dca7be` | fix: 1:1 경쟁 모드에서 기간 성공 기준 문구 숨김 |
| `dedbe78` | fix: 챌린지 생성 모달 UI 개선 |
| `9d789f7` | feat: 소셜 챌린지 2단계 — 단체 목표 + 1:1 경쟁 |
| `c886cff` | feat: 소셜 기능 1단계 — 친구 오늘 활동 카드 + 스트릭 달성 알림 |
| `a27b5d8` | refactor: 포인트 지급 내역 통합 테이블로 개편 |
| `661e3f6` | feat: 일일 HBT 변환 한도 5000 → 12000으로 상향 |
| `26d4d1f` | feat: admin MVP 보상 특정 월 직접 배포 기능 추가 |
| `b964e27` | feat: 과거 커뮤니티 통계 백필 기능 추가 |

### habitchatbot
| 커밋 | 내용 |
|------|------|
| `380d88b` | feat: 카카오톡 챗봇 친구 추가 기능 (!내코드, !친구 명령어) |

---

# 다음 세션: BSC 메인넷 출시

> **준비물**: Keystone Pro 3 하드웨어 지갑

## 사전 준비 체크리스트

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 1 | Keystone Pro 3 — Deployer 주소 확인 | ⬜ | ETH 계정 주소 메모 |
| 2 | Safe 멀티시그 지갑 생성 (리저브 30M용) | ⬜ | https://app.safe.global → BSC 선택, 2/3 서명 |
| 3 | Deployer 지갑에 BNB 충전 | ⬜ | 약 0.01 BNB (≒$5 미만) 이면 충분 |
| 4 | Slither 보안 감사 실행 | ⬜ | `pip install slither-analyzer && slither .` |
| 5 | BSC 메인넷 컨트랙트 배포 | ⬜ | deploy.js에 Safe 주소 반영 후 실행 |
| 6 | BscScan 컨트랙트 검증 | ⬜ | `npx hardhat verify --network bsc ...` |
| 7 | functions/index.js 메인넷 주소로 전환 | ⬜ | HABIT_ADDRESS, RPC_URL, CHAIN_ID 변경 |
| 8 | blockchain-config.js 주소 업데이트 | ⬜ | mainnetAddress 필드 |
| 9 | Firebase Functions 재배포 | ⬜ | `firebase deploy --only functions` |
| 10 | 소액 mint 테스트 | ⬜ | 100P → HBT 변환 실제 트랜잭션 확인 |
| 11 | 모니터링 알림 설정 | ⬜ | BscScan 알림 등록 |

## 메인넷 전환 시 변경할 코드

**`functions/index.js`**
```javascript
// 현재 (BSC 테스트넷)
const HABIT_ADDRESS   = "0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B";
const STAKING_ADDRESS = "0x7e8c29699F382B553891f853299e615257491F9D";
const RPC_URL  = "https://data-seed-prebsc-1-s1.binance.org:8545/";
const CHAIN_ID = 97;
const EXPLORER_URL = "https://testnet.bscscan.com";

// 변경 후 (BSC 메인넷)
const HABIT_ADDRESS   = "0x배포_후_기록";
const STAKING_ADDRESS = "0x배포_후_기록";
const RPC_URL  = "https://bsc-dataseed.binance.org/";
const CHAIN_ID = 56;
const EXPLORER_URL = "https://bscscan.com";
```

**`contracts/hardhat.config.js`**
```javascript
bsc: {
  url: "https://bsc-dataseed.binance.org/",
  chainId: 56,
  accounts: [process.env.DEPLOYER_PRIVATE_KEY]  // ← Keystone → MetaMask export
}
```

**`contracts/scripts/deploy.js`**
```javascript
// reserveWallet을 Safe 멀티시그 주소로 변경
const reserveWallet = "0xSafe_멀티시그_주소";
```

## 주의사항
- Keystone Private Key는 절대 코드/파일에 저장 금지
- 배포 전 `contracts/.env`의 DEPLOYER_PRIVATE_KEY 확인 후 사용, 완료 후 즉시 삭제
- 멀티시그 없이 30M 토큰 단일 지갑 보관 절대 금지
- 메인넷 배포 후 테스트넷 컨트랙트 주소와 혼용 주의

---

## 기존 미완료 항목 (낮은 우선순위)

### 🟡 사용자 경험
- [ ] 관제탑 신고 처리 UI (승인/반려/처리 완료)
- [ ] 회원별 개별 타겟 푸시 알림

### 🟢 낮은 우선순위
- [ ] CDN SRI 해시 추가 (ethers.js, html2canvas, exif-js)
- [ ] 갤러리 콘텐츠 관리 (관제탑에서 게시물 직접 삭제)
# 2026-04-03 신규 계정 저장/사진 복원 버그 수정

> **상태**: 진행 중

## 작업
- [x] 새 계정 저장 실패 원인을 콘솔 에러와 규칙 기준으로 추적
- [x] `users/{uid}` 지갑 초기화에 필요한 Firestore rules 필드 화이트리스트 보강
- [x] 로컬 Storage Emulator URL을 저장된 사진 URL로 인정하도록 클라이언트 보정
- [ ] 로컬 emulator 재기동 후 새 계정 식단 저장 흐름 재검증
- [ ] 검증 결과와 남은 리스크 정리

## 검토 메모

- 새 계정에서 보인 `지갑 초기화 오류: PERMISSION_DENIED`는 `users/{uid}` 업데이트 규칙에 `walletCreatedAt`, `encryptedKey`, `walletIv`, `walletVersion` 등이 빠져 있어 발생했다.
- 로컬에서는 Storage Emulator가 `http://127.0.0.1:9199/...` 형태 URL을 주는데, 기존 코드는 `firebasestorage.googleapis.com`만 유효 URL로 인정해서 저장된 사진을 다시 불러오지 못했다.
- 위 두 문제가 겹치면 새 계정 기준으로는 “사진이 사라지고 저장이 안 된 것처럼 보이는” 체감 버그가 재현된다.
# 2026-04-03 로컬 에뮬레이터 연결 거부 복구

> **상태**: 완료

## 작업
- [x] `127.0.0.1:5000` 연결 거부 시점의 localhost / Emulator UI 포트 상태 재확인
- [x] 현재 에뮬레이터가 다시 살아 있는지 `5000`, `4000`, HTTP `200`으로 검증
- [x] `scripts/start-firebase-emulators.ps1`가 반쪽 실행 상태를 정상 실행으로 오판하지 않도록 보강
- [x] 배경 실행(`-Background`)에서도 이미 실행 중 / 부분 장애 상태를 먼저 판별하도록 수정

## 검증 메모

- `Test-NetConnection 127.0.0.1 -Port 5000` 성공
- `Test-NetConnection 127.0.0.1 -Port 4000` 성공
- `Invoke-WebRequest http://127.0.0.1:5000/` 결과 `200`
- `powershell -ExecutionPolicy Bypass -File .\scripts\start-firebase-emulators.ps1` 실행 시 정상적으로 `already running` 안내 출력 확인
- `powershell -ExecutionPolicy Bypass -File .\scripts\start-firebase-emulators.ps1 -Background` 실행 시에도 불필요한 자식 실행 없이 동일 안내 출력 확인

## 리뷰

- 이번 연결 거부는 앱 코드 문제가 아니라 로컬 Firebase 에뮬레이터 일부 프로세스가 내려간 상태에서 시작 스크립트가 이를 정상 구동으로 오판한 운영 이슈에 가까웠다.
- 이제 핵심 포트(`4000`, `5000`, `5001`, `8080`, `9099`, `9199`) 중 일부만 떠 있을 때는 즉시 부분 장애로 판단하고 `-Background -Restart` 명령을 안내한다.
# 2026-04-03 로컬 관리자 권한 자동 동기화

> **상태**: 완료

## 작업
- [x] 관리자 화면 콘솔 에러를 Firestore 규칙과 관리자 로그인 로직 기준으로 추적
- [x] 프런트의 이메일 화이트리스트 판정과 서버의 `admins/{uid}` 기준이 어긋나는 원인 확인
- [x] `ensureAdminAccess` callable을 추가해 관리자 로그인 시 `admins/{uid}` 문서를 자동 동기화
- [x] `admin.html` 로그인 흐름이 새 callable을 통해 서버 권한을 먼저 보장하도록 연결
- [x] 함수 로드, 테스트, 로컬 에뮬레이터 재기동까지 확인

## 검증 메모

- `npm test` 통과: `117 passed`
- `node -e "require('./functions/index.js')"` 통과
- Emulator 로그에서 `ensureAdminAccess` callable 로드 확인
- `http://127.0.0.1:5000/admin.html` 응답 `200` 확인
- 1차 시도에서는 `admin.firestore.FieldValue.serverTimestamp()`로 인해 `ensureAdminAccess`가 `500 INTERNAL`로 실패했고, 이후 `Date` 기반으로 수정 후 에뮬레이터를 재기동했다.

## 리뷰

- 원인은 관리자 UI가 `ADMIN_EMAILS`만으로 진입을 허용하는 반면, Firestore 규칙과 관리자용 Cloud Functions는 `admins/{uid}` 문서가 있어야만 관리자 읽기/실행을 허용한다는 불일치였다.
- 이번 수정으로 화이트리스트 이메일 또는 레거시 `admins/{email}` 문서를 가진 사용자는 로그인 시 서버에서 `admins/{uid}` 문서를 자동 보장받고, 이후 Firestore 조회와 관리자 callable이 같은 기준으로 동작한다.
