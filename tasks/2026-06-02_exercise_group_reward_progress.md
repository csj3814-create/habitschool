# 2026-06-02 운동 소모임 보상 진행도 구현

## 목표
- 운동 소모임을 4개 파일럿 그룹으로 제한한다.
- 사용자는 동시에 최대 2개 소모임까지 참여할 수 있다.
- 보상 진행도는 `groupId + uid` 단위로 따로 관리한다.
- 같은 날짜에 가입한 2개 소모임 조건을 모두 만족하면 각 소모임이 각각 1회씩 오른다.
- 100회 달성 보상은 소모임별 2,000P이며, 한 사용자는 파일럿에서 최대 2개 소모임 보상을 받을 수 있다.

## 구현 체크리스트
- [x] 운동 4개 기본 소모임으로 전환
- [x] 가입/탈퇴를 서버 callable로 전환하고 2개 제한 적용
- [x] 체크인에 `pending/approved/rejected` 리뷰 상태와 운동 기록 스냅샷 저장
- [x] `exercise_group_reward_progress/{groupId}_{uid}` 진행도 서버 집계 추가
- [x] 모임장/관리자 승인 callable 추가
- [x] Firestore rules를 운동 전용/서버 집계 구조에 맞게 조정
- [x] 대시보드/모달에 소모임별 진행도 문구 표시
- [x] PWA 버전 회전
- [x] 테스트와 번들 검증

## 검증 예정
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- `git diff --check`
- Firestore emulator rules load
- Browser smoke QA

## 리뷰
- `DEFAULT_HABIT_GROUPS`를 만보 걷기, 홈트 인증방, 헬스장 출석, 러닝 클럽 4개 운동 소모임으로 제한했다.
- 가입/탈퇴는 `joinHabitGroup`, `leaveHabitGroup` callable로 이동했고 서버 transaction에서 활성 운동 소모임 2개 제한을 적용한다.
- 체크인은 `habit_group_checkins/{groupId}_{date}_{uid}`에 `pending`으로 제출되며, 운동/걸음 스냅샷과 썸네일을 포함한다.
- `onHabitGroupCheckinWritten`가 `exercise_group_reward_progress/{groupId}_{uid}`를 집계한다. 같은 날짜라도 groupId가 다르면 각 progress가 1회씩 오른다.
- 100회 승인 시 deterministic `blockchain_transactions/exercise_group_reward_{groupId}_{uid}` 문서로 2,000P를 1회만 지급한다.
- `reviewHabitGroupCheckin`과 `transferHabitGroupLeader` callable을 추가했다.
- 검증: `npm test`, 필수 esbuild 번들, `git diff --check`, Firestore emulator rules load, Browser DOM/console/click smoke 통과. Browser screenshot은 CDP `Page.captureScreenshot` timeout으로 캡처하지 못했다.
