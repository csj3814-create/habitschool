# 명상 가이드 개선 v1

## 체크리스트
- [x] 마음 탭 명상 체크박스를 가이드형 타이머 카드로 교체
- [x] 명상 방법 메타데이터와 타이머 상태 로직 추가
- [x] 내 기록 가이드, 저장/복원, 점수 연동을 새 명상 완료 방식에 맞게 연결
- [x] Firestore rules와 회귀 테스트 보강
- [x] `npm test` 및 `esbuild` 검증

## 메모
- 기존 `sleepAndMind.meditationDone`는 유지하고 메타데이터만 확장
- 감사일기, 수면 캡처, 마음 점수 구조는 유지
- 모바일 문구는 짧게 유지

## 리뷰
- `js/meditation-guide.js`로 방법/길이/단계 문구를 분리해 체크박스 의존을 제거
- 타이머 완료 시 `meditationDone`, `meditationMethodId`, `meditationDurationSec`, `meditationCompletedAt`를 저장하도록 연결
- 레거시 완료 기록은 방법/시간이 없으면 `오늘 명상 완료`만 보이게 유지
- `firestore.rules`에 `sleepAndMind` 허용 키를 명시
- 검증: `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
