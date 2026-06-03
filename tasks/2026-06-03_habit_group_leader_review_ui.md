# 2026-06-03 소모임 모임장 컨펌 화면

## 목표
- 모임장 계정이 확인 대기 중인 소모임 기록을 대시보드에서 바로 승인/반려할 수 있게 한다.
- 일반 회원 소모임 카드에서 `오늘 제출 · 확인 대기` 문구를 제거해 중복 표시를 줄인다.
- 변경 후 PWA 버전을 갱신하고 테스트로 동작을 확인한다.

## 체크리스트
- [x] 기존 승인 callable과 Firestore 읽기 권한 확인
- [x] 모임장용 확인 대기 목록 조회/캐시 구현
- [x] 모임장용 승인/반려 UI 및 액션 연결
- [x] 회원 카드의 중복 대기 문구 제거
- [x] Firestore 인덱스 추가
- [x] PWA 버전 갱신
- [x] 테스트와 번들 검증 실행

## 검증 계획
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- 관련 Vitest 파일 집중 실행
- `node --check functions/runtime.js`
- `git diff --check`

## 리뷰
- `js/app-core.js`에서 멤버십 role을 보존하고 모임장인 그룹의 `pending` checkin을 조회해 `모임장 컨펌` 섹션으로 렌더링한다.
- 승인/반려 버튼은 기존 `reviewHabitGroupCheckin` callable을 호출하고, 성공 후 소모임 캐시와 대시보드를 갱신한다.
- 일반 회원 카드에서는 `오늘 제출 · 확인 대기` 문구를 제거하고, 진행도 한 줄과 `대기` 버튼만 남긴다.
- `firestore.indexes.json`에 `habit_group_checkins(groupId, reviewStatus)` 인덱스를 추가했다.
- 검증: 집중 Vitest, 전체 `npm test`, esbuild 번들, `node --check functions/runtime.js`, `git diff --check` 통과.
- Playwright 렌더 스모크는 로컬 브라우저 바이너리가 없어 실행하지 못했다. 새 브라우저 설치는 사용자 허가 없이 진행하지 않았다.
