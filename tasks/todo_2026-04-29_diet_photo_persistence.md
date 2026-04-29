# 2026-04-29 식단 사진 저장 유실 방지

## 목표
- 식단 사진을 업로드하고 AI 분석까지 확인한 뒤 다시 돌아왔을 때 사진이 사라지는 원인을 찾는다.
- 분석 성공과 기록 저장 상태가 엇갈려 사진이 유실되지 않도록 저장 흐름을 보강한다.
- 저장/재렌더/캐시 갱신 과정에서 기존 사진 배열이 빈 값으로 덮이지 않게 한다.

## 체크리스트
- [x] 식단 사진 업로드/AI 분석/저장 흐름 추적
- [x] 사진 유실 재현 가능 원인 확정
- [x] 저장 보장 및 덮어쓰기 방지 수정
- [x] 회귀 테스트와 번들 검증
- [x] 작업 기록/교훈 업데이트

## 리뷰
- 원인: 식단 사진 사전 업로드가 완료된 상태에서 AI 분석은 Storage URL로 수행됐지만, 분석 저장 경로는 `dietAnalysis`만 저장하고 `diet.<slot>Url`을 같이 저장하지 않았다. 그래서 다시 로드하면 분석 기록만 있고 사진 URL이 없어 식단 박스가 숨겨질 수 있었다.
- 수정: AI 분석 성공 시 해당 식사 슬롯의 Storage URL과 분석 결과를 하나의 Firestore patch로 저장하고, 네트워크 지연이면 background media patch queue에 넣는다.
- 보강: 일반 저장 시 식단 URL 필드는 유효한 새 Storage URL 또는 명시적 삭제일 때만 바꾸고, 빈 값으로 기존 사진을 덮어쓰지 않게 했다. 기존 사진이 있는 슬롯에서 새 파일을 고르는 중 오프라인 저장이 되더라도 선택 파일이 outbox에 남도록 조정했다.
- 검증: `npm test`, `npx esbuild js/app.js --bundle --format=esm --platform=browser --outfile=$env:TEMP\habitschool-app-check.js`, `git diff --check` 통과.
