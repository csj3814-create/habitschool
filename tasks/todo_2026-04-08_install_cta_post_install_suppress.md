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
- `beforeinstallprompt`가 다시 오면 설치 가능 상태로 되돌려 CTA가 자연스럽게 복귀하도록 했다.
- 하단 helper 문구는 더 짧은 한 줄 위주 문구로 바꿨다.
- Verification:
  - `node --check js/pwa-install.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
