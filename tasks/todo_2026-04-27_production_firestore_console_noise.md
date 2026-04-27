# 2026-04-27 Production Firestore Console Noise

## Goal
- 본서버 자산 탭 콘솔에 쌓이는 Firestore offline/error와 asset timeout 경고의 원인을 확인한다.
- 실제 사용자 장애와 개발자 콘솔 노이즈를 분리한다.
- 네트워크가 일시적으로 늦거나 Firestore가 offline으로 내려가도 화면/로그가 과하게 무너지지 않게 개선한다.

## Checklist
- [x] 콘솔 로그 발생 위치 확인
- [x] Firestore server-only 호출 영향 판단
- [x] 필요 시 fallback/log level 조정
- [x] 테스트와 번들 검증

## Review
- 원인은 Firestore backend 연결이 10초 안에 붙지 않으면서, 자산 탭의 선택적 히스토리 쿼리들이 각각 timeout fallback 로그를 남긴 것이다.
- Firestore 초기화를 auto long-polling으로 바꿔 WebChannel/streaming이 불안정한 네트워크에서 연결 성공률을 높였다.
- 자산 탭의 선택적 timeout/offline 로그는 rate-limit된 `console.info`로 낮춰 콘솔 경고가 폭증하지 않게 했다.
- 검증: `npm test -- --run tests/firestore-reconnect.test.js tests/progressive-loading.test.js`, `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`.
