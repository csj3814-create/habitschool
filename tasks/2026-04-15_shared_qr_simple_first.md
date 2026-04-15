# 2026-04-15 공유 QR 첫 진입 심플형 우선
> **상태**: 완료

## 작업
- [x] `tasks/lessons.md` 관련 패턴 검토
- [x] 공유 QR 진입 시 최초 앱 타입 결정 경로 추적
- [x] 공유 QR 최초 진입 기본값을 기본형 -> 심플형으로 조정
- [x] 테스트: `npm test`
- [x] 번들 검증: `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`

## 메모

- 목표는 "공유 QR로 처음 들어온 경우"의 초기 노출만 심플형으로 바꾸는 것이다.
- 일반 진입, 저장된 사용자 설정, 다른 딥링크 흐름은 그대로 유지하는 쪽으로 본다.

## 결과

- 프로필/초대 모달의 QR은 이제 `ref` 파라미터를 유지한 채 `/simple` 경로를 가리킨다.
- 텍스트 초대 링크와 일반 공유 흐름은 그대로 두고, QR 스캔 첫 진입만 심플형으로 유도하도록 범위를 제한했다.
- 앱 모드 URL 헬퍼에 검색 파라미터를 안전하게 싣는 기능을 추가하고 관련 테스트를 보강했다.

## 검증

- `npm test` 통과 (`146 passed`)
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 통과

## 리뷰

- QR 전용 진입 경로만 바꿔 기존 링크 공유/복사 행동을 건드리지 않도록 영향 범위를 좁혔다.
