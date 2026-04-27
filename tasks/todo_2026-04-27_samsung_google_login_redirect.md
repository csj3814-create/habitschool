# 2026-04-27 Samsung Internet Google Login Redirect

## Goal
- 삼성 인터넷에서 구글 로그인 클릭 시 새 탭/Gmail 화면으로 빠지는 문제를 막는다.
- 삼성 인터넷은 일반 브라우저 탭과 설치 앱 모두 Firebase redirect 로그인으로 처리한다.
- 실패 복구용 popup override가 삼성 인터넷에 남아 다시 popup 흐름을 타지 않게 한다.

## Checklist
- [x] 현재 Google 로그인 모드 선택 로직 확인
- [x] 삼성 인터넷 redirect 강제 및 popup fallback 차단
- [x] auth login helper 테스트 갱신
- [x] `npm test` 및 esbuild 검증

## Review
- 원인: 삼성 인터넷 일반 탭에서 Google 로그인에 popup 흐름을 쓰면서 브라우저가 새 탭/외부 Google 계정 화면으로 전환할 수 있었다.
- 수정: 삼성 인터넷 UA는 설치 앱 여부와 상관없이 Firebase redirect 로그인으로 고정했다.
- 재발 방지: 실패 복구용 popup override가 삼성 인터넷에서는 적용되지 않도록 했다.
- 검증: auth login helper 테스트, 전체 `npm test`, esbuild 번들 확인 통과.
