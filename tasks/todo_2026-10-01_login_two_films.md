# 로그인 화면에 쇼츠 「아빠의 자전거」 추가 (2026-10-01)

요청: 새 쇼츠(v5)를 로그인 화면에 넣어 기존 「아침 식탁」과 나란히 보이게, 누르면 재생.

- [x] 웹용 영상 540p 2.45MB → `assets/film/dad_bike_ko.mp4` (새 이름, 3MB 미만)
- [x] 포스터 → `assets/film/dad_bike_poster.jpg` (자전거 클라이맥스 프레임)
- [x] index.html: 포스터 카드 두 개를 나란히(`login-film-shelf`), 무대는 하나를 같이 쓴다
- [x] 영어 화면: 새 영상은 한국어 내레이션·자막이라 숨긴다 (`html.locale-en`)
- [x] auth.js: `playLoginFilm(film)` — 영상별 주소·포스터, 끝나면 목록으로 + 시작 버튼 강조, 닫기 단추
- [x] product-events: `login_film_play` 에 `film` 값(breakfast/dad_bike)
- [x] 테스트 갱신, 자산 버전 v481 → v482, en/index.html 재생성
- [x] 미리보기에서 두 영상 재생·닫기·끝난 뒤 복귀 확인 (모바일 폭)
- [ ] 커밋·푸시 → 스테이징 배포 → 사용자 확인 후 운영

## 결과
- 375px 폭에서 카드 두 장이 한 줄(151px씩, 360px 폰의 328px 안에 듦). 처음엔 178px라 세로로 쌓여 줄였다.
- 「아빠의 자전거」 누르면 dad_bike_ko.mp4(540×960, 47초) 재생, ✕ 로 닫으면 멈추고 목록으로, 다른 편으로 바꿔 틀기 OK.
- ended → 목록으로 돌아가고 시작 버튼 강조(이벤트로 확인). 로컬 서버는 Range 를 지원하지 않아 끝으로 건너뛰기는 못 해 봤다 — 스테이징에서 끝까지 한 번 본다.
- /en: 「아침 식탁」만 보이고 닫기 단추는 "Close video".
- vitest 2579 통과, en/index.html 동기화 확인.
