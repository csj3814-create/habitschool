## 2026-04-13 운동 두번째 영상 업로드 지연 조사

### 체크리스트
- [x] 관련 lessons 검토
- [x] 운동 영상 업로드/저장 경로 추적
- [x] 100% 이후 대기 원인 확인
- [x] 두번째 영상에서 체감이 더 커지는 이유 정리

### 조사 요약
- 업로드 바 `100%`는 `uploadBytesResumable` + `getDownloadURL`로 원본 영상 URL을 얻는 시점에 끝난다.
- 그 뒤에도 저장 완료로 처리되기 전에 영상 썸네일 업로드와 Firestore 패치가 남아 있다.
- 백그라운드 동기화는 `runBackgroundMediaSyncJobs()`에서 job을 직렬 처리한다.
- 각 strength job은 `resolvePendingUploadResult()`에서 썸네일을 최대 5초 더 기다리고, 이어서 `applyBackgroundMediaPatch()`에서 문서를 다시 읽고 전체 `exercise.strengthList`를 merge한 뒤 다시 쓴다.
- 두번째 영상을 저장할 때 첫번째 영상 input이 아직 finalize되지 않았으면 두 job이 함께 다시 큐에 들어갈 수 있다.
- 영상 선택 직후 `extractVideoThumbFromFile()`를 한 번 돌리고, `uploadVideoWithThumb()` 안에서 local thumb가 아직 준비되지 않았으면 같은 추출을 다시 수행할 수 있어 중복 비용이 생긴다.

### 핵심 코드 위치
- `previewDynamicVid()`에서 영상 선택 즉시 thumb 추출 시작
  - `js/app.js` around `3940`, `3948`
- `uploadVideoWithThumb()`에서 원본 업로드 후 thumb 업로드 별도 수행
  - `js/app.js` `9547-9593`
- `resolvePendingUploadResult()`에서 thumb를 최대 5초 추가 대기
  - `js/app.js` `9614-9631`
- `runBackgroundMediaSyncJobs()`에서 job 직렬 처리
  - `js/app.js` `9959-10000`
- strength job queueing
  - `js/app.js` `10212-10214`
- `applyBackgroundMediaPatch()`에서 문서 재조회 후 merge write
  - `js/app.js` `9882-9957`

### 결론
- 현재 구조에서 `100%`는 “영상 원본 업로드 완료”일 뿐이고, 사용자가 느끼는 최종 완료 시간은 `썸네일 처리 + 직렬 Firestore 패치`까지 포함된다.
- 두번째 영상은 첫번째 영상의 미정리 pending job까지 함께 처리될 수 있어 더 느리게 느껴질 가능성이 높다.

### 다음 수정 방향
- save-complete 경로에서는 thumb를 기다리지 말고 video URL만 먼저 저장
- thumb는 후속 patch로 따로 반영
- background job을 직렬 1건씩이 아니라 최소한 strength/cardio는 병렬 또는 batched patch 검토
- video thumb 추출을 한 번만 하도록 local thumb 재사용 보장
