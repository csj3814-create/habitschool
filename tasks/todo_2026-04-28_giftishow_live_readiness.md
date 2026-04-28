# 2026-04-28 Giftishow Live Readiness

## Checklist

- [x] Confirm current working tree and avoid committing secret values.
- [x] Update Giftishow catalog parsing for the documented `result.goodsList` response.
- [x] Prefer documented `goodsCode` over numeric `goodsNo` for provider goods IDs.
- [x] Map documented price and validity fields into reward catalog items.
- [x] Add regression tests for the 0101 sample shape.
- [x] Move project dotenv files out of Git tracking before writing live Giftishow values.
- [x] Set local staging/prod Giftishow callback number and user id.
- [x] Verify Giftishow read APIs with the real local config.
- [x] Switch Giftishow requests to form-urlencoded, matching the live API behavior.
- [x] Run `npm test`.
- [x] Run the esbuild browser bundle check.

## Review

- Giftishow 0101 parsing now accepts `result.goodsList` and `data.goodsList`.
- Catalog mapping now uses `goodsCode` before `goodsNo`, maps `salePrice` as face value, `discountPrice` as purchase price, `limitDay` as validity days, `goodsStateCd=SALE` as available, and brand/product image fields from the PDF.
- `functions/.env.reward-market-live.example` now uses a short MMS title (`해빛쿠폰`) that fits the API title limit.
- Project env files `functions/.env.habitschool-8497b` and `functions/.env.habitschool-staging` were removed from Git tracking and ignored before local live Giftishow values were written.
- Real Giftishow config is present in local staging/prod dotenv files only. Git diff does not include those secret values.
- JSON POST returned `ERR0201 Required value is missing`; form-urlencoded POST returned `0000` for both goods and bizmoney, so the adapter now defaults to form bodies.
- Live read verification: 0101 goods returned `0000` with 2308 items, and 0301 bizmoney returned `0000` with a balance field.
- Verification: targeted reward-market test, full `npm test`, `node -c functions/reward-market.js`, direct adapter read calls, and esbuild browser bundle check all passed.
