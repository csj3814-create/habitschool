import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const guestActivity = require('../functions/guest-activity.js');

describe('guest activity KST window', () => {
    it('uses an inclusive seven-day KST calendar window', () => {
        expect(guestActivity.getGuestActivityWindow(new Date('2026-07-09T15:00:00.000Z')))
            .toEqual({
                windowDays: 7,
                startDate: '2026-07-04',
                endDate: '2026-07-10',
            });
    });

    it('changes dates at KST midnight rather than UTC midnight', () => {
        expect(guestActivity.getGuestActivityWindow(new Date('2026-07-09T14:59:59.999Z')))
            .toEqual({
                windowDays: 7,
                startDate: '2026-07-03',
                endDate: '2026-07-09',
            });
    });
});

describe('guest activity input normalization and aggregation', () => {
    it('keeps only an owner uid and valid date in memory', () => {
        expect(guestActivity.normalizeDailyLogActivityInput({
            data: () => ({
                userId: '  owner-a  ',
                date: '2026-07-10',
                weight: 72,
                gratitude: 'private text',
                mediaUrl: 'https://private.example/photo.jpg',
            }),
        })).toEqual({ ownerUid: 'owner-a', date: '2026-07-10' });

        expect(guestActivity.normalizeDailyLogActivityInput({ userId: '', date: '2026-07-10' }))
            .toBeNull();
        expect(guestActivity.normalizeDailyLogActivityInput({ userId: 'owner-a', date: '2026-02-31' }))
            .toBeNull();
    });

    it('deduplicates an owner-day and ignores invalid or out-of-window rows', () => {
        const rows = [
            { userId: 'owner-a', date: '2026-07-04' },
            { userId: 'owner-a', date: '2026-07-04' },
            { userId: 'owner-a', date: '2026-07-10' },
            { data: () => ({ userId: 'owner-b', date: '2026-07-08' }) },
            { userId: 'owner-c', date: '2026-07-03' },
            { userId: 'owner-d', date: '2026-07-11' },
            { userId: null, date: '2026-07-09' },
        ];

        expect(guestActivity.aggregateDailyLogActivity(rows, {
            startDate: '2026-07-04',
            endDate: '2026-07-10',
        })).toEqual({ recordCount: 3, activeUserCount: 2 });
    });
});

describe('privacy-safe guest activity document', () => {
    it.each([
        [0, null],
        [9, null],
        [10, '10+'],
        [24, '10+'],
        [25, '25+'],
        [50, '50+'],
        [249, '100+'],
        [250, '250+'],
        [500, '500+'],
        [999999, '500+'],
    ])('maps %i to the approved bucket %s', (count, bucket) => {
        expect(guestActivity.bucketActivityCount(count)).toBe(bucket);
    });

    it('suppresses both counts below the ten-active-user privacy threshold', () => {
        expect(guestActivity.buildGuestActivityDocument({
            recordCount: 999,
            activeUserCount: 9,
            updatedAt: 'timestamp',
        })).toEqual({
            windowDays: 7,
            recordCountBucket: null,
            activeUserCountBucket: null,
            updatedAt: 'timestamp',
        });
    });

    it('returns exactly the four allowlisted public fields and coarse buckets', () => {
        const result = guestActivity.buildGuestActivityDocument({
            recordCount: 287,
            activeUserCount: 63,
            updatedAt: 'timestamp',
        });

        expect(Object.keys(result).sort()).toEqual([
            'activeUserCountBucket',
            'recordCountBucket',
            'updatedAt',
            'windowDays',
        ]);
        expect(result).toEqual({
            windowDays: 7,
            recordCountBucket: '250+',
            activeUserCountBucket: '50+',
            updatedAt: 'timestamp',
        });
        expect(result).not.toHaveProperty('recordCount');
        expect(result).not.toHaveProperty('activeUserCount');
        expect(result).not.toHaveProperty('userIds');
    });
});

describe('updateGuestActivity', () => {
    it('reads the private range and overwrites only privacy-safe buckets', async () => {
        const where = vi.fn();
        const get = vi.fn().mockResolvedValue({
            docs: Array.from({ length: 12 }, (_, index) => ({
                data: () => ({
                    userId: `private-owner-${index}`,
                    date: index < 2 ? '2026-07-09' : '2026-07-10',
                    bloodGlucose: 100 + index,
                    diary: `private-entry-${index}`,
                }),
            })),
        });
        const query = { where, get };
        where.mockReturnValue(query);

        const set = vi.fn().mockResolvedValue(undefined);
        const doc = vi.fn().mockReturnValue({ set });
        const collection = vi.fn().mockReturnValue(query);
        const db = { collection, doc };
        const serverTimestamp = vi.fn().mockReturnValue({ serverTimestamp: true });

        const result = await guestActivity.updateGuestActivity({
            db,
            serverTimestamp,
            now: new Date('2026-07-10T03:00:00.000Z'),
        });

        expect(collection).toHaveBeenCalledWith('daily_logs');
        expect(where).toHaveBeenNthCalledWith(1, 'date', '>=', '2026-07-04');
        expect(where).toHaveBeenNthCalledWith(2, 'date', '<=', '2026-07-10');
        expect(doc).toHaveBeenCalledWith('public_stats/guest_activity');
        expect(set).toHaveBeenCalledTimes(1);
        expect(set).toHaveBeenCalledWith({
            windowDays: 7,
            recordCountBucket: '10+',
            activeUserCountBucket: '10+',
            updatedAt: { serverTimestamp: true },
        });
        expect(result).toEqual(set.mock.calls[0][0]);

        const serialized = JSON.stringify(set.mock.calls[0][0]);
        expect(serialized).not.toContain('private-owner');
        expect(serialized).not.toContain('bloodGlucose');
        expect(serialized).not.toContain('private-entry');
        expect(set.mock.calls[0]).toHaveLength(1);
    });

    it('requires an Admin Firestore interface', async () => {
        await expect(guestActivity.updateGuestActivity())
            .rejects.toThrow('Admin Firestore db interface is required');
    });
});
