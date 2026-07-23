# 운영 초기 데이터 로딩 복구

## 목표

- staging에서는 정상이나 운영의 갤러리·자산 탭 일부가 로딩 상태에 머무는 원인을 확인한다.
- 앱을 백그라운드로 보냈다가 돌아왔을 때만 데이터가 보이는 의존성을 제거한다.
- 미완료 데이터 요청은 2초 간격으로 최대 3회만 자동 재시도하고, 중복 호출·중복 렌더·전체 페이지 새로고침을 만들지 않는다.

## 체크리스트

- [x] 운영·staging 배포 자산과 Functions 상태 비교
- [x] 갤러리·자산 탭의 초기 호출, timeout, visibility 재개 경로 조사
- [x] 원인과 공용 재시도 경계를 확정
- [x] 최소 코드와 집중 회귀 테스트 구현
- [x] `npm test`
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- [x] `git diff --check`
- [x] 모바일·데스크톱에서 초기 로딩과 2초×3회 제한 검증
- [x] `tasks/lessons.md` 교훈 기록

## 설계 원칙

- `location.reload()`로 앱 전체를 새로고침하지 않는다.
- 이미 성공한 데이터는 재요청하지 않고, 미완료인 독립 데이터 소스만 재시도한다.
- 동시에 여러 재시도가 예약돼도 같은 로더는 한 번만 실행한다.
- 탭 이탈·로그아웃·사용자 변경 뒤의 늦은 응답은 현재 화면에 반영하지 않는다.

## 예상 수정 파일

- `js/app-core.js`: 갤러리·자산의 예약 취소/횟수 계산 오류를 바로잡고 자산 캐시 적중 시에도 마켓을 독립 갱신한다.
- `js/reward-market.js`: 마켓 스냅샷을 2초 간격으로 최대 3회 자동 재시도한다.
- `tests/gallery-loading.test.js`, `tests/progressive-loading.test.js`: 실제 실행 횟수 기준 재시도와 성공 시 중단을 고정한다.
- `tests/data-retry-schedulers.test.js`: 가짜 타이머로 2초 간격·중복 병합·3회 상한을 실행 검증한다.
- `index.html`, `en/index.html`, `styles.css`, `sw.js`와 연관 JS 진입점: PWA가 수정된 런타임을 받도록 v248로 함께 올린다.
- `tasks/lessons.md`: 운영 데이터 지연과 재시도 조정 교훈을 기록한다.

## 원인

- 운영 Functions의 `getRewardMarketSnapshot`에는 인증된 요청이 정상 도착했고 서버 오류가 없었다. 운영은 staging보다 데이터가 많아 초기 병렬 조회의 지연 경로가 더 자주 발생한다.
- 갤러리는 cache-only 결과 뒤 권위 조회 재시도를 예약해도 피드 렌더 마지막의 무조건적인 `clearGalleryRetry()`가 타이머를 취소했다.
- 자산은 누락된 하위 조회마다 기존 타이머를 취소하고 카운트를 올려, 한 번의 화면 로드만으로 재시도 예산을 소모하고 첫 실행을 최대 14.4초까지 밀었다.
- 마켓은 7초 timeout 뒤 오류 상태만 표시하고 자동 재시도하지 않았다.
- 백그라운드 복귀 시 Firestore 연결·화면 로더가 다시 실행되면서 위 누락 정보가 뒤늦게 표시됐다.

## 검증 결과

- 운영 Hosting의 `index.html`, `app-core.js`, `firebase-config.js`, `sw.js`는 당시 staging과 동일했으며, 운영 `getRewardMarketSnapshot` 로그에는 인증된 호출이 정상 도착하고 서버 오류가 없었다.
- 집중 테스트: 15/15 통과.
- 전체 테스트: 614 통과, emulator 전용 7개 skip.
- Firestore emulator 테스트: 7/7 통과.
- esbuild 브라우저 번들: 성공.
- `git diff --check`: 성공.
- 로컬 Hosting 데스크톱 1440×900, 모바일 390×844에서 로그인 화면·비회원 갤러리·비회원 자산 화면과 v248 진입점을 확인했다.
- 로컬 브라우저의 Firestore unavailable 로그는 Hosting만 실행해 8080 Firestore emulator가 없어서 발생한 검증 환경 한정 오류다. 화면 검증 뒤 로컬 서버는 종료했다.

## 남은 문제

- 실제 운영 회원 데이터로 확인하려면 먼저 staging에 배포해 로그인 상태의 갤러리·자산·마켓을 검증한 뒤 운영 배포 승인을 받아야 한다.
- 운영 배포는 별도 사용자 승인을 받은 뒤 진행한다.
