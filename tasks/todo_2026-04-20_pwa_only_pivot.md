# 2026-04-20 PWA-only Pivot

> **상태**: 완료

## 작업
- [x] 웹 사용자 경로에서 Health Connect CTA와 관련 문구 제거
- [x] 웹/PWA 설치 흐름만 남기고 APK 직접 배포 노출 제거
- [x] 관련 설치/운영 문서와 작업 메모 정리
- [x] `npm test`, `esbuild` 번들 검증 실행

## 메모

- 사용자 결정:
  - Google Play 배포는 보류
  - 직접 APK 배포는 접근성 저하로 사용하지 않음
  - 웹 + PWA 설치만 운영
  - Health Connect 코드는 삭제하지 않고, 전략 전환 시 다시 살릴 수 있게 dormant 상태로 보관

## 리뷰

- `index.html`, `js/app.js`, `js/pwa-install.js`에서 웹 사용자에게 보이는 Health Connect CTA와 네이티브 앱 설치 문구를 숨기고 PWA 중심 복사로 정리했다.
- `firebase.json`에서 APK 준비 predeploy를 제거하고 `android/**`, `install/**`, `scripts/**`를 호스팅 ignore에 추가해 직접 APK 다운로드 노출을 차단했다.
- Health Connect 코드는 삭제하지 않고 `ENABLE_HEALTH_CONNECT_STEP_IMPORT = false`로 dormant 상태를 유지해, 향후 조직 계정/하이브리드 전략 복귀 시 다시 살릴 수 있게 했다.
- 검증:
  - `npm test` -> `181 passed`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
