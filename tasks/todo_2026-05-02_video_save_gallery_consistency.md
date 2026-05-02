# 2026-05-02 영상 저장/갤러리 반영 일관성

## 목표
- 영상 업로드가 실제 저장됐는데도 `저장 중 오류`로 보이는 원인을 분리한다.
- 저장 성공과 갤러리/공유 피드 후속 반영을 나눠 부분 실패가 사용자에게 실패로 보이지 않게 한다.
- 갤러리가 내 자료만 먼저 보이다가 늦게 전체 자료가 나오는 경로를 확인하고, 가능한 fallback/재시도를 개선한다.

## 체크리스트
- [x] 운동 영상 저장 경로와 후처리 오류 경로 확인
- [x] 갤러리 조회/캐시/친구 포함 로딩 경로 확인
- [x] 성공 저장 후 후속 갤러리 반영 실패를 별도 재시도로 분리
- [x] 테스트와 번들 검증 실행

## 검증
- 완료: `npm test`
- 완료: `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
- 완료: `git diff --check`

## 리뷰
- 저장 본문이 이미 ACK 된 뒤 발생한 후처리/갤러리 갱신 오류는 하드 실패 토스트로 처리하지 않고, 로컬 캐시 반영 후 갤러리 재확인으로 넘긴다.
- Firestore 로그인 쿼리가 `metadata.fromCache` 결과를 반환하면 내 캐시 자료만 전체 피드로 확정하지 않는다. 우선 렌더는 하되 REST/서버 재조회와 retry로 권위 결과를 따라오게 한다.
- Firestore SDK transient internal assertion도 연결 지연 계열로 분류해 저장/미디어 patch가 오프라인 큐 또는 재시도 경로를 타게 한다.
