# 2026-04-10 신규 챌린지 일일 인정점수 강화
> **상태**: 완료

## 작업
- [x] 관련 교훈과 기존 챌린지 일일 인정 로직 검토
- [x] 새로 시작하는 위클리/마스터 챌린지에만 `65점 이상` 일일 인정 규칙 스냅샷 추가
- [x] 진행 중 기존 챌린지는 기존 `식단+운동+마음` 규칙 유지
- [x] UI/설명 문구를 신규 규칙 기준으로 정리
- [x] 테스트와 번들 검증 실행

## 메모
- 목표는 토큰이 걸린 신규 챌린지의 하루 인정 허들을 높이되, 기존 진행 중 챌린지의 공정성은 깨지 않는 것이다.
- 현재 점수 구조에서는 `65점`이 사실상 식단/운동/마음 세 영역 모두를 요구한다.

## 검증
- [x] `npm test`
- [x] `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
- [x] `npx esbuild js/main.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-main-check.js`
- [x] `node --check functions/index.js`

## 결과
- 신규로 시작하는 위클리/마스터 챌린지는 시작 시 `qualificationPolicy = { type: "daily_min_points", dailyMinPoints: 65 }`를 저장한다.
- 기존 진행 중 챌린지는 `qualificationPolicy`가 없으면 legacy 규칙으로 유지되도록 클라이언트 fallback을 별도로 막았다.
- 챌린지 시작 토스트와 선택 카드 문구를 새 기준에 맞췄고, 활성 챌린지 카드에서도 현재 인정 규칙을 보이게 했다.
- 공용 판정 헬퍼를 `js/blockchain-config.js`에 정리하고 회귀 테스트 `tests/challenge-qualification.test.js`를 추가했다.
