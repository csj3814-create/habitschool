# 2026-04-08 installed PWA notification copy check

## Goal
- Verify whether the installed PWA should still show a blocked-notification state when browser/site notification permission is denied.
- If the state is correct, adjust copy so it matches an installed app context.
- If the state is wrong, fix the permission detection path.

## Plan
- [x] Inspect notification permission card logic and installed-app state detection.
- [x] Verify expected behavior using official browser/platform docs.
- [x] Narrow the copy/state fix and run verification.

## Review
- Installed Android PWA에서도 차단 상태 자체는 맞을 수 있다. 다만 카드가 `브라우저에서 차단`이라고만 말하면 설치 앱 문맥에선 부정확하게 느껴진다.
- 설치 앱에서는 상태 문구를 `이 기기에서 해빛스쿨 알림이 차단되어 있어요.`로 바꾸고, 안내 모달도 `브라우저 탭으로 열어 권한을 바꾸는 경로`를 보여주도록 분리했다.
- iPhone/iPad 설치 앱 가이드는 기존처럼 설정 앱 경로를 유지한다.
- Verification:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `node --check js/auth.js`는 이 파일이 브라우저 ESM 모듈이라 CommonJS check 경로에서 형식상 실패했고, 실제 안정성은 esbuild 번들 체크로 확인했다.
