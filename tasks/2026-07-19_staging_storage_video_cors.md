# 2026-07-19 staging 운동 영상 CORS 수정

## 증상

- `https://habitschool-staging.web.app`에서 Firebase Storage 운동 영상을 요청할 때 브라우저가 `No Access-Control-Allow-Origin`으로 차단한다.
- 이어지는 `net::ERR_FAILED 206 (Partial Content)`는 동영상 Range 응답 자체가 아니라 CORS 헤더 누락 때문에 발생한다.

## 범위와 원칙

- `habitschool-staging.firebasestorage.app` 버킷과 staging 출처만 대상으로 한다.
- 운영 버킷, Storage 규칙, 사용자 기록, 영상 객체는 변경하지 않는다.
- 앱에서 이미 사용하는 `crossOrigin = 'anonymous'`와 기존 영상 저장·썸네일 구조는 유지한다.
- 현재 버킷 CORS를 먼저 확인하고 기존 허용 항목을 보존한 최소 추가만 수행한다.
- CORS 설정을 재현 가능한 저장소 파일과 검증 절차로 남긴다.

## 체크리스트

- [x] 현재 staging 버킷 CORS 구성 확인
- [x] 실제 영상 요청의 Origin·Range·응답 헤더 확인
- [x] 최소 CORS 구성 설계 및 예상 변경 보고
- [x] staging 버킷 CORS 적용
- [x] `GET`/`HEAD` 및 Range 응답의 CORS 헤더 확인
- [x] Chrome에서 영상 재생·썸네일·콘솔 오류 재검증
- [x] 관련 자동 테스트와 `git diff --check` 실행
- [x] `tasks/lessons.md`에 교훈 추가

## 예상 변경

- 저장소에 staging 출처를 명시한 Storage CORS 설정 파일과 적용·검증 방법을 추가한다.
- 애플리케이션 코드와 Storage 보안 규칙은 실제 원인 분석에서 별도 결함이 확인되지 않는 한 변경하지 않는다.

## 재적용 방법

- 설정 파일: `scripts/storage-cors.staging.json`
- Google Cloud Console: `habitschool-staging.firebasestorage.app` → 구성 → 교차 출처 리소스 공유
- `gcloud`가 설치된 환경에서는 다음과 같이 동일 설정을 재적용할 수 있다.

```powershell
gcloud storage buckets update gs://habitschool-staging.firebasestorage.app --cors-file=scripts/storage-cors.staging.json
```

## 검증 결과

- 적용 전 Cloud Console 상태: CORS `사용 설정되지 않음`.
- 적용 후 Cloud Console 상태: CORS `구성 1개`, staging 출처만 허용.
- 실제 저장 운동 영상 Range 요청: `206`, `Access-Control-Allow-Origin: https://habitschool-staging.web.app`, `Content-Range`, `Accept-Ranges: bytes`, `Content-Type: video/mp4` 확인.
- 동일 영상 HEAD 요청: `200`, staging `Access-Control-Allow-Origin` 확인.
- Chrome 운동 탭: 저장 영상에서 생성한 data 썸네일이 로드되고 미리보기 표시.
- Chrome 콘솔: 운동 탭 진입 후 error 0건.
- `npm test`: 74개 파일, 585개 테스트 통과. 에뮬레이터 전용 7개는 기본 실행에서 제외.
- esbuild 브라우저 번들 및 `git diff --check` 통과.
- 운영 버킷·영상 객체·애플리케이션 코드·Storage 규칙은 변경하지 않음.

## 후속 수정 — data URL 캐시 CSP 오류

### 원인

- CORS 적용 후 원격 영상 프레임 추출이 성공하면서 `data:image/jpeg;base64,...` 썸네일 캐시 경로가 실행됐다.
- 캐시 저장, 최초 썸네일 업로드, fallback 생성의 세 경로가 data URL을 `fetch()`해 Blob으로 바꿨고, 이 요청은 이미지 표시가 아니라 `connect-src` 적용 대상이라 현재 CSP에서 차단됐다.
- CSP 허용 범위를 넓힐 문제가 아니라 로컬 값에 불필요한 네트워크 API를 사용한 구현 문제다.

### 최소 변경 설계

- [x] `exercise-media.js`에 네트워크 없는 data URL → Blob 변환 헬퍼 추가
- [x] `app-core.js`의 세 `fetch(data URL)` 경로를 같은 헬퍼로 교체
- [x] Base64·퍼센트 인코딩·잘못된 입력 단위 테스트 추가
- [x] CSP `connect-src`, Storage 규칙, 버킷 CORS는 추가 변경하지 않음
- [x] staging 재배포 후 운동 탭 미리보기와 콘솔 error 0건 재확인

### 예상 수정 파일

- `js/exercise-media.js`: data URL을 브라우저 내부에서 직접 Blob으로 변환
- `js/app-core.js`: 기존 캐시·업로드 경로에서 공통 변환 헬퍼 재사용
- `tests/exercise-media.test.js`, `tests/video-upload-resilience.test.js`: 실제 변환과 data URL fetch 제거 회귀 검증
- `tasks/lessons.md`: CORS 해결 뒤 후속 파이프라인까지 검증하는 교훈 추가

### 자동 검증 결과

- 집중 테스트: 2개 파일, 45개 테스트 통과.
- 전체 테스트: 74개 파일, 590개 테스트 통과. 에뮬레이터 전용 7개는 기본 실행에서 제외.
- Firestore 에뮬레이터: 1개 파일, 7개 테스트 통과.
- esbuild 브라우저 번들 통과.
- staging Hosting 배포 완료. Functions·규칙·CORS는 재배포하지 않음.
- 로그인된 Chrome 운동 탭에서 data URL 썸네일이 720×405로 정상 표시되고 콘솔 error 0건 확인.
- 같은 운동 탭을 새로고침한 뒤에도 썸네일 복원과 콘솔 error 0건 확인.
- 배포된 `app-core.js`에 기존 `fetch(normalized)`·`fetch(dataUrl)`이 없고 공통 변환기 배포를 확인.
