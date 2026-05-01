# 2026-05-01 Closeout docs and changelog

## Goal
- 정리되지 않은 오늘 작업 내용을 하나로 묶어 문서화한다.
- 사용자에게 보이는 `changelog.html` 최신 항목을 정상 한글로 추가한다.
- 문서 정리 후 스테이징에 배포한다.

## Checklist
- [x] 오늘 작업 문서와 커밋 흐름 확인
- [x] `changelog.html` 최신 업데이트 항목 추가
- [x] 기존 changelog 깨진 한글 정리
- [x] 검증 실행
- [x] 커밋, 푸시, 스테이징 배포

## Summary
- 오늘 주요 작업은 콘솔 오류/Firestore 재시도 루프 완화, 보조 데이터 로딩 안정화, 한글 깨짐 회귀 검사, PWA v173 배포, 관제탑 보상마켓 rules 반영이다.
- `changelog.html`은 v1.0.11 항목을 추가하면서 기존 최신 항목들도 사용자 체감 중심의 정상 한글 문구로 정리했다.
- 검증 통과: `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`, `git diff --check`.
- 스테이징 배포 대상은 정리된 `changelog.html`과 오늘 작업 문서다.
