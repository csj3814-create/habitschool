import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-10-14 요청: "AI 분석이 잘못 되었을 때 다시 분석할 수 있게 분석 접기 버튼을
// 반으로 나눠서 다시 분석 넣고, 다시 분석할 때 참고할 메세지 넣을 수 있게 해 줘.
// 예: 오징어채를 짠지로 잘못 읽었어."
const runtime = readRepoFile('functions/runtime.js');
const client = readRepoFile('js/diet-analysis.js');
const app = readRepoFile('js/app-core.js');

function loadCorrectionHelpers() {
    const start = runtime.indexOf('const ANALYSIS_CORRECTION_MAX_CHARS = 300;');
    const end = runtime.indexOf('const DIET_ANALYSIS_PROMPT = ', start);
    expect(start).toBeGreaterThan(-1);
    // eslint-disable-next-line no-new-func
    return Function(`${runtime.slice(start, end)}\nreturn { normalizeAnalysisCorrection, withAnalysisCorrection };`)();
}

describe('서버가 정정을 프롬프트에 싣는다', () => {
    const { normalizeAnalysisCorrection, withAnalysisCorrection } = loadCorrectionHelpers();

    it('정정이 없으면 첫 분석과 같은 프롬프트', () => {
        expect(withAnalysisCorrection('PROMPT', '', 'ko')).toBe('PROMPT');
        expect(withAnalysisCorrection('PROMPT', undefined, 'ko')).toBe('PROMPT');
        expect(withAnalysisCorrection('PROMPT', '   ', 'en')).toBe('PROMPT');
    });

    it('회원의 말을 정정으로 붙이고, 형식은 그대로 지키게 한다', () => {
        const prompt = withAnalysisCorrection('PROMPT', '오징어채를 짠지로 잘못 읽었어', 'ko');
        expect(prompt.startsWith('PROMPT')).toBe(true);
        expect(prompt).toContain('"오징어채를 짠지로 잘못 읽었어"');
        expect(prompt).toContain('응답 JSON 형식과 위의 규칙은 그대로 지킨다');
        expect(withAnalysisCorrection('P', 'it was squid', 'en')).toContain('Keep the exact same JSON response format');
    });

    it('줄바꿈·따옴표·길이를 다듬는다', () => {
        expect(normalizeAnalysisCorrection('a\n\n"b"\u0000c')).toBe("a 'b' c");
        expect(normalizeAnalysisCorrection('가'.repeat(500))).toHaveLength(300);
        expect(normalizeAnalysisCorrection(42)).toBe('');
    });

    it.each([
        ['analyzeDiet', 'DIET_ANALYSIS_PROMPT'],
        ['analyzeExercise', 'EXERCISE_ANALYSIS_PROMPT'],
        ['analyzeExerciseVideo', 'EXERCISE_VIDEO_ANALYSIS_PROMPT'],
        ['analyzeSleepMind', 'SLEEP_MIND_ANALYSIS_PROMPT'],
    ])('%s 가 correction 을 받아 프롬프트에 넣는다', (name, promptName) => {
        const start = runtime.indexOf(`exports.${name} = onCall(`);
        const body = runtime.slice(start, runtime.indexOf('\nexports.', start + 10));
        expect(body).toMatch(/const \{[^}]*\bcorrection\b[^}]*\} = request\.data \|\| \{\};/);
        expect(body).toMatch(new RegExp(`withAnalysisCorrection\\(\\s*locale === "en" \\? ${promptName}_EN : ${promptName},\\s*correction,\\s*locale\\s*\\)`));
    });
});

describe('앱이 정정을 보낸다', () => {
    it('비었을 때는 싣지 않는다 — 첫 분석 요청은 그대로', () => {
        expect(client).toContain("return text ? { ...payload, correction: text } : payload;");
    });

    it.each([
        ['requestDietAnalysis', 'analyzeDietFn'],
        ['requestExerciseAnalysis', 'analyzeExerciseFn'],
        ['requestExerciseVideoAnalysis', 'analyzeExerciseVideoFn'],
    ])('%s', (fn, callable) => {
        const body = client.slice(client.indexOf(`export async function ${fn}(`));
        expect(body.slice(0, 120)).toContain("{ correction = '' } = {}");
        expect(body.slice(0, 600)).toContain(`${callable}(withCorrection(`);
    });

    it('수면도', () => {
        const body = client.slice(client.indexOf('export async function requestSleepMindAnalysis('));
        expect(body.slice(0, 400)).toContain('withCorrection(analysisLocalePayload({ analysisType }), correction)');
    });
});

describe('[분석 접기 | 다시 분석]', () => {
    it('펼칠 때마다 다시 분석 버튼을 맞춘다', () => {
        const fn = app.slice(app.indexOf('function setAnalysisExpanded('), app.indexOf('// ── 다시 분석'));
        expect(fn).toContain('syncReanalyzeControl(btn, expanded, key);');
    });

    it('펼친 분석에만 붙이고, 접으면 숨긴다', () => {
        const fn = app.slice(app.indexOf('function syncReanalyzeControl('));
        expect(fn.slice(0, 900)).toContain("const canReanalyze = expanded && !!reanalyzeTargetFor(");
        expect(fn.slice(0, 900)).toContain("btn.classList.remove('ai-split');");
        expect(fn.slice(0, 900)).toContain("btn.classList.add('ai-split');");
    });

    it('식단·수면·운동 사진·운동 영상을 모두 다시 분석한다', () => {
        const fn = app.slice(app.indexOf('function reanalyzeTargetFor('), app.indexOf('function buildReanalyzeControl('));
        expect(fn).toContain('analyzeMealPhoto(id, options)');
        expect(fn).toContain('window.analyzeSleepData(options)');
        expect(fn).toContain('window.analyzeExerciseVideo(strength, options)');
        expect(fn).toContain('window.analyzeExercisePhoto(cardio, options)');
    });

    it('입력칸은 예시를 보여 주고 서버와 같은 길이에서 자른다', () => {
        const fn = app.slice(app.indexOf('function buildReanalyzeControl('));
        expect(fn).toContain('오징어채를 짠지로 잘못 읽었어');
        expect(fn).toContain('input.maxLength = ANALYSIS_CORRECTION_MAX_CHARS;');
        expect(fn).toContain('await run({ reanalyze: true, correction });');
    });

    it.each([
        ['async function analyzeMealPhoto(', 'requestDietAnalysis(imageUrl, { correction })'],
        ['window.analyzeExercisePhoto = async function', 'requestExerciseAnalysis(imageUrl, { correction })'],
        ['window.analyzeExerciseVideo = async function', 'requestExerciseVideoAnalysis(videoUrl, { correction })'],
        ['window.analyzeSleepData = async function', "requestSleepMindAnalysis(sleepUrl, null, 'sleep', { correction })"],
    ])('%s 는 다시 분석이면 보기/접기를 건너뛰고 정정을 보낸다', (header, call) => {
        const body = app.slice(app.indexOf(header));
        const head = body.slice(0, body.indexOf('\n};\n'));
        expect(head).toContain("reanalyze = false, correction = ''");
        expect(head).toContain('!reanalyze && ');
        expect(head).toContain(call);
    });

    it('반반 버튼과 입력칸 스타일이 있다(밝은·어두운 화면)', () => {
        const css = readRepoFile('styles-reports.css');
        expect(css).toContain('.diet-ai-btn.ai-split,');
        expect(css).toContain('width: calc(50% - 3px);');
        expect(css).toContain('.ai-reanalyze-panel[hidden]');
        expect(readRepoFile('styles-dark-mode.css')).toContain('body.dark-mode .diet-ai-btn.ai-reanalyze-btn');
    });
});
