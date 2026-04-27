# 2026-04-27 삼성 인터넷 로그인 회귀 수정

## 목표
- 삼성 인터넷 일반 브라우저 탭에서 Google redirect 로그인 후 첫 화면으로 돌아오는 회귀를 고친다.
- 이전 교훈대로 삼성 인터넷 일반 탭은 popup 흐름을 기본으로 사용하고, redirect는 설치 앱/특수 컨텍스트에만 제한한다.
- 설치 CTA는 브라우저가 native prompt를 제공할 때만 원클릭이 가능하다는 한계를 UI/로직에서 과장하지 않는다.

## 체크리스트
- [x] 현재 로그인 모드 선택 로직 확인
- [x] 삼성 인터넷 일반 탭을 popup 우선으로 되돌리기
- [x] redirect/popup override가 서로 꼬이지 않게 정리
- [x] 관련 테스트 갱신
- [x] `npm test` 실행
- [x] esbuild 번들 검증

## 검증 메모
- 삼성 인터넷 일반 탭은 `popup` 모드로 돌아가고, 설치 앱/standalone에서만 `redirect`를 유지한다.
- 기존 실패 redirect의 pending marker가 남아 있어도 현재 컨텍스트가 popup이면 즉시 정리한다.
- 삼성 인터넷 설치 fallback 문구를 주소창 설치 아이콘의 브라우저 조건부 표시와 맞췄다.
- 캐시 혼선을 피하려고 앱 자산/service worker 버전을 `v168`로 올렸다.
- 검증:
  - `npm test -- --run tests/auth-login-helpers.test.js tests/pwa-only-pivot.test.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
  - `npx esbuild js/pwa-install.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-pwa-install-check.js`
