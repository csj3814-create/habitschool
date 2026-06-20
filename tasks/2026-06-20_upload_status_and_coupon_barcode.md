# 2026-06-20 Upload Status And Coupon Barcode

## Plan
- [x] Trace why completed media saves can still show `일부 업로드 실패`
- [x] Trace the live coupon provider response and recovery path for `provider_coupon_payload_missing`
- [x] Make upload status reflect durable save success, not optional follow-up failures
- [x] Recover issued coupon barcode/PIN data from provider transaction identifiers
- [x] Add regression tests and verify the complete flow

## Notes
- User confirmed the supposedly failed upload was present after refresh.
- A live Mega MGC coffee redemption charged points but rendered `provider_coupon_payload_missing`, no barcode, and no expiry.
- Existing project lessons require separating durable media save success from optional gallery/thumbnail follow-up failures.
- The production failed redemption was created at 2026-06-20 16:32 KST with points charged and a preserved provider transaction ID.
- Giftishow 0201 confirmed there was no issued transaction for that ID.
- The stored Mega MGC goods code was no longer in the live 0101 catalog. The current `(ICE)아메리카노` code is `G00005791059`.
- Reissuing with the same transaction ID and current goods code returned an order number, PIN, and coupon image. The existing redemption was atomically repaired without another point charge.

## Review
- Background media follow-up work is isolated from durable Storage and `daily_logs` persistence.
- If a background job throws, the app rechecks the exact media URL in `daily_logs` before showing a failure.
- Giftishow HTTP 200 payloads now require a successful provider response code.
- Public reward SKUs are reconciled against the current 0101 catalog by provider ID or brand/product/value identity.
- Live redemption is disabled when the provider catalog cannot be confirmed, instead of falling back to a potentially stale goods code.
- Mega MGC and Paikdabang now request image delivery so the vault receives a coupon image when available and still retains the PIN fallback barcode.
- Production and staging `reward_catalog` documents were synchronized to the current provider codes.
- The affected production redemption was recovered with the preserved transaction ID and current Mega MGC code. The existing document now has status `issued`, PIN, barcode image, and expiry without another point charge.
- Verification passed: 45 test files / 333 tests, function syntax checks, browser esbuild bundle, live provider catalog reconciliation, Firestore recovery readback, barcode image HTTP 200, and production page HTTP 200.
- In-app Browser verification was unavailable because its runtime bootstrap did not receive the required sandbox context; no browser interaction was attempted.
