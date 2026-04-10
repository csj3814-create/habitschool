# 2026-04-07 Floating CTA Centering

- [x] 하단 CTA와 카카오 단톡 CTA의 공통 위치 계산 경로 확인
- [x] PWA 설치 배너가 뜰 때 같은 정렬 함수를 다시 타도록 보강
- [x] 위치 기준을 컨테이너 left가 아니라 뷰포트 중심 + 본문 폭 클램프로 통일
- [x] 로컬 검증 실행

## Review

- `submit-bar`, `chat-banner`, `pwa-install-banner` 모두 같은 정렬 함수로 묶음
- 설치 배너 표시/닫기 시점에 위치 보정 재호출 추가
- 기존 갤러리 날짜 그룹핑 수정은 유지
