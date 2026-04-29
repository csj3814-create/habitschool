import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminSource = readFileSync(
    path.resolve(__dirname, '../admin.html'),
    'utf8'
);

describe('reward market admin UI copy and actions', () => {
    it('uses provider recheck wording instead of vault wording', () => {
        expect(adminSource).toContain('쿠폰 재조회');
        expect(adminSource).toContain('쿠폰 정보를 다시 조회했습니다.');
        expect(adminSource).not.toContain('쿠폰 재조회 사유를 입력해 주세요.');
    });

    it('renders mode and delivery labels for admin rows', () => {
        expect(adminSource).toContain('getRewardMarketAdminModeLabel');
        expect(adminSource).toContain('getRewardMarketAdminDeliveryLabel');
        expect(adminSource).toContain('isRewardMarketRealIssueRow');
        expect(adminSource).toContain('실발급 완료');
        expect(adminSource).toContain('테스트 완료');
        expect(adminSource).toContain('실발급');
        expect(adminSource).toContain('테스트');
        expect(adminSource).toContain('PIN 보관');
        expect(adminSource).toContain('쿠폰 이미지');
        expect(adminSource).toContain('주문 ${escapeHtml(row.providerOrderId)}');
        expect(adminSource).toContain('TR ${escapeHtml(row.providerTrId)}');
    });

    it('limits recheck actions to rows that still need provider confirmation', () => {
        expect(adminSource).toContain('canRewardMarketAdminRecheck');
        expect(adminSource).toContain("['pending_issue', 'failed_manual_review']");
        expect(adminSource).toContain('isRewardMarketRealIssueRow(row) && !!row.providerTrId && !hasRewardMarketCouponPayload(row)');
    });

    it('does not expose internal quoteVersion strings in the admin row layout', () => {
        expect(adminSource).not.toContain("row.quoteVersion || '-'");
        expect(adminSource).toContain("reason: 'admin_provider_recheck'");
    });

    it('shows real coupon issuance capacity instead of treating the ops floor as a user block', () => {
        expect(adminSource).toContain('최저 매입가');
        expect(adminSource).toContain('실발급 가능');
        expect(adminSource).toContain('사용자 차단 기준');
        expect(adminSource).toContain('공급사 잔액 < 상품 매입가');
        expect(adminSource).toContain('purchasePriceKrw');
        expect(adminSource).not.toContain('비즈머니 최소 기준');
        expect(adminSource).not.toContain("['운영 하한선'");
        expect(adminSource).not.toContain("['HBT 시스템'");
        expect(adminSource).not.toContain("['피드 소스'");
        expect(adminSource).not.toContain("['누적 마진'");
        expect(adminSource).not.toContain('준비금 및 피드');
        expect(adminSource).toContain('<h3>준비금</h3>');
    });
});
