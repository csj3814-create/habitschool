# 2026-04-06 MetaMask 모바일 브라우저 교훈

- MetaMask 앱 안 브라우저에서 이미 열린 상태라면 `metamask.app.link` 같은 외부 앱 deep link를 다시 열면 안 된다.
- injected provider는 모바일에서 지연 주입될 수 있으므로 버튼 클릭 직후 즉시 `window.ethereum`만 보고 실패 처리하지 말고 짧게 대기해야 한다.
- 외부 지갑 연결 버튼은 `설치 링크 이동`과 `앱 내 브라우저 연결`을 같은 fallback으로 처리하면 안 된다.
