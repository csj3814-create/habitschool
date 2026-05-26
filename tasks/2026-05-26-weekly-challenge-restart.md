# 2026-05-26 챌린지 완료 당일 재시작 보정

> **상태**: 완료

## 목표
- 챌린지 보상 수령 직후 자산 탭이 서버 상태를 다시 읽어 새 챌린지를 바로 시작할 수 있게 한다.
- 완료 당일 같은 tier 챌린지를 다시 시작하면 완료 당일은 대기일로 두고, 실제 시작일은 다음날로 기록한다.
- 앱 지갑 준비가 늦을 때 즉시 실패하지 않고 준비 중 안내와 짧은 재시도를 거친다.
- PWA 캐시 버전을 갱신해 모바일에서 수정본이 바로 반영되게 한다.

## 체크리스트
- [x] `claimChallengeReward`가 tier별 정산일을 user 문서에 기록한다.
- [x] `startChallenge`가 같은 날 재시작을 다음날 시작으로 생성한다.
- [x] 클라이언트 진행 갱신이 챌린지 기간 밖의 오늘 기록을 반영하지 않는다.
- [x] 보상 수령/챌린지 시작 후 자산 탭이 서버 기준으로 갱신된다.
- [x] 앱 지갑 준비 지연 시 재시도와 중복 탭 방지가 동작한다.
- [x] 테스트와 번들 검증을 통과한다.

## 결정 사항
- 완료 당일은 새 챌린지의 0일차/대기일로만 취급하고, Firestore `startDate`는 다음날로 저장한다.
- 이 규칙은 3일, 7일, 30일 모든 챌린지에 tier별로 적용한다.
- 과거 완료 기록은 마이그레이션하지 않고 배포 이후 보상 수령부터 보호한다.

## 검증
- `npx vitest run tests/progressive-loading.test.js tests/challenge-qualification.test.js tests/challenge-failure-guard.test.js tests/challenge-restart-flow.test.js tests/pwa-versioning.test.js` 통과 (`21 tests`).
- `npm test` 통과 (`43 files`, `300 tests`).
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` 통과.
- `node --check functions/runtime.js` 통과.
- `git diff --check` 통과. Git의 CRLF 경고만 출력됐고 whitespace error는 없었다.
