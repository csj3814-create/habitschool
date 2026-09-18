import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDailyActivityMinutes, resolveExerciseItemMinutes } from '../js/le8-score.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const app = read('js/app-core.js');
const runtime = read('functions/runtime.js');
const client = read('js/diet-analysis.js');

// 2026-09-15 요청: "하이퍼랩스 영상 분석 하자"
// 종류·강도·자세는 영상에서 읽힌다. 시간은 아니다 — 하이퍼랩스는 시간을 지운
// 영상이라 10초짜리 파일이 10분인지 한 시간인지 픽셀에 없다. 그래서 시간은
// 사용자가 적고(2026-09-14 에 만든 칸), 이 분석은 거기에 곱할 강도를 준다.
describe('a hyperlapse can say what, not how long', () => {
    const fn = runtime.split('exports.analyzeExerciseVideo = onCall(')[1].split('\n);\n')[0];

    it('has a function of its own, wired to the client', () => {
        expect(runtime).toContain('exports.analyzeExerciseVideo = onCall(');
        expect(client).toContain("httpsCallable(functions, 'analyzeExerciseVideo')");
        expect(client).toContain('export async function requestExerciseVideoAnalysis(');
        expect(app).toContain('window.analyzeExerciseVideo = async function (');
    });

    it("only accepts this user's own workout videos", () => {
        expect(fn).toContain('isAllowedUserMediaUrl(videoUrl, request.auth.uid, "exercise_videos")');
        expect(fn).toContain('if (!request.auth)');
    });

    it('never lets a duration out of the video analysis', () => {
        // 여기서 시간을 내보내면 resolveExerciseItemMinutes 가 그걸 쓴다.
        // 하이퍼랩스에서 읽은 시간은 어떤 값이든 근거가 없다.
        const prompt = runtime.split('const EXERCISE_VIDEO_ANALYSIS_PROMPT = `')[1].split('`;')[0];
        expect(prompt).toContain('durationMinutes 는 언제나 null');
        expect(prompt).toContain('하이퍼랩스');

        const norm = runtime.split('function normalizeExerciseVideoAnalysis(')[1].split('\n}\n')[0];
        // 모델이 뭘 보내든 버린다 — 두 갈래 모두에서.
        expect(norm.split('durationMinutes: null').length - 1).toBe(2);
        expect(norm.split('weightedMinutes: null').length - 1).toBe(2);
    });

    it('so the entered minutes stay in charge, weighted by what the video saw', () => {
        // 영상 분석이 붙어도 분(分)은 사용자가 적은 값에서만 나온다.
        const videoAnalysis = { mediaKind: 'video', intensity: '고강도', durationMinutes: null, weightedMinutes: null };
        expect(resolveExerciseItemMinutes({ durationMinutes: 25, aiAnalysis: videoAnalysis })).toBe(50);
        // 시간을 안 적었으면 예전처럼 한 건당 30분이다. 영상이 시간을 지어내지 않는다.
        expect(resolveExerciseItemMinutes({ aiAnalysis: videoAnalysis })).toBe(30);
    });

    // 2026-09-19 제보: "푸시업 70개 런지 양쪽 70개씩 했는데 런지 약 3회로 분석되어
    // 있어. 횟수를 정확히 셀 수 없으면 차라리 횟수 이야기를 빼."
    //
    // 하이퍼랩스는 프레임이 띄엄띄엄 남는다. 모델은 남은 프레임을 정확히 세고 그
    // 숫자를 확신한다 — 틀렸다는 신호가 응답 어디에도 없다. 프롬프트로 "셀 수
    // 있을 때만" 이라고 일러 두었지만 모델은 자기가 셀 수 있다고 믿었다.
    it('does not count reps at all, because it cannot', () => {
        const prompt = runtime.split('const EXERCISE_VIDEO_ANALYSIS_PROMPT = `')[1].split('`;')[0];
        expect(prompt).toContain('반복 횟수도 세지 마세요');
        expect(prompt).not.toContain('repCount');
        // 모델이 뭘 보내든 필드가 없다.
        const norm = runtime.split('function normalizeExerciseVideoAnalysis(')[1].split('\n}\n')[0];
        expect(norm).not.toContain('repCount');
        // 화면에도 없다.
        const renderer = client.split('export function renderExerciseAnalysisResult(')[1].split('\n}\n')[0];
        expect(renderer).not.toContain('repCount');
    });

    it('scrubs a rep count that leaks into the sentence', () => {
        // 필드에서만 빼고 문장에 "약 3회" 가 남으면 고친 것이 아니다.
        const body = runtime.split('function stripRepCounts(value) {')[1].split('\n}')[0];
        const stripRepCounts = Function('return function stripRepCounts(value) {' + body + '\n}')();
        expect(stripRepCounts('스쿼트 · 약 12회')).toBe('스쿼트');
        expect(stripRepCounts('런지 · 약 3회')).toBe('런지');
        expect(stripRepCounts('푸시업 70회씩 하셨네요. 대단합니다.')).toBe('푸시업 하셨네요. 대단합니다.');
        expect(stripRepCounts('Squats, about 12 reps')).toBe('Squats');
        // 세트 수와 층수는 화면에 실제로 남는 정보다. 건드리지 않는다.
        expect(stripRepCounts('3세트로 나눠 하셨네요')).toBe('3세트로 나눠 하셨네요');
        expect(stripRepCounts('계단 5층까지 오르셨습니다')).toBe('계단 5층까지 오르셨습니다');
        expect(stripRepCounts('')).toBe('');
        expect(stripRepCounts(null)).toBe(null);
    });

    it('runs the scrubber on every sentence it sends back', () => {
        const norm = runtime.split('function normalizeExerciseVideoAnalysis(')[1].split('\n}\n')[0];
        for (const field of ['timeAnalysis', 'feedback', 'formTip']) {
            expect(norm, field).toContain(`stripRepCounts(text(source.${field}`);
        }
    });

    it('grounds a form cue in what is visible, or says nothing', () => {
        const prompt = runtime.split('const EXERCISE_VIDEO_ANALYSIS_PROMPT = `')[1].split('`;')[0];
        expect(prompt).toContain('실제로 보이는 것');
        expect(prompt).toContain('안 보이는 것을 지적하면 틀린 지적이 됩니다');
    });

    it('asks whether it is a workout at all, and keeps a "no" out of the record', () => {
        const prompt = runtime.split('const EXERCISE_VIDEO_ANALYSIS_PROMPT = `')[1].split('`;')[0];
        expect(prompt).toContain('**운동 중에 찍힌 영상인가**(isExercise)');
        expect(prompt).toContain('"isExercise": false');

        const analyzer = app.split('window.analyzeExerciseVideo = async function (')[1].split('\n};\n')[0];
        const branch = analyzer.split('if (analysis.isExercise === false) {')[1].split('\n        }')[0];
        expect(branch).toContain("block.removeAttribute('data-ai-analysis');");
        expect(branch).toContain("btn.textContent = '🤖 다시 분석';");
    });

    it('refuses a video too big to send instead of failing slowly', () => {
        expect(runtime).toContain('const EXERCISE_VIDEO_MAX_BYTES = 15 * 1024 * 1024;');
        // 헤더로 먼저 거르고, 본문으로 한 번 더 본다.
        expect(fn).toContain('content-length');
        // 비교문을 센다. 이름만 세면 주석에 상수를 언급하는 순간 깨진다.
        expect(fn.split('> EXERCISE_VIDEO_MAX_BYTES').length - 1).toBe(2);
        expect(fn).toContain('failed-precondition');
    });

    it('gets a longer deadline than a photo, still inside its own timeout', () => {
        // 영상은 프레임을 훑어야 해서 느리다. 그래도 함수보다 먼저 끊어야 말을 할 수 있다.
        expect(runtime).toContain('const AI_VIDEO_MODEL_TIMEOUT_MS = 90000;');
        expect(fn).toContain('timeoutSeconds: 120');
        expect(fn).toContain('AI_VIDEO_MODEL_TIMEOUT_MS');
        expect(fn).toContain('deadline-exceeded');
    });

    it('lets the existing save path carry the result', () => {
        const analyzer = app.split('window.analyzeExerciseVideo = async function (')[1].split('\n};\n')[0];
        expect(analyzer).toContain("block.setAttribute('data-ai-analysis', JSON.stringify(analysis));");
        expect(analyzer).not.toContain('setDoc(');
        // 저장 경로가 유산소·근력 두 곳에서 그 속성을 읽는다.
        expect(app.split("aiAnalysis = JSON.parse(block.getAttribute('data-ai-analysis'));").length - 1).toBe(2);
    });

    it('runs itself when the upload finishes, in the same single queue', () => {
        const fnQueue = app.split('function queueAutoAiAnalysis(')[1].split('\n}\n')[0];
        expect(fnQueue).toContain('findExerciseBlockForInput(inputId)');
        expect(fnQueue).toContain("exerciseTarget.kind === 'strength'");
        expect(fnQueue).toContain('window.analyzeExerciseVideo(exerciseTarget.block, { auto: true })');
        expect(fnQueue).toContain('window.analyzeExercisePhoto(exerciseTarget.block, { auto: true })');
        // 사진과 영상이 같은 줄에 선다 — 동시에 두 개가 뜨지 않게.
        expect(fnQueue).toContain('_autoAiAnalysisChain = _autoAiAnalysisChain');
    });

    it('lets go of the analysis when the video is replaced or removed', () => {
        // 유산소에서 고쳤던 것과 같은 구멍이 영상 교체 경로에 있었다.
        const preview = app.split('window.previewDynamicVid = function (input) {')[1].split('\n};\n')[0];
        expect(preview).toContain("currentBlock.removeAttribute('data-ai-analysis');");
        expect(preview).toContain('resetExerciseAiAnalysisUi(currentBlock, { visible: true });');
    });

    it('shows the button on a strength block, outside the file picker label', () => {
        const fnBlock = app.split('function addExerciseBlock(')[1].split('\n}\n')[0];
        const strengthMarkup = fnBlock.split("contentHtml = `").pop().split('`;')[0];
        expect(strengthMarkup).toContain('id="ai_s_${id}"');
        expect(strengthMarkup).toContain('onclick="analyzeExerciseVideo(this)"');
        expect(strengthMarkup.indexOf('ai_s_${id}')).toBeGreaterThan(strengthMarkup.indexOf('</label>'));
        // 저장된 분석은 두 블록 종류 모두 되살린다.
        expect(fnBlock).toContain('if (hasAnalysis) {');
    });
});

// 2026-09-15 제보: 1인칭 계단 오르기 영상을 올렸더니 "운동 영상으로 보이지 않아요"
// 가 뜨면서도 timeAnalysis 에는 "계단 오르는 영상"이라고 제대로 적혀 있었다.
// 모델이 못 읽은 게 아니라, 프롬프트가 isExercise 를 3인칭 기준으로만 물었다 —
// "사람도 기구도 공간도 안 보이면 false". 1인칭은 그 셋이 다 안 보인다.
describe('a first-person clip is still a workout', () => {
    const videoPrompt = runtime.split('const EXERCISE_VIDEO_ANALYSIS_PROMPT = `')[1].split('`;')[0];
    const photoPrompt = runtime.split('const EXERCISE_ANALYSIS_PROMPT = `')[1].split('`;')[0];

    it('asks whether it was filmed while exercising, not whether a body is visible', () => {
        for (const [label, prompt] of [['영상', videoPrompt], ['사진', photoPrompt]]) {
            expect(prompt, label).toContain('운동하면서 찍은');
            expect(prompt, label).toContain('1인칭');
        }
        // 예전 판정 문장은 없어야 한다.
        expect(videoPrompt).not.toContain('사람이 운동하는 모습도, 운동 기구도, 운동 공간도 보이지 않으면');
    });

    it('names the scenes a first-person camera actually shows', () => {
        expect(videoPrompt).toContain('계단이 흘러가고');
        expect(videoPrompt).toContain('등산로');
        // 답의 모양을 보여주지 않으면 모델이 형식을 지키지 않는다.
        expect(videoPrompt).toContain('"exerciseType": "계단 오르기"');
    });

    it('still turns away what is plainly not exercise', () => {
        // 음식 사진을 중강도로 평가하던 2026-09-14 건이 되살아나면 안 된다.
        for (const [label, prompt] of [['영상', videoPrompt], ['사진', photoPrompt]]) {
            expect(prompt, label).toContain('분명히 무관');
            expect(prompt, label).toContain('음식');
            expect(prompt, label).toContain('"isExercise": false');
        }
        // 풍경을 통째로 제외하던 문구는 뺐다 — 1인칭 등산로가 거기 걸렸다.
        expect(photoPrompt).not.toContain('음식, 영수증, 풍경, 문서');
    });

    it('does not invent form advice for a body it cannot see', () => {
        expect(videoPrompt).toContain('1인칭 영상은 몸이 안 보이므로 자세를 말할 수 없습니다');
    });

    it('sends a stair video to the side the step count already counts', () => {
        // 1인칭 계단 영상은 운동 영상 칸에 올라오지만 걸음수가 이미 센다.
        // 따로 더하면 같은 계단을 두 번 세게 된다.
        const stairs = { exercise: { strengthList: [{ durationMinutes: 20, aiAnalysis: { exerciseType: '계단 오르기', intensity: '중강도' } }] }, steps: { count: 10000 } };
        expect(resolveDailyActivityMinutes(stairs).minutes).toBe(60); // max(60, 20)

        // 진짜 근력은 그대로 더한다.
        const lifting = { exercise: { strengthList: [{ durationMinutes: 20, aiAnalysis: { exerciseType: '데드리프트', intensity: '고강도' } }] }, steps: { count: 10000 } };
        expect(resolveDailyActivityMinutes(lifting).minutes).toBe(100); // 60 + 40

        // 종류를 모르면 예전대로 따로 센다 — 측정 근거가 그쪽이다.
        const unknown = { exercise: { strengthList: [{}] }, steps: { count: 10000 } };
        expect(resolveDailyActivityMinutes(unknown).minutes).toBe(90); // 60 + 30
    });
});

// 서버는 오늘부터 오는 응답을 막고, 화면은 이미 저장된 기록을 맡는다. 09-19 이전
// 영상에는 "런지 · 약 3회" 가 문장에 그대로 남아 있고, 그 숫자가 틀렸다는 것이
// 이 기능을 뺀 이유다. 백필 대신 그리는 자리에서 지운다.
//
// 같은 규칙이 두 벌 있으므로, 둘이 같은 답을 내는지 여기서 대조한다. 안 그러면
// 언젠가 한쪽만 고쳐진다.
describe('the scrubber reads the same on both sides', () => {
    const load = (source) => {
        const body = source.split('function stripRepCounts(value) {')[1].split('\n}')[0];
        return Function('return function stripRepCounts(value) {' + body + '\n}')();
    };
    const server = load(runtime);
    const screen = load(client);

    const CASES = [
        '스쿼트 · 약 12회',
        '런지 · 약 3회',
        '푸시업 70회씩 하셨네요. 대단합니다.',
        'Squats, about 12 reps',
        'Lunges, 3 reps',
        '스쿼트 · 깊이 일정',
        '3세트로 나눠 하셨네요',
        '계단 5층까지 오르셨습니다',
        '',
    ];

    it('agrees on every example', () => {
        for (const value of CASES) {
            expect(screen(value), value).toBe(server(value));
        }
    });

    it('cleans an old record the same way a new one is written', () => {
        expect(screen('런지 · 약 3회')).toBe('런지');
        expect(screen('푸시업 70회씩 하셨네요. 대단합니다.')).toBe('푸시업 하셨네요. 대단합니다.');
    });

    it('is applied to every sentence the exercise card draws', () => {
        const fn = client.split('export function renderExerciseAnalysisResult(')[1].split('\nexport function')[0];
        for (const field of ['timeAnalysis', 'feedback', 'formTip']) {
            expect(fn, field).toContain(`stripRepCounts(analysis.${field}`);
        }
    });
});
