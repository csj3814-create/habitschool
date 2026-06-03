# 2026-06-03 Video Upload 1 Percent Stall

## 목표
- 삼성/모바일 환경에서 운동 영상 업로드가 1%에서 멈춘 채 진행되지 않는 제보를 해결한다.
- 기존 백그라운드 저장, 오프라인 보관함, 동영상 썸네일 보강 흐름은 유지한다.

## 체크리스트
- [x] 관련 교훈과 현재 업로드 경로 확인
- [x] 1% 정체를 피하는 전송 경로 수정
- [x] 회귀 테스트와 PWA 버전 반영
- [x] 필수 검증 실행

## 발견
- 현재 삼성 인터넷 simple put 우회는 이미지에만 적용된다.
- 운동 영상은 삼성 인터넷에서도 계속 Firebase Storage resumable upload를 사용한다.
- 기존 교훈상 삼성 인터넷에서 resumable progress가 1% 근처에 멈춰도 파일 선택 자체는 정상일 수 있다.

## 계획
- 삼성 인터넷의 운동 영상 업로드는 `uploadBytesResumable` 대신 `uploadBytes` 단순 전송을 사용한다.
- 동영상 simple put은 영상 파일 크기 기반 timeout을 사용하고 `contentType`을 유지한다.
- 회귀 테스트로 삼성 영상이 simple put 경로를 타는지 고정한다.

## 반영
- 삼성 인터넷 운동 영상은 `uploadBytesResumable` 대신 `uploadBytes` 단순 전송을 사용한다.
- 동영상 단순 전송은 `getResumableUploadTimeouts()`의 동영상 hard timeout을 재사용하고, Storage metadata에 영상 `contentType`을 유지한다.
- 단순 전송은 세부 progress 이벤트가 없으므로 inline UI에는 퍼센트 대신 `영상 업로드 중이에요. 저장하면 자동으로 이어갈게요.` 메시지를 표시한다.
- simple upload의 첫 progress 알림은 pending upload 엔트리가 생성된 뒤 적용되도록 microtask로 지연했다.
- 런타임 변경 반영을 위해 PWA 자산 버전을 `v202`로 회전했다.

## 검증
- [x] `npx vitest run tests/video-upload-resilience.test.js tests/upload-performance.test.js tests/pwa-versioning.test.js`
- [x] `npm test`
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\habitschool-app-check.js`
- [x] `node --check functions/runtime.js`
- [x] `git diff --check`
- [x] `rg -n "v=201|habitschool-v201" index.html styles.css sw.js js`

## 리뷰
- 원인은 삼성 인터넷 영상 업로드가 이미지와 달리 여전히 resumable upload 전송을 탔던 점으로 판단한다.
- 수정 후 삼성 인터넷 운동 영상은 단순 Storage put으로 전송되며, 완료 후 기존 URL 저장/썸네일/백그라운드 패치 흐름으로 이어진다.
- 로컬 Browser/Playwright가 현재 세션에 없어 실제 인증 후 파일 선택 렌더 자동화는 수행하지 못했다.
