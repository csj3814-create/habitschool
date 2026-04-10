# 2026-04-07 Floating CTA Centering Lessons

- 고정 하단 바 정렬을 `app-container`의 `left`에 의존하면 브라우저 확대/레이아웃 변화에서 어긋날 수 있다.
- 하단 CTA, 카카오 배너, 설치 배너처럼 같은 역할의 고정 바는 위치 계산 함수를 공유해야 한다.
- `beforeinstallprompt`처럼 배너가 늦게 나타나는 UI는 `resize`만 기다리지 말고 표시 시점에도 위치 보정을 직접 호출해야 한다.
