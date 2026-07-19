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
