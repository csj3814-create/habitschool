import { describe, expect, it } from 'vitest';
import { readAppSource, readFunctionsSource } from './source-helpers.js';

const RUNTIME = readFunctionsSource();
const APP = readAppSource();

// 2026-10-07 제보(스테이징): "운동 영상 ai분석이 너무 오래 걸려서 멈춰 있어. 거의 1분 넘고 있어."
// 그 영상의 모델 응답이 84초였다. 운영의 최근 영상 분석은 모두 6~10초였다.
describe('a slow video analysis asks again instead of hanging, and says it is still working', () => {
    it('cuts the model at 35 s and asks once more, staying inside the old 90 s budget', () => {
        const match = RUNTIME.match(/const EXERCISE_VIDEO_MODEL_ATTEMPT_TIMEOUTS_MS = \[(\d+), (\d+)\];/);
        expect(match).not.toBeNull();
        const [first, second] = [Number(match[1]), Number(match[2])];
        expect(first).toBe(35000);
        expect(first + second).toBeLessThanOrEqual(90000);
        const fn = RUNTIME.split('exports.analyzeExerciseVideo = onCall(')[1].split('\n);\n')[0];
        expect(fn).toContain('for (let attempt = 0; attempt < EXERCISE_VIDEO_MODEL_ATTEMPT_TIMEOUTS_MS.length; attempt += 1) {');
        // 늦어서 끊긴 것만 다시 묻는다. 다른 오류는 그대로 올린다.
        expect(fn).toContain('if (isLast || !String(attemptError?.message || "").includes("_timeout_")) throw attemptError;');
    });

    it('tells the person after 20 s that it is still working, and resets the button after', () => {
        const fn = APP.split('window.analyzeExerciseVideo = async function (')[1].split('\n};\n')[0];
        expect(APP).toContain('const EXERCISE_VIDEO_SLOW_NOTICE_MS = 20000;');
        expect(fn).toContain("'🤖 AI 분석 중… 조금 오래 걸리고 있어요'");
        expect(fn).toContain('window.clearTimeout(slowNoticeTimer);');
        expect(fn).toContain("stillAnalyzingText.startsWith(isEnglishLocale() ? '🤖 Analyzing' : '🤖 AI 분석 중')");
    });
});
