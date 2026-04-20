# 2026-04-20 7일 챌린지 실패 정산 조사

> **상태**: 완료

## Checklist

- [x] `tasks/lessons.md`에서 관련 패턴 검토
- [x] 챌린지 진행도 표시와 실패/성공 정산 로직 비교
- [x] 마지막 날 집계와 `completedDays` 숫자만 보는 로직 수정
- [x] 신규 챌린지 종료일 계산 오프바이원 수정
- [x] 회귀 테스트 추가 및 실행
- [x] `npm test` / `esbuild` / `node --check functions/index.js` 검증

## Findings

- UI 진행률이 `completedDays` 숫자만 그대로 읽고 있었다.
- 실패/성공 정산도 `completedDays`를 그대로 계산하고 있어, `completedDates`와 불일치하면 실제 완료일보다 덜 채운 것처럼 판정될 수 있었다.
- 마지막 날(`today === endDate`)에도 오늘 기록을 반영하기 전에 정산 분기가 먼저 타면, 그날 기록을 완료한 사용자도 실패 처리될 수 있었다.
- 신규 챌린지 생성 시 `endDate`가 `duration`보다 하루 길게 잡혀 표시상 일정이 어긋날 수 있었다.

## Fix Summary

- `completedDates`를 dedupe하고 `completedDays`와 항상 reconcile하도록 정규화 로직을 추가했다.
- 마지막 날은 오늘 기록을 먼저 반영한 뒤 성공/실패를 결정하도록 정산 순서를 바꿨다.
- 만료 후 일괄 정산은 `today > endDate`일 때만 자동 처리하도록 조정했다.
- 새로 시작하는 챌린지는 실제 일수와 표시 종료일이 맞도록 inclusive `endDate`를 저장하게 했다.

## Review

- `tests/challenge-qualification.test.js`에 완료일 정규화와 마지막 날 timeline 판정 회귀 테스트를 추가했다.
- 검증:
  - `npm test` → `187 passed`
  - `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=%TEMP%\\habitschool-app-check.js`
  - `node --check functions/index.js`
