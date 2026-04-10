## 2026-04-10 관제탑 대시보드 지표 정렬

- [x] 대시보드 TOP 5를 포인트+HBT 합산 기준으로 정렬
- [x] 누적 HBT 발행량과 현재 마이닝 레이트를 실제 토큰 통계 기준으로 연결
- [x] 오늘 지급 포인트를 실제 awardedPoints 합계 기준으로 수정
- [x] 자산 탭 TOP 20 helper mismatch와 마이닝 이력 표 가독성 보강
- [x] 테스트와 검증 결과 기록

### 메모

- TOP 20만 합산 정렬로 바꾸면 대시보드 TOP 5와 기준이 갈라져 운영 화면이 혼란스러워진다.
- `누적 HBT 발행`, `마이닝 레이트`, `오늘 지급 포인트`는 Firestore 메타 필드나 단순 체크 개수가 아니라 실제 운영 데이터 기준으로 보여야 한다.
- 비일일 포인트 보상 중 일부는 지급 날짜 필드가 없어 오늘 집계가 완전하지 않을 수 있다. 장기적으로는 포인트 지급 원장 컬렉션이 필요하다.

### 검증

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
- `admin.html` 수정 라인 직접 확인

### 리뷰

- 대시보드 TOP 5와 자산 탭 TOP 20이 같은 합산 기준을 쓰도록 맞췄다.
- 누적 HBT 발행량과 현재 마이닝 레이트는 `getTokenStats` 결과를 사용하도록 정리했다.
- 오늘 지급 포인트는 오늘 일일 기록 실제 포인트 합계와 날짜가 확인 가능한 추가 보상을 합산하도록 보강했다.
- 관제탑 다음 업그레이드 후보는 `포인트 지급 원장 컬렉션`, `TOP20 tbody id 정리`, `500/200 limit 기반 집계 제거`다.
