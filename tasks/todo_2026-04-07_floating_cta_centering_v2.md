# 2026-04-07 Floating CTA Centering v2

- [x] `app-container` 실좌표 기준으로 하단 CTA, 채팅 배너, 설치 배너 위치 계산
- [x] 탭 전환 직후와 `window.load` 시점에 위치 보정 재실행
- [x] `styles.css`, `app.js`, `main.js`, `pwa-install.js`, `sw.js` 캐시 버전 갱신
- [x] localhost 에서 서비스워커 등록 비활성화 및 기존 `habitschool-*` 캐시 삭제
- [x] `npm test`
- [x] `esbuild` 번들 체크
- [x] `node --check js/pwa-install.js`

## Review

- 이전 수정이 화면에 안 보였던 핵심 원인은 로컬 서비스워커와 정적 자산 캐시였다.
- 이번에는 CSS fallback 에만 기대지 않고, 실제 `.app-container` 좌표를 읽어 `submit-bar`, `chat-banner`, `pwa-install-banner`를 직접 배치하도록 수정했다.
- 로컬 개발 환경에서는 SW를 계속 유지할 이유가 적으므로, localhost 에서는 등록을 막고 캐시를 지워 이후 UI 수정이 바로 보이게 했다.
