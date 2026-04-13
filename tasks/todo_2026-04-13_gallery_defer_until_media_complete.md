## 2026-04-13 갤러리 미디어 완성본 반영 개선

### 체크리스트
- [x] 관련 lessons 검토
- [x] 저장 직후 갤러리 캐시 덮어쓰기 경로 확인
- [x] 불완전 미디어 상태를 갤러리에 노출하지 않도록 수정
- [x] 검증 및 배포 준비

### 배경
- 운동 영상/수면 이미지 업로드 직후 갤러리 탭으로 이동하면 회색 네모 또는 빈 상태가 보였다.
- 원인은 저장 직후 `galleryHydrationData`와 강제 `loadGalleryData(true)`가 아직 업로드/썸네일/패치가 끝나지 않은 문서를 갤러리 캐시에 반영했기 때문이다.

### 목표
- 업로드 중에는 기존 갤러리 상태를 유지한다.
- 백그라운드 업로드와 썸네일 반영이 모두 끝난 뒤에만 갤러리 캐시를 새 상태로 교체한다.
- 기록 탭 저장과 포인트 반영은 기존처럼 빠르게 유지한다.

### 결과
- 저장 직후에는 `updateDailyLogCache()`만 갱신하고, background media job이 있으면 `upsertGalleryCacheItem()`과 강제 `loadGalleryData(true)`를 미룬다.
- background job 처리 중에는 Firestore patch는 진행하되 갤러리 캐시는 건드리지 않는다.
- background job이 전부 끝난 뒤 마지막 확정 데이터로만 갤러리 캐시와 공유 카드가 갱신된다.
