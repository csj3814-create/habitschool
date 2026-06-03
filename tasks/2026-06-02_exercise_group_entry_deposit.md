# 2026-06-02 운동 소모임 참여 보증금

## 목표
- 운동 소모임 참여 시 200P를 보증금처럼 차감한다.
- 소모임 100일 완료 보상은 3,000P로 상향한다.
- 기존 2개 가입 제한과 모임장 승인 구조는 유지한다.

## 체크리스트
- [x] 현재 가입/보상/화면 흐름 확인
- [x] 서버 가입 트랜잭션에서 포인트 부족과 중복 차감 방지
- [x] 클라이언트 상수와 참여 버튼 문구 갱신
- [x] 테스트 갱신 및 필수 검증 실행

## 검증 계획
- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- 포인트/문구 관련 소스 스캔

## 결과
- 참여 보증금은 `200P`, 100일 완료 보상은 `3,000P`로 반영했다.
- `joinHabitGroup` 트랜잭션에서 신규 참여 시 포인트 부족을 차단하고, 차감과 포인트 거래기록 생성을 같은 트랜잭션으로 처리한다.
- 체크인 규칙과 서버 트리거 모두 활성 멤버십이 없는 제출을 보상 진행도에 반영하지 않도록 막았다.
- 대시보드/소모임 모달은 `200P 참여`, `100일 3,000P` 기준으로 짧게 표시한다.

## 검증 결과
- `npx vitest run tests/habit-groups.test.js tests/habit-groups-transition.test.js tests/pwa-versioning.test.js` 통과
- `npm test` 통과: 45 files, 314 tests
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` 통과
- `node --check functions/runtime.js` 통과
- `git diff --check` 통과: CRLF 안내만 출력
- 로컬 브라우저 스모크 통과: `v200` 자산, 새 정책 문구, 제거 문구 부재, 콘솔 오류/경고 없음 확인
- 브라우저 스크린샷 캡처는 CDP `Page.captureScreenshot` 타임아웃으로 실패
