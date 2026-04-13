# 2026-04-14 Media Date Policy And Gallery Toggle

## Checklist
- [x] 확인: 사진/영상 업로드 날짜 검증이 실제로 어떤 기준으로 동작하는지 점검
- [x] 정리: KST 기준 여부와 메타데이터 없는 기기 예외 정책 판단 근거 정리
- [x] 구현: 갤러리 `가이드 펼치기` 버튼을 `펼치기/접기`로 단순화
- [x] 구현: 갤러리 버튼 크기를 다른 탭 토글과 비슷하게 키우기
- [x] 구현: EXIF가 있는 사진은 날짜 불일치 시 예외 없이 차단
- [x] 구현: EXIF가 없는 사진과 영상만 경고 후 예외 허용
- [x] 검증: 테스트와 번들 체크

## Notes
- 제품 취지상 과거 자료 악용 가능성을 낮추는 쪽으로 설명해야 한다.
- 현재 정책이 “차단”인지 “경고 후 허용”인지 코드 기준으로 정확히 확인해야 한다.

## Review
- 사진은 `EXIF DateTimeOriginal/DateTime` 우선, 없으면 `lastModified` fallback으로 검증한다.
- 영상은 현재 `lastModified`만 사용하고 있으며, 둘 다 날짜 비교는 `toLocaleDateString(..., { timeZone: 'Asia/Seoul' })`로 KST 기준이다.
- 절충안으로 바꿔서, EXIF가 있는 사진은 날짜가 다르면 즉시 차단하고, EXIF가 없는 사진과 영상만 경고 후 예외 허용하도록 맞췄다.
- 식단 여러 장 자동 가져오기에서도 EXIF 불일치 사진은 제외하고, 메타데이터가 없거나 파일 날짜만 다른 사진은 한 번 더 확인 후 포함할 수 있게 했다.
- 갤러리 `HABIT FEED` 우측 버튼은 `펼치기/접기`로 단순화했고 모바일에서도 다른 탭 토글과 비슷한 크기로 맞췄다.
- 검증:
  - `npm test`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
