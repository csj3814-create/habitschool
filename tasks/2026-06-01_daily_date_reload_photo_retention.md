# 2026-06-01 새 날짜 리로드와 식단 사진 보존

> **상태**: 진행 중

## 작업
- [x] 기존 날짜 전환 가드와 식단 사진 저장 흐름 추적
- [x] 오래 열린 앱/복원된 앱이 KST 오늘 날짜로 정확히 전환되도록 보강
- [x] 새 날짜 첫 식단 사진 저장 후 같은 날 추가 사진 저장 시 앞 사진이 유지되도록 회귀 테스트 추가
- [x] `npm test` 실행
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 실행

## 가설
- 브라우저/PWA가 전날 DOM 상태를 복원한 뒤 첫 식단 사진 저장이 실행될 때, 화면 날짜와 내부 선택 날짜 또는 현재 daily log 캐시가 일시적으로 어긋나면 잘못된 날짜 문서나 stale snapshot 기준으로 저장될 수 있다.

## 검증 메모
- `npm test` 통과: 43 files, 301 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 통과.
- Browser 확인: `http://127.0.0.1:5177/` 렌더 성공, title `해빛스쿨 - 즐겁게 좋은 습관 만들기`, `selected-date` value/default/max 모두 `2026-06-01`, console warning/error 0건.
- 상호작용 확인: 게스트 갤러리 버튼 클릭 시 안내 모달 표시.

## 리뷰
- 기존 보정은 reload/BFCache 중심이라, 밤새 열린 PWA가 foreground로 돌아오거나 사용자가 바로 사진 input을 누르는 흐름을 놓칠 수 있었다.
- `focus`, `visibilitychange`, 파일 input click, 사진 return, 저장 직전까지 날짜 보정 지점을 확장했다.
- 사용자가 직접 과거 날짜를 선택한 경우는 자동 오늘 전환 대상에서 제외했다.
- 자동으로 새 날짜로 넘어간 직후에는 전날 DOM preview URL이나 분석 결과를 새 날짜 저장 데이터로 복사하지 않도록 막았다.
- PWA 캐시 회피를 위해 런타임 자산 버전을 `196`으로 올렸다.
