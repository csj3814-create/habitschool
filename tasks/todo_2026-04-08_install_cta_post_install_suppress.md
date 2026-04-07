# 2026-04-08 install CTA post-install suppression

## Goal
- Hide the dashboard install CTA when the PWA is already installed on supported browsers, even if the user opens the site in a normal browser tab.
- Keep a safe fallback for unsupported browsers.
- Shorten helper copy so it stays on one line on narrow mobile widths.

## Plan
- [x] Audit current install CTA visibility logic and installation detection hooks.
- [x] Add installed-app detection using supported browser APIs plus a lightweight fallback signal from appinstalled.
- [x] Shorten install helper copy and keep manual-install guidance intact.
- [x] Run verification and document the resulting behavior.

## Review
- Chromium 계열에서는 `appinstalled` 기억값과 `navigator.getInstalledRelatedApps()` 결과를 함께 사용해, 설치 후 브라우저 탭에서도 설치 CTA를 숨기도록 조정했다.
- 설치 감지는 manifest URL(`/manifest.json`)까지 함께 대조해 브라우저별 installed-related-app 결과 차이를 줄였다.
- 이미 열린 브라우저 탭도 설치 상태를 바로 반영하도록 `storage` 동기화를 추가했다.
- `beforeinstallprompt`가 다시 와도 설치 기억값을 즉시 지우지 않고, 실제 설치 감지를 다시 확인한 뒤 CTA를 갱신하도록 바꿨다.
- 하단 helper 문구는 더 짧은 한 줄 위주 문구로 바꿨다.
- Verification:
  - `node --check js/pwa-install.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
