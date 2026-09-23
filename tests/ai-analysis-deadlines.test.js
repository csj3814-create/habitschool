import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const runtime = read('functions/runtime.js');

// 2026-09-14: 운동 AI 분석이 '분석 중...' 에서 멈췄다. 로그를 심고 보니 이미지
// 내려받기 0.7초, 모델 응답 3.6초로 멀쩡했다 — 그때 60초를 먹은 곳은 모델 호출
// 쪽이었고 거기엔 마감선이 없어, 함수가 죽을 때까지 아무 말도 못 했다.
// 원인은 재현되지 않았다. 그래서 원인 대신 침묵을 고쳤고, 같은 구조인 나머지
// 분석 함수에도 함께 걸었다. (tasks/lessons.md 257)
const AI_FUNCTIONS = [
    { name: 'analyzeExercise', label: 'exercise_model', budget: 'AI_MODEL_TIMEOUT_MS' },
    { name: 'analyzeDiet', label: 'analyzeDiet_model', budget: 'AI_MODEL_TIMEOUT_MS' },
    { name: 'analyzeSleepMind', label: 'analyzeSleepMind_model', budget: 'AI_MODEL_TIMEOUT_MS' },
    { name: 'analyzeStepScreenshot', label: 'analyzeStepScreenshot_model', budget: 'AI_MODEL_TIMEOUT_MS' },
    { name: 'analyzeBloodTest', label: 'analyzeBloodTest_model', budget: 'AI_MODEL_TIMEOUT_MS' },
    { name: 'analyzeBodyComposition', label: 'analyzeBodyComposition_model', budget: 'AI_MODEL_TIMEOUT_MS' },
    { name: 'classifySharedHealthImage', label: 'classifySharedHealthImage_model', budget: 'AI_MODEL_FAST_TIMEOUT_MS' }
];

const bodyOf = (name) => runtime.split(`exports.${name} = onCall(`)[1].split('\n);\n')[0];
const timeoutSecondsOf = (name) => Number(bodyOf(name).match(/timeoutSeconds:\s*(\d+)/)[1]);
const budgetMs = {
    AI_MODEL_TIMEOUT_MS: Number(runtime.match(/const AI_MODEL_TIMEOUT_MS = (\d+);/)[1]),
    AI_MODEL_FAST_TIMEOUT_MS: Number(runtime.match(/const AI_MODEL_FAST_TIMEOUT_MS = (\d+);/)[1])
};

describe('no AI call is allowed to go quiet until the function dies', () => {
    it('races every model call against a deadline', () => {
        for (const { name, label, budget } of AI_FUNCTIONS) {
            const body = bodyOf(name);
            expect(body, name).toContain('await withDeadline(');
            expect(body, name).toContain('model.generateContent(');
            expect(body, name).toContain(`"${label}"`);
            expect(body, name).toContain(budget);
        }
    });

    it('leaves room to report before the function timeout hits', () => {
        // 마감선이 함수 타임아웃보다 길면 아무 소용이 없다 — 함수가 먼저 죽는다.
        for (const { name, budget } of AI_FUNCTIONS) {
            const functionBudgetMs = timeoutSecondsOf(name) * 1000;
            expect(budgetMs[budget], name).toBeLessThan(functionBudgetMs);
            // 로그를 남기고 오류를 돌려줄 여유를 5초 이상 둔다.
            expect(functionBudgetMs - budgetMs[budget], name).toBeGreaterThanOrEqual(5000);
        }
    });

    it('gives the image download a deadline too', () => {
        // 처음에 의심했던 자리다. 이번엔 아니었지만 막아 두는 값은 같다.
        expect(runtime).not.toContain('await fetch(imageUrl);');
        // 체성분 판독이 다섯 번째로 같은 자리를 쓴다.
        expect(runtime.split('fetchWithDeadline(imageUrl, AI_IMAGE_FETCH_TIMEOUT_MS)').length - 1).toBe(5);
    });

    it('turns a deadline into a code the screen can read', () => {
        for (const { name } of AI_FUNCTIONS) {
            const body = bodyOf(name);
            expect(body, name).toContain('includes("_timeout_")');
            expect(body, name).toContain('deadline-exceeded');
            expect(body, name).toContain('분석이 너무 오래 걸렸어요');
        }
    });

    it('checks the deadline before the generic failure swallows it', () => {
        // internal 로 뭉뚱그리면 사용자는 늦은 것인지 고장인지 가릴 수 없다.
        for (const { name } of AI_FUNCTIONS) {
            const body = bodyOf(name);
            const deadline = body.indexOf('includes("_timeout_")');
            const generic = body.indexOf('오류가 발생했습니다');
            expect(deadline, name).toBeGreaterThan(-1);
            expect(generic, name).toBeGreaterThan(-1);
            expect(deadline, name).toBeLessThan(generic);
        }
    });

    it('clears its timer so a fast answer does not hold the instance open', () => {
        const fn = runtime.split('function withDeadline(')[1].split('\n}\n')[0];
        expect(fn).toContain('Promise.race([promise, deadline])');
        expect(fn).toContain('clearTimeout(timer)');
    });

    it('already had a name for this failure on the client', () => {
        // analysisFailureMessage 가 코드를 사람 말로 바꾼다. 코드를 삼키면
        // "분석이 실패했대요" 만 제보로 돌아온다.
        const client = read('js/diet-analysis.js');
        expect(client).toContain("'deadline-exceeded': 'analysis.tooSlow'");
    });
});
