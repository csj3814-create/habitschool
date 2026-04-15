import { describe, expect, it } from 'vitest';
import emailModule from '../functions/reengagement-email.js';

const { buildReEngagementEmailTemplate } = emailModule;

describe('buildReEngagementEmailTemplate', () => {
    it('builds a 3-day inactivity template with the expected CTA and branding', () => {
        const template = buildReEngagementEmailTemplate({
            days: 3,
            name: '해빛',
            appBaseUrl: 'https://habitschool.web.app',
            appIconUrl: 'https://habitschool.web.app/icons/icon-192.svg',
        });

        expect(template.subject).toContain('해빛');
        expect(template.summary).toContain('3일');
        expect(template.html).toContain('지금 기록하러 가기');
        expect(template.html).toContain('https://habitschool.web.app');
        expect(template.method).toBe('gmail_nodemailer');
    });

    it('builds a 7-day inactivity template with the comeback message', () => {
        const template = buildReEngagementEmailTemplate({
            days: 7,
            name: '해빛',
            appBaseUrl: 'https://habitschool.web.app',
            appIconUrl: 'https://habitschool.web.app/icons/icon-192.svg',
        });

        expect(template.subject).toContain('보고 싶어요');
        expect(template.summary).toContain('7일');
        expect(template.html).toContain('해빛스쿨로 돌아가기');
        expect(template.html).toContain('복귀 보너스');
    });
});
