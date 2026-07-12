# 2026-07-12 staging 피드백 UX 수정

## 목표

- 첫 기록 결과창의 노출 조건을 확인하고 반복 알림 부담을 제거한다.
- 풀 루틴 65P 달성 시 세 카테고리 카드 모두 완주 상태로 보이게 한다.
- 공유 식단의 핵심 AI 분석을 개인정보를 제외한 안전한 projection으로 갤러리에 복구한다.

## 체크리스트

- [x] 첫 기록 결과창 기존 사용자·반복 노출 조건 확인
- [x] `하나 더 기록`을 `계속 기록하기`로 변경
- [x] 첫 기록 결과창의 다음 날 알림 제안 UI·호출 제거
- [x] 총 65P 달성 시 미완료 카테고리도 초록 완주 스타일 적용
- [x] 식단 AI 분석 허용 필드·길이 제한 sanitizer 추가
- [x] `shareSettings.hideDiet` 적용 후에만 `gallery_posts.dietAnalysis` 저장
- [x] 갤러리 AI 분석 버튼·모달 회귀 테스트
- [ ] 기존 staging projection 백필 재적용
- [x] 단위·전체 회귀·Emulator·브라우저 검증
- [ ] 커밋·`origin/main` 푸시 및 staging 재배포

## 검증 기록

- `npm test`: 68 files, 519 tests 통과(Emulator 전용 7개는 기본 실행에서 skip)
- `npm run test:emulator`: Firestore privacy/economy 7개 통과
- esbuild 브라우저 번들, Functions/백필 스크립트 문법, 영문 동기화, mainnet config 검사 통과
- 390x844 로컬 브라우저에서 v229 로드, 첫 기록 CTA/알림 제거 DOM, 모바일 가로 넘침 없음 확인

## 리뷰

- 첫 기록 결과창은 신규 온보딩이 남긴 `settings.firstRewardPending`이 있는 첫 포인트 기록에만 노출되고, UID별 로컬 마커와 `settings.firstRewardSeenAt` 서버 마커로 한 번만 소비된다. 기존 회원에게는 노출하지 않으며, 가입 선물 행도 `welcomeBonusGiven`이 실제 확인된 경우에만 표시한다.
- 갤러리에는 공유된 식단 사진 슬롯의 표시용 AI 필드만 schema v2로 투영한다. AI 원문, 영양소 원문, 해시, 알 수 없는 필드, 사진 없는 슬롯은 제외한다.
- `hideDiet`는 식단 사진과 AI 분석을 함께 숨긴다. 기존 갤러리 문서는 배포 후 30일 백필로 갱신해야 분석 버튼이 복원된다.
- 로그인 갤러리의 24시간 로컬 캐시도 v2 envelope로 회전하고 UID별 v1 캐시를 제거해, 백필한 AI 분석이 이전 캐시에 가리지 않게 한다.
