# 2026-06-03 사진/동영상 업로드 속도 점검

## 목표
- 사진/동영상 업로드 속도를 방해할 수 있는 클라이언트 병목을 확인한다.
- 특히 운동 동영상 선택 직후 업로드와 동시에 실행되는 작업이 전송을 방해하지 않게 한다.
- 기존 백그라운드 저장/오프라인 보관함 안전장치는 유지한다.

## 체크리스트
- [x] 현재 작업트리와 기존 업로드 성능 교훈 확인
- [x] 업로드/썸네일/백그라운드 저장 흐름 분석
- [x] 병목 완화 코드 반영
- [x] 테스트 및 번들 검증

## 발견
- 사진은 작은 JPEG/WebP fast path와 삼성 인터넷 simple put 경로가 이미 있다.
- 운동 동영상은 선택 직후 원본 업로드를 시작하지만, 큰 파일도 로컬 썸네일 추출을 즉시 시작할 수 있다.
- 로컬 썸네일 추출은 비디오 디코딩과 seek를 수행하므로 모바일에서 원본 업로드 시작 구간의 CPU/I/O 경쟁을 만들 수 있다.

## 계획
- 큰 동영상은 선택 직후 썸네일 추출을 하지 않고 원본 업로드 이후 백그라운드 썸네일 생성으로 넘긴다.
- 작은/중간 영상만 짧은 지연 뒤 로컬 썸네일을 추출해 미리보기 품질을 유지한다.
- 회귀 테스트로 큰 영상의 즉시 썸네일 추출 방지를 고정한다.

## 반영
- 20MB 초과 운동 동영상은 원본 업로드를 먼저 시작하고, 로컬 썸네일 추출은 원본 업로드 이후 경로로 넘긴다.
- 작은/중간 운동 동영상만 기존처럼 짧은 지연 뒤 로컬 썸네일을 추출해 즉시 미리보기를 보강한다.
- 사진 미리보기는 `FileReader.readAsDataURL()` 우선 경로 대신 `URL.createObjectURL()`로 즉시 표시하고, Storage URL이 확정되거나 사용자가 삭제하면 object URL을 해제한다.
- 런타임 변경 반영을 위해 PWA 자산 버전을 `v201`로 회전했다.

## 검증 예정
- [x] `npx vitest run tests/upload-performance.test.js tests/video-upload-resilience.test.js tests/exercise-media.test.js tests/pwa-versioning.test.js`
- [x] `npm test`
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- [x] `node --check functions/runtime.js`
- [x] `git diff --check`
- [x] `rg -n "v=200|habitschool-v200" index.html styles.css sw.js js`

## 리뷰
- 큰 운동 동영상은 선택 직후 비디오 디코딩/seek를 시작하지 않으므로 업로드 시작 구간의 모바일 CPU/I/O 경쟁을 줄인다.
- 사진은 base64 data URL 생성 비용을 기본 경로에서 제거했고, 저장 완료/삭제 시 object URL을 해제해 메모리 누수를 막는다.
- 기존 백그라운드 업로드, 썸네일 보강, 오프라인 보관함 안전장치는 유지했다.
