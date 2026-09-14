import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-09-14 요청: "운동에서 운동 이미지도 AI 분석을 적용하면 어떨까?
// 어떤 운동을 얼마나 했는지 알 수 있지 않을까?"
// 렌더러(renderExerciseAnalysisResult)는 이미 완성돼 갤러리 오버레이에만 붙어
// 있었고, 저장 경로도 data-ai-analysis → cardioList[].aiAnalysis 로 뚫려 있었다.
// 없던 것은 서버 함수와 버튼뿐이다.
describe('a workout photo can say what it is', () => {
    const app = read('js/app-core.js');
    const runtime = read('functions/runtime.js');
    const client = read('js/diet-analysis.js');

    it('calls a function of its own, not the diet one', () => {
        expect(runtime).toContain('exports.analyzeExercise = onCall(');
        expect(client).toContain("httpsCallable(functions, 'analyzeExercise')");
        expect(client).toContain('export async function requestExerciseAnalysis(');
    });

    it('only accepts this user\'s own workout images', () => {
        const fn = runtime.split('exports.analyzeExercise = onCall(')[1].split('\n);\n')[0];
        // 식단 폴더를 그대로 두면 운동 사진이 전부 거부된다.
        expect(fn).toContain('isAllowedUserMediaUrl(imageUrl, request.auth.uid, "exercise_images")');
        expect(fn).toContain('if (!request.auth)');
    });

    it('uses the model the project standardised on', () => {
        const fn = runtime.split('exports.analyzeExercise = onCall(')[1].split('\n);\n')[0];
        expect(fn).toContain('model: "gemini-2.5-flash"');
        expect(fn).toContain('thinkingConfig: { thinkingBudget: 0 }');
        expect(fn).not.toContain('gemini-2.0-flash');
    });

    it('hands the renderer exactly the words it colours by', () => {
        // 화면은 intensity 로 색·이모지를 고른다. 다른 낱말이 오면 색이 통째로 빠진다.
        const norm = runtime.split('function normalizeExerciseAnalysis(')[1].split('\n}\n')[0];
        expect(runtime).toContain('const EXERCISE_INTENSITY_LEVELS = ["저강도", "중강도", "고강도", "초고강도"];');
        expect(norm).toContain('EXERCISE_INTENSITY_LEVELS.includes(');
        expect(norm).toContain('"중강도"');
        // 막대는 주 150분 대비 적립 분으로 그린다.
        expect(norm).toContain('weightedMinutes');

        const renderer = read('js/diet-analysis.js').split('export function renderExerciseAnalysisResult(')[1].split('\n}\n')[0];
        for (const key of ['analysis.intensity', 'analysis.exerciseType', 'analysis.timeAnalysis', 'analysis.feedback', 'analysis.formTip', 'analysis.weightedMinutes']) {
            expect(renderer).toContain(key);
        }
    });

    it('lets the existing save path carry the result', () => {
        // 그 자리에서 서버에 쓰지 않는다 — 사진만 지우고 분석이 남는 어긋남을 만들지 않기 위해서다.
        const fn = app.split('window.analyzeExercisePhoto = async function (')[1].split('\n};\n')[0];
        expect(fn).toContain("block.setAttribute('data-ai-analysis', JSON.stringify(analysis));");
        expect(fn).not.toContain('setDoc(');
        // 저장 경로가 실제로 그 속성을 읽는다.
        expect(app).toContain("aiAnalysis = JSON.parse(block.getAttribute('data-ai-analysis'));");
    });

    it('runs itself when the upload finishes, one at a time', () => {
        const fn = app.split('function queueAutoAiAnalysis(')[1].split('\n}\n')[0];
        expect(fn).toContain('findCardioBlockForInput(inputId)');
        expect(fn).toContain("window.analyzeExercisePhoto(cardioBlock, { auto: true })");
        expect(fn).toContain('_autoAiAnalysisChain = _autoAiAnalysisChain');
    });

    it('waits for the photo, and says nothing when it runs itself', () => {
        const fn = app.split('window.analyzeExercisePhoto = async function (')[1].split('\n};\n')[0];
        expect(fn).toContain('if (pending && !pending.done)');
        expect(fn).toContain("if (!auto) showToast('⚠️ 먼저 사진을 올려주세요.');");
        expect(fn).toContain('if (!isPersistedStorageUrl(imageUrl))');
        // 분석이 도는 동안 사진이 사라졌을 수 있다.
        expect(fn).toContain('if (!isAnalyzedPhotoStillInPlace(previewImg, inputId, imageUrl)) return;');
        // 자동 실행은 접어 둔 결과를 펼치지 않는다.
        expect(fn).toContain('if (auto) return;');
    });

    it('rate-limits the request per block, not the fold-away', () => {
        const fn = app.split('window.analyzeExercisePhoto = async function (')[1].split('\n};\n')[0];
        const toggle = fn.indexOf('resultBox._analysisData ||');
        const limit = fn.indexOf('checkRateLimit(');
        const request = fn.indexOf('await requestExerciseAnalysis(');
        expect(toggle).toBeGreaterThan(-1);
        expect(limit).toBeGreaterThan(toggle);
        expect(limit).toBeLessThan(request);
        expect(fn).toContain('analyzeExercisePhoto:');
    });

    it('finds the button even though it is built per block', () => {
        // 유산소 버튼은 블록마다 새로 생겨 AI_ANALYSIS_INPUT_TO_BUTTON 표에 적을 수 없다.
        const fn = app.split('function findAiAnalysisButtonForInput(')[1].split('\n}\n')[0];
        expect(fn).toContain('AI_ANALYSIS_INPUT_TO_BUTTON[');
        expect(fn).toContain(".querySelector('.exercise-ai-btn')");
        const sync = app.split('function syncAiAnalysisButtonForInput(')[1].split('\n}\n')[0];
        expect(sync).toContain('const btn = findAiAnalysisButtonForInput(inputId);');
    });

    it('lets go of the analysis when the photo changes or leaves', () => {
        const reset = app.split('function resetExerciseAiAnalysisUi(')[1].split('\n}\n')[0];
        expect(reset).toContain('resultBox._analysisData = null;');
        expect(reset).toContain("btn.removeAttribute('data-analyzed');");
        const remove = app.split('window.removeStaticImage = function (')[1].split('\n};\n')[0];
        expect(remove).toContain('resetExerciseAiAnalysisUi(exerciseBlock, { visible: false });');
        expect(app).toContain('resetExerciseAiAnalysisUi(exerciseBlock, { visible: true });');
    });

    it('brings a saved analysis back folded', () => {
        const fn = app.split('function addExerciseBlock(')[1].split('\n}\n')[0];
        expect(fn).toContain('renderExerciseAnalysisResult(data.aiAnalysis, savedResultBox);');
        expect(fn).toContain("savedAiBtn.setAttribute('data-analyzed', 'true');");
        // 버튼이 label 안에 있으면 누를 때마다 파일 선택창이 같이 열린다.
        const markup = fn.split('contentHtml = `')[1].split('`;')[0];
        expect(markup.indexOf('exercise-ai-btn')).toBeGreaterThan(markup.indexOf('</label>'));
    });
});

// 2026-09-14 제보: 운동 칸에 음식 사진을 올렸더니 '중강도'로 평가됐다.
// 사진이 잘못된 게 아니라 기본값이 잘못이었다 — 모델은 "사진만으로는 운동 여부를
// 알 수 없습니다" 라고 정직하게 답했는데, 서버가 빈 intensity 를 중강도로 채웠다.
describe('a photo that is not a workout says so', () => {
    const app = read('js/app-core.js');
    const runtime = read('functions/runtime.js');
    const client = read('js/diet-analysis.js');

    it('asks whether it is a workout photo before anything else', () => {
        const prompt = runtime.split('const EXERCISE_ANALYSIS_PROMPT = `')[1].split('`;')[0];
        expect(prompt).toContain('isExercise');
        expect(prompt).toContain('0. **운동 사진이 맞는가**');
        // 답의 모양을 보여주지 않으면 모델이 형식을 지키지 않는다.
        expect(prompt).toContain('"isExercise": false');
        const promptEn = runtime.split('const EXERCISE_ANALYSIS_PROMPT_EN = `')[1].split('`;')[0];
        expect(promptEn).toContain('isExercise');
    });

    it('never fills an unknown intensity with a middle value', () => {
        const norm = runtime.split('function normalizeExerciseAnalysis(')[1].split('\n}\n')[0];
        // 예전: EXERCISE_INTENSITY_LEVELS.includes(...) ? ... : "중강도"
        expect(norm).toContain('EXERCISE_INTENSITY_LEVELS.includes(rawIntensity) ? rawIntensity : null');
        expect(norm).toContain('readIntensity !== null');
        // 운동인 것이 확인된 뒤에만 가운데 값으로 접는다.
        expect(norm).toContain("const intensity = readIntensity || \"중강도\";");
        const notExercise = norm.split('if (!isExercise) {')[1].split('    }')[0];
        expect(notExercise).toContain('intensity: null');
        expect(notExercise).toContain('weightedMinutes: null');
        expect(notExercise).toContain('exerciseType: null');
    });

    it('draws no intensity badge for it', () => {
        // 배지는 "이만큼 운동했다"는 말이다. 근거가 없으면 붙이지 않는다.
        const fn = client.split('export function renderExerciseAnalysisResult(')[1].split('\n}\n')[0];
        const guard = fn.indexOf('if (analysis.isExercise === false)');
        const badge = fn.indexOf('intensityColors[intensity]');
        expect(guard).toBeGreaterThan(-1);
        expect(badge).toBeGreaterThan(guard);
        expect(fn).toContain('운동 사진으로 보이지 않아요');
    });

    it('keeps it out of the record', () => {
        // 저장하면 갤러리·리포트에 '운동 분석'으로 끼어든다.
        const fn = app.split('window.analyzeExercisePhoto = async function (')[1].split('\n};\n')[0];
        const branch = fn.split('if (analysis.isExercise === false) {')[1].split('\n        }')[0];
        expect(branch).toContain("block.removeAttribute('data-ai-analysis');");
        expect(branch).toContain("btn.textContent = '🤖 다시 분석';");
        expect(branch).not.toContain("setAttribute('data-analyzed'");
        // 다시 눌러볼 수 있어야 하므로 _analysisData 를 채우지 않는다.
        expect(fn.indexOf('resultBox._analysisData = analysis;')).toBeGreaterThan(fn.indexOf('if (analysis.isExercise === false)'));
    });

    it('does not overwrite the retry label on the way out', () => {
        const fn = app.split('window.analyzeExercisePhoto = async function (')[1].split('\n};\n')[0];
        const finallyBlock = fn.split('} finally {')[1];
        expect(finallyBlock).toContain("if (btn.textContent === '🤖 AI 분석 중...')");
    });
});

// 2026-09-14 제보: 운동 AI 분석이 '분석 중...' 에서 멈췄다. 로그를 심고 보니 이미지
// 내려받기 0.7초, 모델 응답 3.6초로 멀쩡했다 — 그때 60초를 먹은 곳은 모델 호출
// 쪽이었고, 거기엔 마감선이 없어 함수가 죽을 때까지 아무 말도 못 했다.
describe('a slow analysis says so instead of going quiet', () => {
    const runtime = read('functions/runtime.js');
    const fn = runtime.split('exports.analyzeExercise = onCall(')[1].split('\n);\n')[0];

    it('puts a deadline on both waits, inside the function timeout', () => {
        expect(runtime).toContain('const EXERCISE_IMAGE_FETCH_TIMEOUT_MS = 15000;');
        expect(runtime).toContain('const EXERCISE_MODEL_TIMEOUT_MS = 40000;');
        // 둘 다 함수 타임아웃 60초보다 짧아야 우리가 먼저 끊고 이유를 남긴다.
        expect(fn).toContain('timeoutSeconds: 60');
        expect(fn).toContain('fetchWithDeadline(imageUrl, EXERCISE_IMAGE_FETCH_TIMEOUT_MS)');
        expect(fn).toContain('EXERCISE_MODEL_TIMEOUT_MS');
    });

    it('turns a deadline into a message the screen can show', () => {
        expect(fn).toContain('deadline-exceeded');
        expect(fn).toContain('분석이 너무 오래 걸렸어요');
    });

    it('leaves a trail at each step so the next failure is readable', () => {
        expect(fn).toContain('[analyzeExercise] 이미지 확보');
        expect(fn).toContain('[analyzeExercise] 분석 완료');
        expect(fn).toContain('[analyzeExercise] 허용되지 않은 URL');
        // 오류 코드를 삼키면 '실패했대요' 만 제보로 돌아온다.
        expect(fn).toContain('status: error?.status');
    });

    it('strips a code fence with a regex that survived the edit', () => {
        // 백슬래시를 잃으면 /```(?:json)?s*([sS]*?)```/ 가 되어 조용히 안 맞는다.
        const B = String.fromCharCode(92);
        expect(fn).toContain(`/\`\`\`(?:json)?${B}s*([${B}s${B}S]*?)\`\`\`/`);
    });
});
