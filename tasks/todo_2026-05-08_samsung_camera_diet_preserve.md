# 2026-05-08 삼성인터넷 카메라 복귀 및 식단 사진 보존 안정화

> 상태: 완료

## 작업
- [x] 관련 lessons와 현재 저장/인증 흐름 확인
- [x] 식단 파일 선택/카메라 복귀 상태 추적 구현
- [x] 데이터 로드 중 미저장 미디어 UI 보존 구현
- [x] 카메라/file picker 복귀 직후 auth null grace 구현
- [x] 회귀 테스트 추가
- [x] `npm test` 실행
- [x] esbuild 번들 검증 실행
- [x] 결과 리뷰 기록

## 메모
- 사용자 보고: 삼성인터넷 안드로이드에서 점심 사진이 사라졌다가 새로고침 뒤 저녁 사진이 사라지는 증상.
- 카메라 촬영 후 OK를 누르면 로그인 첫 화면으로 튕긴 증상도 같은 기기에서 발생.
- 기존 삭제 마커 수정은 본서버에 반영돼 있으므로, 이번 작업은 카메라/file picker 복귀 중 UI 초기화와 auth 복구 지연 방어에 집중한다.

## 리뷰
- 식단 파일 선택/카메라 촬영 흐름에서 12초 복구 유예 상태를 기록하도록 했다.
- 사진 미리보기에는 `data-local-draft`를 남기고, pending upload나 local draft가 있으면 daily-log hydration이 해당 슬롯을 덮어쓰지 않게 했다.
- `loadDataForSelectedDate()`가 카메라/file picker 복귀 중이면 `clearInputs({ preserveMedia: true })`로 미디어 UI와 file input을 보존한다.
- Auth `null` 이벤트가 카메라/file picker 복귀 유예 중 들어오면 로그인 모달을 즉시 띄우지 않고 유예 종료 후 다시 확인한다.
- 검증: `npm test` 통과, esbuild 브라우저 번들 검증 통과.
