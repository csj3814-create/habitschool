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
    it('scales the photo budget with size instead of a fixed one-minute cap', () => {
        // 60초/30초 고정은 빠른 업링크를 가정한 값이었고, 느린 회선에서 같은 사진이
        // 세 번 연속 유휴 제한에 걸려 버려졌다. tests/image-upload-timeout.test.js 참고.
        const timeouts = getResumableUploadTimeouts({
            type: 'image/jpeg',
            size: Math.round(2 * 1024 * 1024)
        });

        expect(timeouts).toEqual({
            hardTimeoutMs: 3 * 60 * 1000,
            idleTimeoutMs: 90 * 1000,
            finalizeTimeoutMs: 15 * 1000
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

describe('대기 순번 알림', () => {
    // 삼성 인터넷 제보: 영상 세 개를 고르면 뒤의 파일이
    // '업로드 대기 중 · 앞 파일부터 저장할게요' 에서 멈춘 것처럼 보였다.
    // 앞의 업로드가 진행 이벤트를 전혀 주지 않는 단순 PUT 이라, 순번마저
    // 갱신되지 않으면 화면이 몇 분 동안 한 글자도 안 바뀐다.
    it('큐가 줄어들 때마다 남은 항목에 새 순번을 알린다', async () => {
        const queue = createSequentialTaskQueue();
        const seen = { B: [], C: [] };
        const gate = [];
        const hold = () => new Promise((resolve) => gate.push(resolve));
        // enqueue 는 다음 마이크로태스크에서야 task 를 실행한다.
        const untilGate = async (n) => { while (gate.length < n) await Promise.resolve(); };

        const a = queue.enqueue(hold, { onQueued: () => {} });
        const b = queue.enqueue(hold, { onQueued: (ahead) => seen.B.push(ahead) });
        const c = queue.enqueue(hold, { onQueued: (ahead) => seen.C.push(ahead) });

        // 처음 줄 섰을 때: B 앞에 1개, C 앞에 2개
        expect(seen.B).toEqual([1]);
        expect(seen.C).toEqual([2]);

        await untilGate(1);
        gate.shift()();            // A 끝 → B 시작
        await a;
        await untilGate(1);
        expect(seen.C).toEqual([2, 1]);   // C 의 순번이 줄어야 한다

        gate.shift()();
        await b;
        await untilGate(1);
        gate.shift()();
        await c;
    });

    it('앞이 실패해도 뒤 항목의 순번은 갱신된다', async () => {
        const queue = createSequentialTaskQueue();
        const ahead = [];
        const failing = queue.enqueue(async () => { throw new Error('boom'); });
        const next = queue.enqueue(async () => 'ok', { onQueued: (n) => ahead.push(n) });

        await expect(failing).rejects.toThrow('boom');
        await expect(next).resolves.toBe('ok');
        expect(ahead[0]).toBe(1);
    });

    it('혼자면 대기 알림을 보내지 않는다', async () => {
        const queue = createSequentialTaskQueue();
        const ahead = [];
        await queue.enqueue(async () => 'only', { onQueued: (n) => ahead.push(n) });
        expect(ahead).toEqual([]);
    });
});
