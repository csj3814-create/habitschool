# 2026-04-27 PWA Install CTA Samsung Internet

## Goal
- 삼성 인터넷에서 하단 CTA가 가능한 경우 네이티브 PWA 설치 프롬프트를 띄우도록 보강한다.
- 사용자 노출 문구를 `홈 화면에 앱 설치`로 정리한다.
- 브라우저가 설치 프롬프트를 제공하지 않는 경우에만 짧은 수동 안내를 보여준다.

## Checklist
- [x] 현재 PWA 설치 CTA와 알림 설치 요구 문구 위치 확인
- [x] 삼성 인터넷 설치 프롬프트 대기 시간을 별도로 보강
- [x] CTA/fallback 문구를 `홈 화면에 앱 설치` 중심으로 갱신
- [x] PWA guardrail 테스트 업데이트
- [x] `npm test` 및 esbuild 번들 검증

## Review
- `홈 화면에 추가` CTA를 `홈 화면에 앱 설치`로 교체했다.
- 삼성 인터넷 UA에서는 네이티브 `beforeinstallprompt` 대기 시간을 3.5초로 늘려 수동 안내로 너무 빨리 빠지는 문제를 줄였다.
- 브라우저가 네이티브 설치 이벤트를 제공하지 않는 경우에는 짧은 수동 안내로 fallback한다.
- 검증: PWA 관련 테스트, 전체 `npm test`, esbuild 번들 확인 통과.
