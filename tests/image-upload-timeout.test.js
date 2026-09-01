import { describe, expect, it } from 'vitest';
import { getResumableUploadTimeouts } from '../js/upload-performance.js';
import { readRepoFile } from './source-helpers.js';

const MB = 1024 * 1024;

// 2026-08-31 제보: 식사 사진 두 장 중 한 장만 올라가고 나머지는 "로딩만" 남았다.
// 콘솔에는 `upload/timeout 업로드 연결이 멈췄어요` 가 아홉 번(3회 × 3세트) 찍혀 있었다.
// 사진의 제한 시간은 60초/30초 고정이었고, 그 값은 빠른 업링크를 가정한 값이다.
describe('사진도 크기에 따라 시간을 받는다', () => {
    it('작은 사진에도 30초보다 넉넉한 바닥을 준다', () => {
        const t = getResumableUploadTimeouts({ type: 'image/jpeg', size: 120 * 1024 });
        expect(t.idleTimeoutMs).toBeGreaterThanOrEqual(60 * 1000);
        expect(t.hardTimeoutMs).toBeGreaterThanOrEqual(3 * 60 * 1000);
    });

    it('큰 사진은 더 오래 기다린다', () => {
        const small = getResumableUploadTimeouts({ type: 'image/jpeg', size: 1 * MB });
        const big = getResumableUploadTimeouts({ type: 'image/jpeg', size: 4 * MB });
        expect(big.hardTimeoutMs).toBeGreaterThan(small.hardTimeoutMs);
        expect(big.idleTimeoutMs).toBeGreaterThan(small.idleTimeoutMs);
    });

    it('아무리 커도 상한이 있다', () => {
        const huge = getResumableUploadTimeouts({ type: 'image/jpeg', size: 200 * MB });
        expect(huge.hardTimeoutMs).toBe(6 * 60 * 1000);
        expect(huge.idleTimeoutMs).toBe(2 * 60 * 1000);
    });

    it('영상 기준은 건드리지 않는다', () => {
        // 20MB → 하드 20×12초=240초지만 바닥이 5분, 유휴 20×4초=80초지만 바닥이 90초.
        const video = getResumableUploadTimeouts({ type: 'video/mp4', size: 20 * MB });
        expect(video.hardTimeoutMs).toBe(5 * 60 * 1000);
        expect(video.idleTimeoutMs).toBe(90 * 1000);
        expect(video.finalizeTimeoutMs).toBe(30 * 1000);
    });

    it('형식을 모르면 사진 기준으로 본다', () => {
        const unknown = getResumableUploadTimeouts({ size: 1 * MB });
        expect(unknown.idleTimeoutMs).toBe(60 * 1000);
    });
});

describe('멈췄다고 말하려면 먼저 움직이는 걸 봤어야 한다', () => {
    const APP = readRepoFile('js/app-core.js');
    const fn = APP.split('function runResumableUploadWithTimeout(storageRef, file, {')[1].split('\n}\n')[0];

    it('시작하자마자 유휴 시계를 돌리지 않는다', () => {
        // 첫 보고 전 구간은 멈춘 게 아니라 시작하는 중이다. 여기서 끊으면
        // 재시도해도 같은 자리에서 또 끊긴다.
        const hardTimerAt = fn.indexOf('hardTimer = setTimeout(');
        const firstReset = fn.indexOf('resetIdleTimer();', hardTimerAt);
        const progressHandlerAt = fn.indexOf("uploadTask.on(");
        expect(hardTimerAt).toBeGreaterThan(-1);
        expect(progressHandlerAt).toBeGreaterThan(-1);
        // 유일하게 남은 resetIdleTimer() 호출은 진행 핸들러 안에 있어야 한다.
        expect(firstReset).toBeGreaterThan(progressHandlerAt);
    });

    it('진행이 있을 때만 유휴 시계를 다시 감는다', () => {
        expect(fn).toContain('if (bytesTransferred > lastBytesTransferred) {');
        expect(fn).toContain('resetIdleTimer();');
    });

    it('시작 구간도 무한정은 아니다', () => {
        // 유휴 시계가 없는 동안은 hardTimer 가 유일한 상한이다.
        expect(fn).toContain("cancelWithMessage('업로드가 너무 오래 걸려 중단됐어요");
    });
});
