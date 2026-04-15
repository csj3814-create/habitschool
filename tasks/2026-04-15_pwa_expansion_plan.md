# 2026-04-15 PWA 확장 1-4
> 상태: 구현 및 검증 완료

## 작업
- [x] 현재 PWA 구현 상태 점검
- [x] 공유 타깃 B안 구현
- [x] 오프라인 아웃박스 기반 임시저장/재시도 구현
- [x] 설치 경험 강화
- [x] PWA launch/entry 개선
- [x] 테스트 `npm test`
- [x] 번들 검증 `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- [x] 함수 문법 검증 `node --check functions/index.js`

## 구현 메모

- 공유 타깃은 식단 전용 자동 배치에서 `식단 / 운동 / 수면` 선택 시트로 확장했다.
- 분류는 `classifySharedHealthImage` Cloud Function으로 분리했고, `gemini-2.5-flash` + `thinkingBudget: 0`만 사용한다.
- AI 분류는 비차단 보조 기능으로만 동작한다.
- 확신이 높고 응답이 빠를 때만 자동 라우팅하고, 그렇지 않으면 사용자가 직접 누를 수 있게 유지했다.
- 운동은 일반 운동 이미지와 걸음수 앱 캡처를 구분해, 캡처로 보이면 기존 걸음수 스크린샷 분석 흐름으로 연결한다.
- 저장 실패 시 현재 기록 payload와 아직 서버에 없는 파일을 로컬 아웃박스에 보관하고, 로그인 상태에서 온라인 복귀하면 자동 재전송한다.
- 설치 경험 강화를 위해 `manifest.json`에 `screenshots`와 `launch_handler`를 추가했다.
- 서비스워커는 공유 인박스 경로를 일반화했고, 예전 `diet` 경로도 읽을 수 있게 유지했다.

## 리뷰

- `npm test`: 148 passed
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`: 통과
- `node --check functions/index.js`: 통과

## 남은 확인 포인트

- 실제 Android 설치형 PWA에서 공유 시트 진입 후 자동 분류/수동 선택 UX 확인
- 오프라인 저장 후 온라인 복귀 시 자동 재전송 토스트와 갤러리 반영 확인
- 새 Cloud Function 배포 후 실행 로그 확인
