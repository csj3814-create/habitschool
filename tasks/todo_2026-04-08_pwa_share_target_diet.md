# 2026-04-08 PWA share target for diet intake

## Goal
- Let Android/Chromium users send meal photos to 해빛스쿨 from the system share sheet.
- Reuse the existing diet upload flow so shared photos land in the next empty meal slots without a separate UI path.
- Keep the implementation compatible with Firebase Hosting by routing POST share data through the service worker.

## Plan
- [x] Audit the current diet upload path and deep-link handling.
- [x] Add manifest share target metadata and service worker POST handling for shared images.
- [x] Restore shared images into the app and feed them through the existing diet upload assignment flow.
- [x] Run verification and document how to test the feature.

## Review
- `manifest.json`에 식단 이미지 전용 `share_target`을 추가해 Android/Chromium 설치 앱이 시스템 공유 시트에서 해빛스쿨을 노출할 수 있게 했다.
- `sw.js`는 `/share-target` POST를 받아 공유된 이미지들을 전용 Cache Storage에 임시 저장하고, 식단 탭 deep-link로 303 리디렉션한다.
- `js/app.js`는 deep-link 진입 시 공유 이미지 캐시를 읽어 `smartUpload` 흐름에 태워 다음 빈 식단 슬롯들에 자동 배치한다.
- 공유 사진 반영 전 현재 날짜 로그를 다시 로드해, 기존 기록 복원과 공유 업로드가 서로 덮어쓰지 않도록 순서를 맞췄다.
- Verification:
  - `node --check sw.js`
  - `node --check js/pwa-install.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
