import { describe, expect, it } from 'vitest';

import {
    createSequentialTaskQueue,
    getResumableUploadTimeouts,
    shouldFastPathImageCompression
} from '../js/upload-performance.js';

describe('createSequentialTaskQueue', () => {
    it('runs photo and video work in FIFO order with only one active task', async () => {
        const queue = createSequentialTaskQueue();
        const started = [];
        const finished = [];
        let activeCount = 0;
        let maxActiveCount = 0;

        const createTask = (name, delay) => queue.enqueue(async () => {
            started.push(name);
            activeCount += 1;
            maxActiveCount = Math.max(maxActiveCount, activeCount);
            await new Promise((resolve) => setTimeout(resolve, delay));
            activeCount -= 1;
            finished.push(name);
            return name;
        });

        const results = await Promise.all([
            createTask('photo-1', 12),
            createTask('photo-2', 2),
            createTask('video-1', 1)
        ]);

        expect(results).toEqual(['photo-1', 'photo-2', 'video-1']);
        expect(started).toEqual(['photo-1', 'photo-2', 'video-1']);
        expect(finished).toEqual(['photo-1', 'photo-2', 'video-1']);
        expect(maxActiveCount).toBe(1);
        expect(queue.pendingCount).toBe(0);
    });

    it('continues with the next file after one queued task rejects', async () => {
        const queue = createSequentialTaskQueue();
        const events = [];

        const failed = queue.enqueue(async () => {
            events.push('failed-start');
            throw new Error('transient upload failure');
        });
        const recovered = queue.enqueue(async () => {
            events.push('next-start');
            return 'saved';
        });

        await expect(failed).rejects.toThrow('transient upload failure');
        await expect(recovered).resolves.toBe('saved');
        expect(events).toEqual(['failed-start', 'next-start']);
        expect(queue.pendingCount).toBe(0);
    });
});

describe('shouldFastPathImageCompression', () => {
    it('keeps smaller jpeg uploads on the fast path', () => {
        expect(shouldFastPathImageCompression({
            type: 'image/jpeg',
            size: Math.round(1.2 * 1024 * 1024)
        }, {
            maxWidth: 640,
            maxHeight: 640,
            quality: 0.6
        })).toBe(true);
    });

    it('does not skip conversion for HEIC uploads', () => {
        expect(shouldFastPathImageCompression({
            type: 'image/heic',
            size: Math.round(0.8 * 1024 * 1024)
        }, {
            maxWidth: 640,
            maxHeight: 640,
            quality: 0.6
        })).toBe(false);
    });

    it('keeps larger or analysis-target images on the compression path', () => {
        expect(shouldFastPathImageCompression({
            type: 'image/jpeg',
            size: Math.round(2.5 * 1024 * 1024)
        }, {
            maxWidth: 640,
            maxHeight: 640,
            quality: 0.6
        })).toBe(false);

        expect(shouldFastPathImageCompression({
            type: 'image/jpeg',
            size: Math.round(1.2 * 1024 * 1024)
        }, {
            maxWidth: 1280,
            maxHeight: 1280,
            quality: 0.82
        })).toBe(false);
    });
});

describe('getResumableUploadTimeouts', () => {
    it('keeps image uploads on a short photo-oriented budget', () => {
        const timeouts = getResumableUploadTimeouts({
            type: 'image/jpeg',
            size: Math.round(2 * 1024 * 1024)
        });

        expect(timeouts).toEqual({
            hardTimeoutMs: 60 * 1000,
            idleTimeoutMs: 30 * 1000,
            finalizeTimeoutMs: 10 * 1000
        });
    });

    it('gives video uploads a mobile-friendly progress-aware budget', () => {
        const timeouts = getResumableUploadTimeouts({
            type: 'video/mp4',
            size: Math.round(40 * 1024 * 1024)
        });

        expect(timeouts.hardTimeoutMs).toBeGreaterThanOrEqual(8 * 60 * 1000);
        expect(timeouts.idleTimeoutMs).toBeGreaterThanOrEqual(90 * 1000);
        expect(timeouts.finalizeTimeoutMs).toBe(30 * 1000);
    });

    it('caps very large video timeout budgets', () => {
        const timeouts = getResumableUploadTimeouts({
            type: 'video/mp4',
            size: Math.round(150 * 1024 * 1024)
        });

        expect(timeouts.hardTimeoutMs).toBe(20 * 60 * 1000);
        expect(timeouts.idleTimeoutMs).toBe(3 * 60 * 1000);
    });
});
