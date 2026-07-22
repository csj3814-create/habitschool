import { describe, expect, it } from 'vitest';
import {
    collectAdminDailyLogAnalyses,
    collectAdminDailyLogMedia,
    filterAdminAssetRows,
    filterAdminMemberRows,
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

    it('matches members by either name or email without changing other admin filters', () => {
        const members = [
            { name: '최석재', email: 'Doctor.CSJ@example.com' },
            { name: '윤효은', email: 'hello@example.net' },
        ];

        expect(filterAdminMemberRows(members, '  doctor.csj@EXAMPLE  ')).toEqual([members[0]]);
        expect(filterAdminMemberRows(members, '효은')).toEqual([members[1]]);
        expect(filterAdminRowsByName(members, 'example')).toEqual([]);
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

describe('admin daily log detail helpers', () => {
    const storageUrl = (path) => `https://firebasestorage.googleapis.com/v0/b/demo/o/${encodeURIComponent(path)}?alt=media`;

    it('collects current and legacy record media with thumbnails and removes duplicate originals', () => {
        const duplicatedExerciseUrl = storageUrl('exercise/run.jpg');
        const media = collectAdminDailyLogMedia({
            diet: {
                breakfastUrl: storageUrl('diet/breakfast.jpg'),
                breakfastThumbUrl: storageUrl('diet/thumb-breakfast.jpg'),
            },
            exercise: {
                cardioList: [{
                    imageUrl: duplicatedExerciseUrl,
                    imageThumbUrl: storageUrl('exercise/thumb-run.jpg'),
                }],
                cardioImageUrl: duplicatedExerciseUrl,
                strengthList: [{
                    videoUrl: storageUrl('exercise/squat.mp4'),
                    videoThumbUrl: storageUrl('exercise/thumb-squat.jpg'),
                }],
            },
            steps: { screenshotUrl: storageUrl('steps/today.jpg') },
            sleepAndMind: {
                sleepImageUrl: storageUrl('sleep/today.jpg'),
                sleepImageThumbUrl: storageUrl('sleep/thumb-today.jpg'),
            },
        });

        expect(media.map((item) => item.label)).toEqual([
            '아침 식단',
            '유산소 1',
            '근력 운동 1',
            '걸음수 캡처',
            '수면·마음 기록',
        ]);
        expect(media.find((item) => item.label === '근력 운동 1')).toMatchObject({ kind: 'video' });
        expect(media.filter((item) => item.url === duplicatedExerciseUrl)).toHaveLength(1);
    });

    it('returns only allowlisted stored analysis fields and never exposes raw model data', () => {
        const analyses = collectAdminDailyLogAnalyses({
            dietAnalysis: {
                breakfast: {
                    grade: 'A',
                    summary: '채소가 충분합니다.',
                    foods: [{ name: '토마토', category: 'natural' }],
                    raw: 'do not expose',
                    prompt: 'private prompt',
                },
            },
            exercise: {
                cardioList: [{
                    aiAnalysis: {
                        intensity: '중강도',
                        feedback: '꾸준히 이어가세요.',
                        unknown: 'hidden',
                    },
                }],
            },
            steps: {
                screenshotUrl: storageUrl('steps/today.jpg'),
                count: 9132,
                distance_km: 6.2,
                imageHash: 'never expose this hash',
            },
            sleepAndMind: {
                sleepAnalysis: {
                    grade: 'B',
                    summary: '수면 시간이 안정적입니다.',
                    details: { sleepDuration: '7시간 20분' },
                    raw: 'hidden',
                },
            },
        });
        const serialized = JSON.stringify(analyses);

        expect(analyses.map((item) => item.kind)).toEqual(['diet', 'exercise', 'sleep', 'steps']);
        expect(serialized).toContain('채소가 충분합니다.');
        expect(serialized).toContain('9132보');
        expect(serialized).not.toContain('do not expose');
        expect(serialized).not.toContain('private prompt');
        expect(serialized).not.toContain('never expose this hash');
        expect(serialized).not.toContain('unknown');
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
