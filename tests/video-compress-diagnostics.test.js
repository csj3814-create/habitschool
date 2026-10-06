import { describe, expect, it } from 'vitest';
import { formatVideoCompressDiagnostics } from '../js/video-compress.js';
import { readRepoFile } from './source-helpers.js';

const SRC = readRepoFile('js/video-compress.js');

// 2026-10-01 제보(정명희 님): 15.9초 영상의 사본이 11.3초로 나왔는데 왜인지 알 길이
// 없었다. 실패할 때 원인을 가를 수 있는 것들을 한 줄로 남긴다.
describe('a failed re-encode says why, so the next report can tell causes apart', () => {
    it('writes one line with how it stopped, what the app and the player did, and the device', () => {
        const line = formatVideoCompressDiagnostics({
            reason: 'truncated', stopReason: 'ended', durationMs: 15900, outputMs: 11308.4,
            playedMs: 15900, wallMs: 16400, hiddenCount: 1, hiddenMs: 4200, waitingCount: 2, pauseCount: 0,
            chunkCount: 1, sourceBytes: 31 * 1024 * 1024, outputBytes: 3 * 1024 * 1024,
            width: 1920, height: 1080, bitrate: 2000000, mimeType: 'video/mp4', cores: 8, memoryGb: 4
        });
        expect(JSON.parse(line)).toEqual({
            reason: 'truncated', stop: 'ended', srcMs: 15900, outMs: 11308, playedMs: 15900, wallMs: 16400,
            hiddenCount: 1, hiddenMs: 4200, waiting: 2, pauses: 0, chunks: 1, srcMB: 31, outMB: 3,
            size: '1920x1080', kbps: 2000, mime: 'video/mp4', cores: 8, memGB: 4
        });
    });

    it('logs it on every way the copy can fail, as a warning the bug report carries', () => {
        expect(SRC).toContain("console.warn('[video] 재인코딩 진단 ' + formatVideoCompressDiagnostics(diag));");
        for (const reason of ["reportFailure('empty_output')", "reportFailure(probed ? 'truncated' : 'unreadable_output'", "reportFailure('exception'"]) {
            expect(SRC, reason).toContain(reason);
        }
        // 화면을 벗어났는지, 어떻게 멈췄는지를 센다.
        expect(SRC).toContain("document.addEventListener('visibilitychange', onVisibility);");
        expect(SRC).toContain("document.removeEventListener('visibilitychange', onVisibility);");
        expect(SRC).toContain("diag.stopReason = diag.stopReason || 'ended';");
        expect(SRC).toContain("diag.stopReason = diag.stopReason || 'timeout';");
    });
});
