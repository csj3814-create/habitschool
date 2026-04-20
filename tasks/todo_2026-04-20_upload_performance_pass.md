# 2026-04-20 Upload Performance Pass

> **상태**: 완료

## 작업
- [x] 현재 사진/동영상 업로드 병목 경로 분석
- [x] 업로드 전처리/썸네일/전송 순서 최적화
- [x] 회귀 테스트 및 작업 메모 정리
- [x] `npm test`, `esbuild` 검증 실행

## 메모

- 사용자 체감: 사진 업로드도 예전보다 조금 느리고, 3-4MB 동영상도 지나치게 오래 걸림
- 목표: 실제 업로드 시간을 줄이고, 전처리로 인한 대기 시간을 최소화

## 리뷰

- Root cause 1: 일반 사진 업로드가 작은 JPG/WEBP/PNG까지 거의 무조건 `compressImage(...)`를 거치면서 모바일 CPU에서 캔버스 디코드/재인코딩 대기를 만들고 있었다.
- Root cause 2: 운동 동영상은 원본 업로드와 동시에 로컬 썸네일 프레임 추출을 시작해서, 3~4MB처럼 작은 파일에서도 초반 체감 속도를 갉아먹는 CPU 경합이 생길 수 있었다.
- Fix:
  - 작은 일반 이미지 업로드는 `fast-path`로 원본을 바로 올리도록 분기했다.
  - HEIC/HEIF/AVIF와 AI 분석용 대형 압축 경로는 그대로 유지해 호환성과 분석 품질을 보존했다.
  - 운동 동영상 로컬 썸네일 추출은 파일 크기에 따라 짧게 지연시켜, 원본 전송이 먼저 붙은 뒤에 시작되도록 조정했다.
  - `createImageBitmap` 실패 시 원본으로 복구하는 fallback도 넣어 압축 경로가 불필요하게 멈추지 않게 했다.
- Verification:
  - `npm test` → `185 passed`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
