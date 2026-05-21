# 2026-05-21 호흡 내쉼 음성 안내 발음 보정

## Checklist
- [x] `tasks/lessons.md` 관련 패턴 검토
- [x] 내쉼 음성 안내 문구를 TTS 발음이 덜 된소리로 들리도록 조정
- [x] 호흡 안내 테스트 기대값 갱신
- [x] PWA 캐시 버전 갱신
- [x] 검증 실행
- [x] 결과 기록

## Notes
- 사용자 피드백: "내쉬세요" 멘트가 "내쉬쎄요"처럼 들림.
- 조치 방향: 음량/톤 설정은 유지하고, 내쉼 `voiceCue` 문장만 `숨을 ... 내쉬어 주세요` 형태로 풀어 TTS 발음을 안정화한다.

## Verification
- `npx vitest run tests/meditation-guide.test.js tests/pwa-versioning.test.js` 통과 (2 files, 5 tests).
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js` 통과.
- `git diff --check` 통과.
- `npm test` 통과 (41 files, 296 tests).
