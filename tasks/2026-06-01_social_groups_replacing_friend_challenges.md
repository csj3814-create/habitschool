# 2026-06-01 친구 챌린지 → 소모임 시스템 전환 계획

## 배경
- 현재 친구 챌린지는 `social_challenges` 컬렉션과 `createSocialChallenge`, `respondSocialChallenge`, `cancelSocialChallenge`, `settleDueSocialChallenges` 함수에 걸쳐 신청, 초대, 수락, 정산 흐름을 가진다.
- 대시보드에는 친구 챌린지 카드와 생성/초대 응답 모달이 있고, 친구 관계(`friendships`)와 활동 준비도 계산까지 얽혀 있다.
- 사용자가 원하는 방향은 친구끼리 신청을 주고받는 부담이 큰 구조를 줄이고, 같은 식단/운동 루틴을 하는 사람들이 자연스럽게 모여 서로 응원하는 소모임이다.

## 제품 방향
- 친구 관계 기반 초대 시스템을 핵심 동선에서 제거한다.
- 소모임은 "신청/수락"보다 "찾기/참여/기록/응원"을 중심으로 둔다.
- 보상 경쟁보다 지속 행동, 같은 목표, 가벼운 피드백을 강조한다.
- 기존 개인 챌린지와 포인트/마켓 흐름은 유지하고, 소모임은 커뮤니티 참여 레이어로 둔다.

## MVP 제안
- 소모임 유형:
  - 식단: 채소식, 단백질, 저녁 가볍게, 간헐적 단식, 당 줄이기
  - 운동: 걷기, 홈트, 헬스, 러닝, 스트레칭
  - 마음: 수면, 명상, 감사 기록
- 가입 방식:
  - 공개 소모임은 한 번 탭으로 바로 참여
  - 운영/관리자 추천 소모임은 기본 목록으로 노출
  - 초대나 수락은 MVP에서 제외
- 주요 화면:
  - 대시보드: "함께 하는 소모임" 카드로 오늘 내 그룹 현황 표시
  - 소모임 목록: 카테고리/인원/오늘 인증 수/최근 응원 수
  - 소모임 상세: 오늘 인증 피드, 멤버 진행 요약, 응원 버튼, 내 기록 바로가기
- 인증 기준:
  - 식단 그룹은 오늘 식단 사진/기록이 있으면 인증
  - 운동 그룹은 운동 기록/영상/걸음 연동 중 하나가 있으면 인증
  - 마음 그룹은 마음 기록/수면/명상 기록 중 하나가 있으면 인증
- 보상:
  - MVP에서는 경쟁 보상 없음
  - 매일 그룹 인증 시 개인 기존 포인트만 유지
  - 그룹 주간 연속 참여 배지는 UI 배지부터 시작

## 데이터 모델 초안
- `habit_groups/{groupId}`
  - `type`: `diet | exercise | mind`
  - `slug`, `title`, `description`
  - `visibility`: `public | curated | archived`
  - `tags`: 식단/운동 방식 태그
  - `memberCount`, `todayCheckinCount`, `weeklyCheckinCount`
  - `createdAt`, `updatedAt`
- `habit_groups/{groupId}/members/{uid}`
  - `uid`, `displayName`, `photoURL`
  - `joinedAt`, `lastCheckinDate`
  - `role`: `member | moderator | admin`
  - `muted`, `leftAt`
- `habit_group_checkins/{groupId_yyyy-mm-dd_uid}` 또는 `habit_groups/{groupId}/checkins/{date_uid}`
  - `groupId`, `uid`, `date`
  - `source`: `diet | exercise | mind | sleep | steps`
  - `dailyLogId`, `mediaThumbUrl`
  - `comment`, `reactionCount`, `createdAt`
- 기존 `social_challenges`는 신규 생성 중단 후 읽기 전용/히스토리 처리.

## 전환 단계
- 1단계: 설계 확정
  - 기존 친구 챌린지의 삭제 범위와 개인 챌린지 유지 범위 분리
  - 소모임 카테고리와 기본 seeded 그룹 목록 확정
  - 보상은 MVP에서 제외하거나 배지 수준으로 제한
- 2단계: 서버/규칙 기반 만들기
  - `habit_groups`, `members`, `checkins` Firestore rules 추가
  - 그룹 참여/나가기/체크인 callable 또는 클라이언트 쓰기 정책 결정
  - daily log 저장 후 그룹 체크인을 안전하게 생성하는 흐름 설계
- 3단계: UI 교체
  - 대시보드 `친구 챌린지` 카드를 `소모임` 카드로 교체
  - 생성/초대/응답 모달 제거 또는 숨김
  - 프로필 친구 요청 영역은 친구 초대 기능 자체를 유지할지 별도 결정
- 4단계: 기존 데이터 정리
  - `pending` 친구 챌린지는 더 이상 생성되지 않게 차단
  - `active` 챌린지는 만료/정산까지 유지하거나 즉시 종료 정책 선택
  - `settled/cancelled` 데이터는 관리자/히스토리 용도로만 보존
- 5단계: 검증
  - 로그인 사용자가 공개 소모임에 참여할 수 있음
  - 오늘 식단/운동/마음 기록 저장 후 해당 그룹 오늘 인증이 반영됨
  - 친구 관계가 없어도 소모임 참여가 가능함
  - 기존 개인 챌린지와 자산 탭이 깨지지 않음
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`

## 2026-06-01 구현 체크리스트
- [x] 기본 소모임 정의와 기록 인증 판정 helper 추가
- [x] 대시보드 친구 챌린지 카드를 소모임 카드로 교체
- [x] 소모임 찾기/참여/나가기 모달 추가
- [x] 일일 기록 저장 후 가입 소모임 체크인 반영
- [x] 기존 친구 챌린지 신규 생성 차단
- [x] Firestore rules에 소모임 멤버십/체크인 규칙 추가
- [x] PWA 버전 회전
- [x] 테스트와 번들 검증

## 구현 리뷰
- 친구 챌린지 대시보드 표면은 `함께 소모임` 카드로 교체했고, 기존 친구 챌린지 생성/응답 진입점은 소모임 찾기로 우회한다.
- 소모임 멤버십은 `habit_group_members`, 일일 인증은 `habit_group_checkins`에 저장하며, 일일 기록 저장/오프라인 outbox 재전송 성공 후 가입 소모임 체크인을 동기화한다.
- `social_challenges` 신규 생성은 Firestore rules와 `createSocialChallenge` Cloud Function 양쪽에서 차단했다. 기존 active/settled 데이터 정산 코드는 안전한 전환을 위해 남겨 두었다.
- 검증: `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`, `git diff --check`, 로컬 브라우저 smoke QA를 통과했다.

## 열린 결정
- 친구 기능 전체를 없앨지, 친구 초대/응원만 남길지
- 소모임을 사용자가 직접 만들 수 있게 할지, 초기는 운영자가 만든 그룹만 둘지
- 그룹별 피드 공개 범위를 전체 공개로 할지, 멤버 전용으로 할지
- 그룹 보상을 포인트로 줄지, 배지/랭킹/응원 노출만 줄지
