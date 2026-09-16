import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME = readFileSync(resolve(ROOT_DIR, 'functions/runtime.js'), 'utf8');
const VIDEO_FN = RUNTIME.split('exports.analyzeExerciseVideo = onCall(')[1].split('\n);')[0];

// 2026-09-16 제보: "운동 영상 올렸는데 AI 분석에 실패라고 나옴"
//   클라이언트 콘솔: Exercise video analysis error: FirebaseError: internal
//   서버 로그: [analyzeExerciseVideo] 영상 확보 { bytes: 9927933 }
//              'Memory limit of 256 MiB exceeded with 260 MiB used'
//
// 허용 상한은 15MB 인데 함수 메모리는 기본값 256MiB 였다. 영상을 base64 로
// 인라인해 보내는 구조라 원본 버퍼 + base64 문자열 + 요청 본문이 함께 살아 있고,
// 9.9MB 가 260MiB 를 썼다. 상한과 메모리가 서로 안 맞았다.
describe('a video within the allowed size fits in the memory we gave it', () => {
    it('no longer runs on the 256 MiB default', () => {
        expect(VIDEO_FN).toContain('memory: "1GiB"');
    });

    it('still accepts a 15MB video — the cap is what the members film against', () => {
        // 상한을 낮춰 해결하면 10초 하이퍼랩스가 거절당한다. 메모리를 맞추는 쪽이다.
        expect(RUNTIME).toContain('const EXERCISE_VIDEO_MAX_BYTES = 15 * 1024 * 1024;');
    });

    it('keeps the memory above what the cap actually costs', () => {
        // 측정: 9.9MB → 260MiB. Node 기본 ~80MiB 를 빼면 영상 크기의 약 18배다.
        // 상한 15MB 면 15 × 18 + 80 ≈ 350MiB — 512MiB 로는 빠듯하다.
        const CAP_MB = 15;
        const MEASURED_RATIO = 18;
        const NODE_BASELINE_MB = 80;
        const needed = CAP_MB * MEASURED_RATIO + NODE_BASELINE_MB;
        const configured = 1024;
        expect(configured).toBeGreaterThan(needed);
    });

    it('sends the video inline, which is why the size matters at all', () => {
        // 이 구조가 바뀌면(예: Files API 업로드) 위 계산도 다시 해야 한다.
        expect(VIDEO_FN).toContain('inlineData');
        expect(VIDEO_FN).toContain('videoBuffer.toString("base64")');
    });

    it('leaves the image analyzers alone — they never carry 15MB', () => {
        // 사진은 클라이언트에서 압축돼 올라온다. 이번 제보와 규모가 다르다.
        const dietFn = RUNTIME.split('exports.analyzeDiet = onCall(')[1].split('\n);')[0];
        expect(dietFn).not.toContain('memory:');
    });
});
