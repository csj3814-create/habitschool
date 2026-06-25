# 2026-06-25 영어 화면 한글 잔존 수정

## Checklist
- [x] Exercise/Mind 화면 한글 잔존 문구 수정
- [x] 영어 화면 검증
- [x] 결과 기록

## Review
- 로컬 `/en#exercise` DOM 검증 결과 Exercise/Mind 한글 잔존 0개(허용: `한국어` 전환 버튼).
- `npm run check:en`, esbuild 번들 검사, `npm test -- tests/korean-text-integrity.test.js`, `git diff --check` 통과.
