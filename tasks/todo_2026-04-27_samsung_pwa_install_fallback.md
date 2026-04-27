# 2026-04-27 Samsung Internet PWA Install Fallback

## Goal
- 삼성 인터넷에서 `beforeinstallprompt`가 오지 않는 실기기 증상을 기준으로 설치 UX를 다시 설계한다.
- 불가능한 원클릭 설치를 약속하지 않고, 실제 가능한 설치 경로를 분명히 보여준다.
- Chrome/Edge처럼 native prompt가 가능한 브라우저의 버튼 동작은 유지한다.

## Checklist
- [x] 실기기 증상 반영: 3.5초 후에도 native prompt가 오지 않음
- [x] 브라우저 API 지원 범위 확인
- [x] 삼성 인터넷 전용 fallback UX 수정
- [x] PWA guardrail 테스트 갱신
- [x] `npm test` 및 esbuild 검증

## Review
- 삼성 인터넷은 `beforeinstallprompt`를 기다리지 않도록 변경했다.
- 삼성 인터넷에서는 즉시 설치 안내 모달을 표시하고, Chrome에서 열기 버튼으로 네이티브 설치가 가능한 브라우저로 이동할 수 있게 했다.
- 검증: `npm test -- --run tests/pwa-only-pivot.test.js`, `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`, `npx esbuild js/pwa-install.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-pwa-install-check.js`.
