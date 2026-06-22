import { describe, expect, it } from 'vitest';
import {
    filterAdminAssetRows,
    filterAdminRowsByName,
    getAdminPaginationState,
    normalizeAdminEmailLog,
} from '../js/admin-utils.js';

describe('admin asset table helpers', () => {
    const rows = [
        { name: '최석재', coins: 1200 },
        { name: '윤효은', coins: 950 },
        { name: '최윤서', coins: 800 },
    ];

    it('returns only names matching a trimmed, case-insensitive search term', () => {
        expect(filterAdminAssetRows(rows, '  최  ').map((row) => row.name)).toEqual([
            '최석재',
            '최윤서',
        ]);
        expect(filterAdminAssetRows(rows, '효은').map((row) => row.name)).toEqual([
            '윤효은',
        ]);
        expect(filterAdminRowsByName(rows, '윤').map((row) => row.name)).toEqual([
            '윤효은',
            '최윤서',
        ]);
    });

    it('clamps direct page jumps to the available page range', () => {
        expect(getAdminPaginationState(45, 20, 1)).toMatchObject({
            totalPages: 3,
            pageIndex: 1,
            start: 20,
        });
        expect(getAdminPaginationState(45, 20, 99)).toMatchObject({
            totalPages: 3,
            pageIndex: 2,
            start: 40,
        });
        expect(getAdminPaginationState(0, 20, -3)).toMatchObject({
            totalPages: 1,
            pageIndex: 0,
            start: 0,
        });
    });
});

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
