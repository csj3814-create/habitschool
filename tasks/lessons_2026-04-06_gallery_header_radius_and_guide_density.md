# 2026-04-06 갤러리 헤더 / 가이드 밀도 lessons

- `HABIT FEED`처럼 접힘 상태가 있는 헤더는 모바일에서 `width: 100%`, `box-sizing: border-box`, `overflow: hidden`, 고정 `border-radius`를 같이 줘야 모서리가 네모처럼 깨지지 않는다.
- 얇은 보조 UI는 `min-height`만 줄이면 안 되고 `padding`, `font-size`, `topline min-height`를 같이 줄여야 실제 체감 높이가 내려간다.
- 업로드 CTA보다 존재감이 크면 사용자가 헷갈리니, `가이드/펼치기` 바는 항상 업로드 바보다 한 단계 약하게 유지한다.
