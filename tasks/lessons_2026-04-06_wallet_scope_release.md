# 2026-04-06 배포 범위 교훈

- 사용자가 배포 범위를 `MetaMask / Trust Wallet만`으로 정하면, 미완성 `WalletConnect` UI는 staging 전에 반드시 숨긴다.
- 연결형 기능은 `설정만 없는 버튼` 상태로 노출하지 않는다. 부분 구현은 내부 코드에 남겨도, 사용자 UI에는 배포하지 않는다.
- worktree 정리 요청을 받으면 `.claude`, `.firebase/hosting..cache` 같은 로컬 도구 파일은 배포 커밋에서 제외하고 서비스 파일만 선별한다.
