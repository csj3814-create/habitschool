# 2026-04-07 staging 런타임 스모크 오류 수정

## 목표
- staging 첫 진입에서 보인 CSP 콘솔 오류를 제거한다.
- 공유 미리보기 이미지의 초기 `onerror` 전역 함수 오류를 제거한다.
- 수정 후 staging에 다시 반영하고 스모크 검증을 재실행한다.

## 작업 계획
- [ ] `firebase.json`의 Hosting CSP 설정과 외부 스크립트 허용 범위를 점검한다.
- [ ] `index.html`과 `js/app.js`의 공유 미리보기 초기화 순서를 추적한다.
- [ ] 오류를 최소 범위로 수정하고 `npm test`, esbuild 번들 체크로 회귀를 확인한다.
- [ ] staging hosting에 재배포하고 브라우저 스모크 검증을 다시 수행한다.

## 리뷰
- 진행 후 작성
