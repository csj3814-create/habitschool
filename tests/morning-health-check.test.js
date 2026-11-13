import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-24: "혈압·혈당·체중은 매일 아침 루틴이라 식단 탭에 두는 게 좋은데, 체성분
// 분석과 건강습관 점수는 프로필 탭이라 잘 안 보인다." → 재는 곳(식단 탭)에서 체성분을
// 넣고, 아침 지표를 저장하면 점수 변화를 말하고, 매일 여는 탭에 점수를 보인다.
const APP = readRepoFile('js/app-core.js');
const INDEX = readRepoFile('index.html');

describe('식단 탭 아침 체크에서 체성분을 넣는다', () => {
    const fastingCard = INDEX.split('>⚖️ 아침 공복 지표 기록</h3>')[1].split('<!-- 공복 지표 추이 그래프 -->')[0];

    it('아침 지표 카드 안에 체성분 사진 버튼과 Fitdays 안내가 있다', () => {
        expect(fastingCard).toContain("openMorningBodyComposition('library')");
        expect(fastingCard).toContain("openMorningBodyComposition('camera')");
        expect(fastingCard).toContain('공유 → 해빛스쿨');
        expect(fastingCard).toContain('id="morning-body-status"');
    });

    it('따로 둔 파일 입력이 결과를 이 자리에 띄우라고 알린다', () => {
        expect(fastingCard).toContain(`onchange="uploadBodyCompositionPhoto(this, 'morning')"`);
        expect(APP).toContain("await analyzeBodyCompositionFile(file, { origin });");
        const fn = APP.split('async function analyzeBodyCompositionFile(file, { origin = ')[1].split('\n}\n')[0];
        expect(fn).toContain("origin === 'morning' ? document.getElementById('morning-body-status') : null");
        expect(fn).toContain('renderMorningBodyCompositionResult(morningEl, result.analysis, staleNote)');
    });

    it('읽은 값을 보여 주고 그 자리에서 저장하게 한다', () => {
        const fn = APP.split('function renderMorningBodyCompositionResult(')[1].split('\n}\n')[0];
        expect(fn).toContain('onclick="saveHealthProfile()"');
        expect(fn).toContain('openBodyCompositionCard()');
        expect(fn).toContain('escapeHtml(');
    });

    it('동의가 없으면 먼저 묻고, 파일 창은 다시 눌러 연다', () => {
        const fn = APP.split('window.openMorningBodyComposition = async function')[1].split('\n};')[0];
        expect(fn).toContain('ensureBodyCompositionConsent()');
        expect(fn.indexOf('return;')).toBeLessThan(fn.indexOf("openPhotoPickerFor('morning-body-composition-input'"));
    });

    it('저장한 뒤 그 자리에 점수 변화를 남긴다', () => {
        const save = APP.split('window.saveHealthProfile = async function () {')[1].split('\n};\n')[0];
        expect(save).toContain("document.getElementById('morning-body-status')");
    });
});

describe('아침 지표를 저장하면 점수가 바뀌었을 때 알린다', () => {
    it('체중·혈당·혈압 중 하나라도 바뀌었을 때만 다시 매긴다', () => {
        const at = APP.indexOf('announceScoreChangeAfterMorningMetrics();');
        const block = APP.slice(at - 600, at);
        expect(block).toContain("['weight', 'glucose', 'bpSystolic', 'bpDiastolic']");
        expect(block).toContain('previousMetrics');
    });

    it('그대로거나 처음 계산이면 조용히 둔다', () => {
        const fn = APP.split('async function announceScoreChangeAfterMorningMetrics() {')[1].split('\n}\n')[0];
        expect(fn).toContain('before.le8 === after.le8 && before.metabolic === after.metabolic');
        expect(fn).toContain('before.le8 === null && before.metabolic === null');
    });
});

describe('내 기록 탭에 점수 요약을 둔다', () => {
    const src = APP.split('function renderDashboardHealthScore(')[1].split('\n}\n')[0];
    // 화면 문구는 사전으로 옮겼다(E4-1). readRepoFile 이 t('키') 를 한국어 문장으로 펼쳐 주니 자리표시만 채운다.
    const t = (text, params = {}) => String(text).replace(/\{(\w+)\}/g, (_, key) => (params[key] ?? ''));
    const render = (doc) => Function('document', 't', 'isEnglishLocale', `return function renderDashboardHealthScore(${src}\n}`)(doc, t, () => false);
    const fakeDoc = () => {
        const nodes = { 'dashboard-health-score': { hidden: true }, 'dashboard-health-score-main': {}, 'dashboard-health-score-next': {} };
        return { nodes, doc: { getElementById: (id) => nodes[id] } };
    };

    it('내 기록 맨 위, 하나씩 기록 상자보다 앞에 접힌 띠로 둔다', () => {
        // 2026-11-13 대표: 점수는 노출이 높아야 하지만 '하나씩 기록' 상자가 밀리면 안 된다.
        const dashboard = INDEX.split('<div id="dashboard" class="content-section')[1];
        const panel = dashboard.indexOf('<details class="dashboard-health-panel" id="dashboard-health-panel">');
        expect(panel).toBeGreaterThan(-1);
        expect(panel).toBeLessThan(dashboard.indexOf('<section class="dashboard-hero-shell"'));
        expect(dashboard).toContain('<summary class="card dashboard-health-score" id="dashboard-health-score" hidden');
        // 띠를 누르면 그 자리에서 펼쳐진다. 점수 상세와 건강 정보가 그 안에 있다.
        const body = dashboard.split('class="dashboard-health-body"')[1].split('<section class="dashboard-hero-shell"')[0];
        for (const id of ['le8-score-container', 'metabolic-score-container', 'sensitive-consent-group', 'blood-test-history', 'health-save-bar']) {
            expect(body, id).toContain(`id="${id}"`);
        }
    });

    it('두 점수와 다음에 할 일 하나를 보인다', () => {
        const { nodes, doc } = fakeDoc();
        render(doc)(
            { total: 78, behaviors: { diet: { score: 80 } }, factors: { bmi: { score: 100 }, bp: { missing: true, missingLabel: '💓 혈압 기록 필요' } } },
            { total: 85, allMissing: false }
        );
        expect(nodes['dashboard-health-score'].hidden).toBe(false);
        expect(nodes['dashboard-health-score-main'].textContent).toBe('💚 건강습관 78점 · 🧬 대사건강 85점');
        expect(nodes['dashboard-health-score-next'].textContent).toBe('다음에 채우면 좋아요: 💓 혈압 기록');
    });

    it('아무것도 없어도 감추지 않는다 — 건강 정보로 가는 길이 이 띠뿐이다', () => {
        const { nodes, doc } = fakeDoc();
        render(doc)({ total: null, behaviors: {}, factors: {} }, { allMissing: true });
        expect(nodes['dashboard-health-score'].hidden).toBe(false);
        expect(nodes['dashboard-health-score-main'].textContent).toBe('🌿 건강습관 점수');
        expect(nodes['dashboard-health-score-next'].textContent).toContain('건강 정보를 넣으면 점수가 나와요');
    });

    it('점수 계산 때마다 함께 그린다', () => {
        const fn = APP.split('async function updateMetabolicScoreUI() {')[1].split('\n};\n')[0];
        expect(fn).toContain('renderDashboardHealthScore(le8Data, scoreData);');
    });
});
