# 2026-04-24 Giftishow Commercial Key Submission Refresh

## Goal
- Refresh the Giftishow commercial-key submission document so it matches the current points-based reward market.
- Produce an upload-ready `docx` package with screen evidence and current service copy.

## Plan
- [x] Inspect the existing submission package and identify outdated HBT-centric copy.
- [x] Rewrite the submission source content for the current points-based coupon redemption flow.
- [x] Regenerate the illustrative submission screens and the final `docx` file.
- [x] Verify that the output files exist and are suitable for upload.

## Review
- Rebuilt the submission package for the current points-based reward market flow while keeping HBT described as a separate asset system.
- Refreshed the illustrative screen assets:
  - `docs/giftishow_submission_reward_market_asset_screen.png`
  - `docs/giftishow_submission_reward_market_coupon_screen.png`
  - `docs/giftishow_submission_reward_market_admin_screen.png`
- Regenerated the upload-ready document:
  - `docs/giftishow_submission_commercial_key_package_ko.docx`
- Regenerated the source summary note:
  - `docs/giftishow_submission_commercial_key_package_ko.md`
- Verification:
  - `node scripts/generate-giftishow-submission-screens.js`
  - `python scripts/build-giftishow-submission-docx.py`
  - reopened the generated `docx` with `python-docx` and confirmed the leading paragraphs and file metadata.
