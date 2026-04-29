# 2026-04-29 쿠폰 유효기간 남은 일수 표시

## 목표
- 쿠폰 보관함 유효기간 문구를 `유효기간 YYYY. M. D.까지`에서 `유효기간 YYYY. M. D. (N일 남음)`으로 바꾼다.
- 콘솔에 보이는 Firestore WebChannel 로그가 기능 장애인지 확인한다.
- 검증 후 스테이징까지 배포한다.

## 체크리스트
- [x] 관련 교훈과 현재 상태 확인
- [x] 쿠폰 보관함 유효기간 렌더링 수정
- [x] 테스트/번들 검증
- [x] 커밋/푸시와 스테이징 배포
- [x] 결과 기록

## 리뷰
- 쿠폰 보관함의 유효기간 라벨을 `유효기간 YYYY. M. D. (N일 남음)` 형태로 바꿨다.
- 남은 일수는 한국시간 날짜 기준으로 계산해 `2026-04-29`에 `2026-05-29` 만료 쿠폰이 `30일 남음`으로 보이게 했다.
- 화면에 보인 Firestore `ERR_HTTP2_PROTOCOL_ERROR 200 (OK)`는 Firestore listen/WebChannel 재연결성 로그로, 데이터가 정상 표시되는 경우 기능 실패로 보지 않는다. 반복되며 로딩 실패/데이터 누락이 동반되면 별도 장애로 본다.
- 검증: `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`, `git diff --check` 통과.
- 커밋 `6d89040`을 `origin/main`에 푸시했고, `https://habitschool-staging.web.app` 스테이징 배포를 완료했다. 이번 변경은 프론트 UI 변경이라 Functions는 변경 없음으로 스킵되고 Hosting release가 반영됐다.
