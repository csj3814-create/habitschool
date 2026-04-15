import { describe, expect, it } from 'vitest';
import { normalizeAdminEmailLog } from '../js/admin-utils.js';

describe('normalizeAdminEmailLog', () => {
    it('merges stored day details with recent history', () => {
        const normalized = normalizeAdminEmailLog({
            sentCount: 2,
            reEngagementByDays: {
                day3: {
                    days: 3,
                    sentAt: '2026-04-15T01:00:00Z',
                    recipientEmail: 'user@example.com',
                    method: 'gmail_nodemailer',
                    subject: '3일 제목',
                    html: '<p>3일 본문</p>',
                    summary: '3일 요약',
                },
            },
            reEngagementHistory: [
                {
                    days: 7,
                    sentAt: '2026-04-15T03:00:00Z',
                    recipientEmail: 'user@example.com',
                    method: 'gmail_nodemailer',
                    subject: '7일 제목',
                    html: '<p>7일 본문</p>',
                    summary: '7일 요약',
                },
            ],
        }, { email: 'fallback@example.com' });

        expect(normalized.sentCount).toBe(2);
        expect(normalized.byDays.day3.subject).toBe('3일 제목');
        expect(normalized.byDays.day7.subject).toBe('7일 제목');
        expect(normalized.history[0].days).toBe(7);
    });

    it('creates a legacy fallback entry when only old lastSent fields exist', () => {
        const normalized = normalizeAdminEmailLog({
            sentCount: 1,
            lastSentAt: { seconds: 1713168000, nanoseconds: 0 },
            lastSentDays: 3,
        }, { email: 'legacy@example.com' });

        expect(normalized.byDays.day3).toBeTruthy();
        expect(normalized.byDays.day3.recipientEmail).toBe('legacy@example.com');
        expect(normalized.byDays.day3.legacy).toBe(true);
        expect(normalized.history[0].days).toBe(3);
    });

    it('keeps normalized logs stable when they are normalized again', () => {
        const once = normalizeAdminEmailLog({
            reEngagementByDays: {
                day3: {
                    days: 3,
                    sentAt: '2026-04-15T01:00:00Z',
                    recipientEmail: 'user@example.com',
                    method: 'gmail_nodemailer',
                    subject: '3일 메일',
                    html: '<p>본문</p>',
                    summary: '요약',
                },
            },
            reEngagementHistory: [
                {
                    days: 7,
                    sentAt: '2026-04-15T03:00:00Z',
                    recipientEmail: 'user@example.com',
                    method: 'gmail_nodemailer',
                    subject: '7일 메일',
                    html: '<p>본문</p>',
                    summary: '요약',
                },
            ],
        }, { email: 'fallback@example.com' });

        const twice = normalizeAdminEmailLog(once, { email: 'fallback@example.com' });

        expect(twice.byDays.day3.subject).toBe('3일 메일');
        expect(twice.byDays.day7.subject).toBe('7일 메일');
        expect(twice.history).toHaveLength(2);
    });
});
