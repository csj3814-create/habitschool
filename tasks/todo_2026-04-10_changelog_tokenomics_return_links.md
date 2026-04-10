## 2026-04-10 업데이트 노트/토크노믹스 문구 정리

- [x] 업데이트 노트 문구를 쉬운 말로 정리
- [x] changelog 상단 돌아가기 버튼을 토크노믹스와 같은 형태로 통일
- [x] changelog / tokenomics 하단 돌아가기 버튼 문구를 통일
- [x] tokenomics 돌아가기 링크를 내 자산 탭으로 연결
- [x] 검증 및 결과 기록

### 메모

- 사용자가 보는 업데이트 노트는 전문 용어보다 쉽게 읽히는 문장이 우선
- changelog 상단 버튼은 `프로필로 돌아가기` 문구 유지, 스타일만 토크노믹스 페이지와 맞춤
- changelog 하단 버튼, tokenomics 하단 버튼은 `해빛스쿨로 돌아가기`로 통일
- tokenomics 페이지의 돌아가기 링크는 `/#assets`로 연결

### 구현

- `changelog.html` 최신 카드 문구를 쉬운 설명 중심으로 다시 작성
- `changelog.html` 상단 `프로필로 돌아가기` 버튼 스타일을 `tokenomics.html`의 back 버튼과 같은 형태로 통일
- `changelog.html` 하단에 `해빛스쿨로 돌아가기` 버튼 추가
- `tokenomics.html` 상단/하단 돌아가기 링크를 모두 `./#assets`로 변경
- `tokenomics.html` 하단 버튼 문구를 `해빛스쿨로 돌아가기`로 통일

### 검증

- `npm test`
- `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
