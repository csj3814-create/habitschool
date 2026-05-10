# 2026-05-10 삼성인터넷 카메라 복귀 로그인 화면 방지

## Checklist
- [x] 삼성인터넷 카메라 촬영 경로에서 기존 media picker/auth 복구 가드 확인
- [x] 카메라 앱 전환 중 페이지 reload/process restore가 있어도 복구 표식이 남도록 저장소 기반 marker 추가
- [x] 카메라 복귀 직후 Firebase Auth `null` 이벤트가 로그인 모달을 즉시 띄우지 않도록 grace window 보강
- [x] 갤러리 선택과 기존 식단 미리보기 보존 동작 회귀 방지 테스트 추가
- [x] `npm test` 실행
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 실행

## Review
- Added persistent camera/file picker recovery marker storage so Samsung Internet camera handoff survives page restore/reload.
- Converted camera-open grace to a shorter post-return auth recovery grace and hid the default login modal while recovery is active.
- Added source-level regression checks for persisted camera recovery and auth shell hiding.
- Verification: `npm test` passed 41 files / 285 tests, and esbuild browser bundle check passed.
