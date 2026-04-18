# Samsung Internet 알림/탭 무반응 조사

## 체크리스트
- [ ] 관련 교훈과 기존 구현(sw, bootstrap, tab navigation) 재확인
- [ ] 삼성 인터넷/브라우저별 분기 가능성 조사
- [ ] 알림 클릭 무반응 원인 재현 또는 코드상 근거 확보
- [ ] 식단/운동/마음 기록 탭 무반응 원인 재현 또는 코드상 근거 확보
- [ ] 근본 수정 및 회귀 테스트 추가
- [ ] 검증 결과와 남은 리스크 정리

## 메모
- 신고 증상:
  - 알림 탭 시 반응 없음
  - 대시보드의 `식단 기록 / 운동 기록 / 마음 기록` 탭 시 반응 없음
  - 제보 기기 화면상 브라우저는 삼성 인터넷으로 보임
- 우선 가설:
  - 삼성 인터넷에서 서비스워커 `notificationclick`의 `navigate/focus` 체인이 실패하고 fallback이 없음
  - 초기 bootstrap/runtime error로 `openTab` 또는 클릭 핸들러 연결은 되었지만 이후 상단 UI만 렌더되고 터치가 막히는 상태
  - 특정 overlay/backdrop 또는 초기화 pending 상태가 클릭을 가로채는 상태

## 조사 결과
- 삼성 인터넷 자체는 원천 미지원이 아니었다.
  - 삼성 공식 문서상 Samsung Internet for Android는 Service Worker, Push API, Notification API, `WindowClient.navigate()`를 지원한다.
- 실제 취약점은 우리 자산 배포 구조였다.
  - `index.html`과 일부 엔트리 스크립트는 `?v=158`에 묶여 있었지만, `app.js`/`auth.js`/`main.js`가 가져오는 다수의 로컬 모듈은 queryless import였다.
  - 같은 버전 번호를 여러 차례 재사용하면서, 일부 사용자 브라우저는 오래된 helper 모듈과 최신 엔트리포인트를 섞어 받는 상태가 될 수 있었다.
  - 이 경우 `app.js` 모듈 전체가 import 단계에서 실패하고, 화면은 일부 렌더되지만 `openTab()`이 전역에 안 올라와 “알림 눌러도 반응 없음 / 상단 탭 눌러도 반응 없음”처럼 보일 수 있다.
- 알림 클릭 핸들러도 방어가 약했다.
  - 서비스워커 `notificationclick`가 기존 창 `navigate().focus()` 실패 시 `clients.openWindow()`로 fallback하지 않아, 브라우저별 실패를 그대로 사용자 무반응으로 노출했다.

## 수정
- 모든 로컬 JS 모듈 import를 동일 release query(`?v=159`)로 통일
- 엔트리 스크립트/스타일/서비스워커 cache name을 `159`로 갱신
- 서비스워커 precache 목록에 helper 모듈까지 포함
- `firebase.json`에 HTML/manifest/styles/js no-cache 헤더 추가
- 서비스워커 `notificationclick`에 `navigate/focus` 실패 시 `openWindow(destination)` fallback 추가
- 테스트 추가:
  - local module import version alignment
  - notification click fallback presence

## 검증
- `npm test` → 174 passed
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js` 통과

## 남은 리스크
- 실제 삼성 인터넷 실기기에서 이번 빌드를 다시 받아 확인해야 한다.
- 기존에 설치된 오래된 서비스워커/HTTP 캐시가 남아 있으면 새 배포 이후 첫 진입 전까지는 한 번 더 문제가 보일 수 있다.
