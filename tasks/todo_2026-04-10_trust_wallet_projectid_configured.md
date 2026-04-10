# 2026-04-10 Trust Wallet projectId configured

## Summary
- Reown projectId `0d60d22978143c659db19c0ba7852994` was added to `TRUST_WALLET_CONNECT`.
- Trust Wallet mobile connection no longer depends on the missing-projectId fallback path.
- MetaMask Connect and Trust Wallet WalletConnect are now both configured in code.

## Files
- `js/blockchain-config.js`

## Next verification
- Test on a real mobile device from Chrome or Safari.
- Tap `Trust Wallet 연결`.
- Confirm the app opens Trust Wallet, requests approval, and returns with the wallet connected.

