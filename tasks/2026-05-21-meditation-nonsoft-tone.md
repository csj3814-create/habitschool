# 2026-05-21 호흡 non-soft 톤 볼륨 조정

> **상태**: 완료

## 목표
- 4번째 사이클부터 쓰이는 non-soft 호흡 알림음의 phase volume을 `1.2`로 올린다.
- peak limit은 `0.8`로 유지한다.
- 음성 안내 중 함께 쓰이는 soft 톤은 기존 `0.12/0.13` 값을 유지한다.
- 런타임 JS 변경이므로 PWA 자산 버전을 갱신한다.

## 체크리스트
- [x] `inhale`, `hold`, `exhale` non-soft volume을 `1.2`로 변경
- [x] soft 톤 값 유지 확인
- [x] PWA 버전 갱신
- [x] 관련 테스트 갱신 및 검증

## 검증
- `npx vitest run tests/meditation-guide.test.js tests/pwa-versioning.test.js` 통과
- `npm test` 통과
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 통과
- `git diff --check` 통과
- 활성 앱 파일에서 `v=191`, `habitschool-v191`, 이전 non-soft `0.8` 볼륨 참조 없음
