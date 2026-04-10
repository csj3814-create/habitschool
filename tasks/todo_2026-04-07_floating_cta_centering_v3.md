# 2026-04-07 Floating CTA Centering v3

- [x] CTA/설치 배너 정렬 기준 재점검
- [x] 하단 CTA, 단톡방 배너, 설치 배너를 넓은 고정 바로 통일
- [x] JS는 중앙 정렬 기본값만 적용하도록 단순화
- [x] `styles.css`, `app.js`, `index.html`, `pwa-install.js`, `sw.js` 버전 갱신
- [x] `npm test`
- [x] `esbuild` 번들 체크
- [x] `node --check js/pwa-install.js`

## Review

- 기존 방식은 정렬 좌표만 맞추려다 보니 폭이 좁은 CTA가 계속 왼쪽으로 치우쳐 보였다.
- 이번에는 떠 있는 바 전체 폭을 키우고, 뷰포트 기준 중앙 정렬로 통일해 시각적인 중심선을 맞췄다.
- 로컬에선 캐시 영향이 남기 쉬워서, 버전 갱신 후 강력 새로고침으로 실제 자산 반영을 확인해야 한다.
