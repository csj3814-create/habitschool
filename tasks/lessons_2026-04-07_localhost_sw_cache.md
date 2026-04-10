# 2026-04-07 Localhost SW Cache Lessons

- 로컬 UI 수정이 "전혀 안 바뀐다"면 레이아웃 코드보다 먼저 localhost 서비스워커와 정적 자산 캐시를 의심할 것.
- `styles.css`나 주요 JS를 바꿨는데도 예전 콘솔 에러가 그대로 보이면, HTML/JS/CSS가 섞여 로드되고 있을 가능성이 높다.
- localhost 개발 환경에서는 서비스워커를 유지하지 말고, 등록을 해제하고 `habitschool-*` 캐시도 같이 비우는 편이 안전하다.
- 하단 고정 바는 CSS만으로 맞추는 것보다 `.app-container` 실좌표를 읽어 직접 배치하는 쪽이 브라우저 도킹/폭 변화에 더 안정적이다.
