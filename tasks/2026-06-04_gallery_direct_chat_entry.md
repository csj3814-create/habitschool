# 2026-06-04 갤러리 단톡방 직행 정책

## Plan
- [x] 갤러리 단톡방 CTA와 해빛코치 연결 흐름 분리 상태 확인
- [x] 갤러리 하단 배너와 저장 버튼 chat 모드를 `openCommunityChat()` 직행 함수로 통일
- [x] 단톡방 CTA가 1:1 연결 함수로 회귀하지 않도록 테스트 추가
- [ ] 표준 검증 실행

## Notes
- 사용자 판단: 1:1 채팅을 열어 연결시키는 방식도 너무 복잡해 실제 등록이 일어나지 않는다.
- 결정: 커뮤니티 참여는 계정 연결 없이 바로 오픈채팅으로 보낸다.
- 연결/등록은 해빛코치 개인 기능이 필요할 때만 보조 흐름으로 둔다.

## Review
- 갤러리 하단 단톡방 배너는 `openCommunityChat()`만 호출하도록 정리했다.
- `openCommunityChat()`는 오픈채팅 URL을 직접 열고, 팝업 실패 시 같은 URL로 현재 창 이동한다.
- 저장 버튼의 갤러리 `chat` 모드도 같은 함수로 연결되어 계정 연결/1:1 채팅 퍼널을 타지 않는다.
- PWA 캐시 버전은 `v208`로 갱신했다.
- Verification passed:
  - `npx vitest run tests/gallery-loading.test.js tests/habit-groups-transition.test.js tests/habit-groups.test.js tests/pwa-versioning.test.js`
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`
  - `node --check functions\runtime.js`
  - `git diff --check`
