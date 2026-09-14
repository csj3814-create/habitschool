import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-09-14 요청: "AI 분석 버튼을 따로 둘 필요가 있을까? 업로드 마치면 자동
// 분석하는 건 어때?" — 사진을 올렸다는 것이 곧 분석해 달라는 뜻이다.
// 버튼은 남긴다. 분석을 보고 접고, 실패하면 다시 눌러 볼 자리가 필요하다.
describe('an uploaded photo analyses itself', () => {
    const app = read('js/app-core.js');

    it('starts the moment the upload records itself done', () => {
        const fn = app.split('function beginTrackedPendingUpload(')[1].split('\n}\n')[0];
        // 실패 분기에도 current.done = true 가 있다. 성공 분기의 완료 표시
        // 바로 뒤에 붙었는지를 본다.
        const complete = fn.indexOf("{ state: 'complete', pct: 100 }");
        const queued = fn.indexOf('queueAutoAiAnalysis(inputId);');
        expect(complete).toBeGreaterThan(-1);
        expect(queued).toBeGreaterThan(complete);
        // 실패 분기보다 뒤여야 한다 — 올라가지 못한 사진을 분석할 수는 없다.
        expect(queued).toBeGreaterThan(fn.indexOf('needsRetry = true;'));
    });

    it('runs one at a time', () => {
        // 아침·점심·저녁·간식을 한꺼번에 고르면 업로드가 잇따라 끝난다.
        // 줄을 세우지 않으면 Gemini 호출 네 개가 동시에 뜬다.
        const fn = app.split('function queueAutoAiAnalysis(')[1].split('\n}\n')[0];
        expect(fn).toContain('_autoAiAnalysisChain = _autoAiAnalysisChain');
        expect(fn).toContain('.then(() => runAutoAiAnalysis(slot))');
        expect(app).toContain('let _autoAiAnalysisChain = Promise.resolve();');
    });

    it('reads the slot out of the same table the button gating uses', () => {
        // `diet-img-` 를 잘라내는 식으로 지어내면 sleep-img 에서 빗나간다.
        const fn = app.split('function findAiAnalysisSlotForInput(')[1].split('\n}\n')[0];
        expect(fn).toContain('AI_ANALYSIS_INPUT_TO_BUTTON[String(inputId || \'\').trim()]');
        expect(app).not.toContain("inputId.replace('diet-img-', '')");
    });

    it('does not run before there is somewhere to save the result', () => {
        const fn = app.split('function queueAutoAiAnalysis(')[1].split('\n}\n')[0];
        expect(fn).toContain('if (!auth.currentUser) return;');
    });

    it('fails quietly — the user did not ask for this run', () => {
        const fn = app.split('function queueAutoAiAnalysis(')[1].split('\n}\n')[0];
        expect(fn).toContain('.catch(');
        expect(fn).not.toContain('showToast(');
        // 조용하되 흔적은 남긴다. 아무 로그도 없으면 나중에 알 길이 없다.
        expect(fn).toContain('console.warn(');
    });

    it('never toggles a result the user folded away', () => {
        const meal = app.split('async function analyzeMealPhoto(')[1].split('\n};\n')[0];
        const mealToggle = meal.split("if (resultContainer._analysisData")[1].split('}\n')[0];
        expect(mealToggle).toContain('if (auto) return;');

        const sleep = app.split('window.analyzeSleepData = async function(')[1].split('\n};\n')[0];
        const sleepToggle = sleep.split("data-analyzed') === 'true')")[1].split('}\n')[0];
        expect(sleepToggle).toContain('if (auto) return;');
    });

    it('skips the rate limit that exists to stop double-clicks', () => {
        const meal = app.split('async function analyzeMealPhoto(')[1].split('\n};\n')[0];
        expect(meal).toContain("if (!auto && !checkRateLimit('analyzeMealPhoto', 3000))");
    });

    it('says nothing when there is no photo to read', () => {
        const meal = app.split('async function analyzeMealPhoto(')[1].split('\n};\n')[0];
        expect(meal).toContain("if (!auto) showToast('⚠️ 먼저 사진을 올려주세요.');");
        expect(meal).toContain("if (!auto) showToast('⚠️ 사진을 먼저 저장한 후 분석해주세요.');");

        const sleep = app.split('window.analyzeSleepData = async function(')[1].split('\n};\n')[0];
        expect(sleep).toContain("if (!auto) showToast('⚠️ 수면 캡처를 올려주세요.');");
    });

    it('sends the uploaded URL, not the local preview, when one exists', () => {
        // 방금 올린 사진을 base64 로 다시 올릴 이유가 없다.
        const sleep = app.split('window.analyzeSleepData = async function(')[1].split('\n};\n')[0];
        expect(sleep).toContain("_pendingUploads.get('sleep-img')");
        expect(sleep).toContain('isPersistedStorageUrl(pendingSleepUrl)');
    });

    it('leaves no red error box behind an automatic run', () => {
        const fn = app.split('function showSleepAnalysisFailure(')[1].split('\n}\n')[0];
        expect(fn).toContain('if (auto) {');
        expect(fn).toContain("resultBox.style.display = 'none';");
    });

    it('puts the button back so it can be pressed again', () => {
        const sleep = app.split('window.analyzeSleepData = async function(')[1].split('\n};\n')[0];
        const finallyBlock = sleep.split('} finally {')[1];
        expect(finallyBlock).toContain("aiBtn.textContent = '🤖 AI 분석';");
    });
});
