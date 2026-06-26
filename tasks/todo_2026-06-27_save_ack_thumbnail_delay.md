# 2026-06-27 저장 확인 지연 및 식단 썸네일 반영 조사

> 상태: 진행 중

## 목표

- 저장 버튼을 눌렀을 때 한 번에 저장 완료로 보이지 않고 `저장 확인이 지연되어 보관함에 백업했어요` 토스트가 뜨는 원인을 찾는다.
- 식단 사진이 선택 직후 썸네일로 보이지 않다가 새로고침 후 보이는 원인을 저장/미리보기/복원 흐름에서 확인한다.
- 근본 원인이 확인되면 최소 수정하고, 저장 ACK와 미디어 반영을 검증한다.

## 작업

- [x] `tasks/lessons.md`에서 관련 저장/미디어 패턴 검토
- [x] 저장 버튼과 Firestore ACK timeout, offline outbox fallback 분기 추적
- [x] 식단 사진 선택/업로드/저장/복원 경로의 URL 및 썸네일 상태 비교
- [x] 필요한 코드 수정
- [x] `npm test` 실행
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 실행
- [x] 결과와 남은 리스크 정리

## 현재 가설

- 저장 ACK 대기 시간이 실제 모바일 네트워크/Firestore 응답보다 짧거나, ACK를 기다리는 promise가 후속 UI/캐시 작업과 섞여 timeout fallback으로 빠질 수 있다.
- 식단 사진은 선택 직후 로컬 preview와 선업로드 Storage URL이 분리되어 있어, DOM의 preview 상태가 저장 직후 UI 갱신에 반영되지 않고 reload 복원에서만 다시 그려질 수 있다.

## 결과

- 원인 1: 본문 `daily_logs` 저장 ACK timeout이 5초라 모바일/Firestore 응답이 조금만 늦어도 online 상태에서 `deadline-exceeded`로 분류되고, offline outbox 백업 토스트가 뜰 수 있었다.
- 원인 2: 식단/수면 사진은 선택 즉시 선업로드를 시작하지만, 저장 데이터 생성 시점에 원본 Storage URL이 아직 없으면 기존 저장 URL 또는 preview fallback으로 저장하고 새 사진은 background patch/outbox에 맡겼다. 그래서 새로고침 후에는 백그라운드 반영된 사진이 보이지만 저장 직후에는 새 썸네일 반영이 늦을 수 있었다.
- 수정: primary save timeout을 12초 상수로 분리했고, 식단 4개 슬롯은 병렬로 최대 6.5초까지 selected image upload URL을 기다린 뒤 첫 저장 데이터에 포함한다. 수면 이미지도 같은 기준을 적용했다.
- 안전장치: 저장 전 대기 중 사용자가 사진을 삭제하거나 교체한 경우 오래된 upload 결과를 저장하지 않도록 파일 객체와 preview 상태를 다시 확인한다.
- 기존 changelog 무결성 테스트가 실제 `changelog.html` 최신 날짜(2026년 6월 25일)보다 오래된 기대값(2026년 6월 4일)을 보고 있어 테스트 기대값을 최신 날짜로 맞췄다.

## 검증

- `npm test` 통과: 51 files, 359 tests.
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js` 통과.
- Browser 검증: `http://127.0.0.1:5000/` 로드, 제목 `해빛스쿨 - 즐겁게 좋은 습관 만들기`, framework overlay 없음, 콘솔 error/warn 0건.
- Browser 상호작용: 게스트 갤러리 진입 모달과 `갤러리 둘러보기` 버튼 동작 확인, 갤러리 화면 전환 후 콘솔 error/warn 0건.

## 남은 리스크

- 실제 로그인 계정의 모바일 파일 선택/Storage 업로드는 브라우저 권한과 계정 상태가 필요해 로컬 자동 검증으로 직접 저장까지 누르지는 못했다.
- 업로드가 6.5초보다 늦는 저속 네트워크에서는 기존처럼 background upload/outbox 경로로 빠지지만, 이제 정상적인 짧은 지연에서는 첫 저장에 URL이 들어가야 한다.
