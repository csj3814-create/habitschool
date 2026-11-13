import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { describeBasicInfo, describeMeds, describeCholesterol, joinBasicLine } from '../js/health-card-folds.js';

// 2026-11-13 요청:
//  - "여러 장 찍기, 고르기 한번에 골라 한번에 분석 가능하게 해 줘."
//  - 저장 버튼 넷을 하나로, 기본 정보·약물은 한 줄로 접기.
//  - 콜레스테롤은 혈액검사 카드로 옮기되 "직접 입력할 수도 있게 — 혈액검사에 그 항목이 없을 수도 있어."

const INDEX = readRepoFile('index.html');
const APP = readRepoFile('js/app-core.js');
const AUTH = readRepoFile('js/auth.js');
const ANALYSIS = readRepoFile('js/diet-analysis.js');
const RUNTIME = readRepoFile('functions/runtime.js');
const FOLDS = readRepoFile('js/health-card-folds.js');
const CSS = readRepoFile('styles-features.css');
const MAIN = readRepoFile('js/main.js');
const SW = readRepoFile('sw.js');

const bloodFn = RUNTIME.split('exports.analyzeBloodTest = onCall(')[1].split('\n);\n')[0];
const healthCards = INDEX.split('id="sensitive-consent-cards"')[1].split('/#sensitive-consent-cards')[0];
const bloodCard = INDEX.split('data-sensitive-card="혈액검사"')[1].split('/#sensitive-consent-cards')[0];

describe('a result sheet of several pages is read as one', () => {
    it('lets the library picker take several photos, and keeps the camera to one shot', () => {
        expect(INDEX).toMatch(/id="blood-test-input"[^>]*data-multi="1"/);
        expect(APP).toContain("input.toggleAttribute('multiple', !camera && input.dataset.multi === '1');");
        // PDF·엑셀은 하나씩이다.
        const picker = APP.split('window.openBloodTestFilePicker = function () {')[1].split('\n};')[0];
        expect(picker).toContain("input.removeAttribute('multiple');");
    });

    it('collects pages instead of analyzing the first one straight away', () => {
        const intake = APP.split('async function uploadBloodTestPhoto(inputEl) {')[1].split('\n}\n')[0];
        expect(intake).toContain('const files = Array.from(inputEl.files || []);');
        expect(intake).toContain("if (kinds.every((kind) => kind === 'image')) {");
        expect(intake).toContain('renderBloodTestPages();');
        // 사진을 모으는 길에서는 분석을 시작하지 않는다.
        const imagePath = intake.split("if (kinds.every((kind) => kind === 'image')) {")[1].split('\n    }\n')[0];
        expect(imagePath).not.toContain('analyzeBloodTestFiles');
        expect(imagePath).toContain('return;');
    });

    it('keeps the same six-page limit on the screen and on the server', () => {
        expect(APP).toContain('const BLOOD_TEST_MAX_PAGES = 6;');
        expect(RUNTIME).toContain('const BLOOD_TEST_MAX_PAGES = 6;');
        expect(bloodFn).toContain('if (imageUrls.length > BLOOD_TEST_MAX_PAGES) {');
    });

    it('uploads every page and asks for one analysis', () => {
        const run = APP.split('async function analyzeBloodTestFiles(files, fileKind) {')[1].split('\n}\n')[0];
        expect(run).toContain('for (let index = 0; index < files.length; index += 1) {');
        expect(run).toContain('const analysis = await requestBloodTestAnalysis(imageUrls);');
        expect(ANALYSIS).toContain('analysisLocalePayload({ imageUrl: imageUrls[0], imageUrls })');
    });

    it('puts the pages back when the analysis did not finish', () => {
        const fn = APP.split('window.analyzeBloodTestPages = async function () {')[1].split('\n};')[0];
        expect(fn).toContain("const done = await analyzeBloodTestFiles(pages, 'image');");
        expect(fn).toContain('_bloodTestPages = pages;');
    });

    it('still accepts an old app that sends one address', () => {
        expect(bloodFn).toContain('const imageUrls = Array.isArray(rawUrls) && rawUrls.length > 0 ? rawUrls : [singleUrl];');
    });

    it('checks every address before fetching any, and tells the model the pages belong together', () => {
        expect(bloodFn).toContain('if (imageUrls.some((url) => !url.startsWith("https://firebasestorage.googleapis.com/"))) {');
        expect(bloodFn.indexOf('firebasestorage.googleapis.com')).toBeLessThan(bloodFn.indexOf('fetchWithDeadline(url'));
        expect(bloodFn).toContain('한 결과지의 쪽들입니다');
        expect(bloodFn).toContain('...resultParts');
        expect(bloodFn).toContain('imageUrls,');
    });

    it('takes several pages only as photos', () => {
        expect(bloodFn).toContain('if (fetched.some((item) => !item.contentType.startsWith("image/"))) {');
    });
});

describe('two save buttons instead of four', () => {
    it('has one under basic info and one at the end of the cards', () => {
        // 2026-11-13 대표: "기본정보 맨 아래에 저장 버튼은 하나 넣어줘."
        expect(healthCards.match(/onclick="saveHealthProfile\(\)"/g)).toHaveLength(2);
        const basic = INDEX.split('id="health-basic-card"')[1].split('</details>')[0];
        expect(basic.match(/onclick="saveHealthProfile\(\)"/g)).toHaveLength(1);
        expect(basic.indexOf('onclick="saveHealthProfile()"')).toBeGreaterThan(basic.indexOf('id="prof-med-other"'));
        const bar = healthCards.indexOf('id="health-save-bar"');
        expect(bar).toBeGreaterThan(healthCards.indexOf('id="blood-test-history"'));
    });

    it('follows the screen once a value is touched, and lets go after saving', () => {
        expect(CSS).toMatch(/\.health-save-bar\.is-dirty \{[^}]*position: sticky;[^}]*bottom: 12px;/);
        expect(FOLDS).toContain("cards.addEventListener('input', onEdit);");
        expect(FOLDS).toContain("if (!target || target.type === 'file') return;");
        const save = APP.split('window.saveHealthProfile = ')[1].split('\n};')[0];
        expect(save).toContain('window.setHealthProfileDirty?.(false);');
    });

    it('also follows after a photo or Health Connect filled the boxes', () => {
        expect(APP.match(/window\.setHealthProfileDirty\?\.\(true\);\r?\n\s*_pendingBodyCompositionExtras = \{/g)).toHaveLength(2);
    });
});

describe('basic info, with medication inside it, folds to one line', () => {
    it('describes only what was entered', () => {
        expect(describeBasicInfo({ height: '172', sex: 'male', smoking: 'never' })).toBe('키 172cm · 남성 · 비흡연');
        expect(describeBasicInfo({ height: '', sex: '', smoking: '' })).toBe('');
        expect(describeBasicInfo({ height: '160.5', sex: 'female', smoking: 'current', secondhand: true }, true))
            .toBe('160.5 cm · Female · Smoking · Secondhand smoke');
        expect(describeMeds({ meds: ['고혈압약', '당뇨약'], other: ' 갑상선약 ' })).toBe('고혈압약 · 당뇨약 · 갑상선약');
        expect(describeMeds({ meds: ['고지혈증약'] }, true)).toBe('Cholesterol');
        expect(describeMeds({})).toBe('');
        expect(describeCholesterol({ total: '192', hdl: '58' })).toBe('총 192 · HDL 58');
        expect(describeCholesterol({ total: '', hdl: '' })).toBe('');
        expect(joinBasicLine('키 172cm · 남성', '고혈압약')).toBe('키 172cm · 남성 · 약 고혈압약');
        expect(joinBasicLine('키 172cm', '')).toBe('키 172cm');
        expect(joinBasicLine('', 'Blood pressure', true)).toBe('Meds: Blood pressure');
    });

    it('keeps medication inside basic info, without losing the consent label', () => {
        // 2026-11-13 대표: "현재 복용중인 약물은 기본정보 안에 넣어 주고"
        expect(INDEX).toContain('<details class="card health-fold-card" id="health-basic-card" data-sensitive-card="기본 정보" open>');
        const basic = INDEX.split('id="health-basic-card"')[1].split('</details>')[0];
        expect(basic).toContain('<div class="health-meds-section" data-sensitive-card="복용 약물">');
        expect(basic.match(/name="med-chk"/g)).toHaveLength(4);
        expect(basic).toContain('id="prof-med-other"');
        expect(INDEX).not.toContain('id="health-meds-card"');
        expect(INDEX.match(/name="med-chk"/g)).toHaveLength(4);
    });

    it('opens basic info for someone who has not filled it, folds it for someone who has', () => {
        const fn = FOLDS.split('export function applyHealthCardFoldDefaults() {')[1].split('\n}')[0];
        expect(fn).toContain('if (basic) basic.open = !describeBasicInfo(inputs.basic, en);');
        expect(AUTH).toContain('window.applyHealthCardFoldDefaults?.();');
    });

    it('is loaded at start and kept for offline use', () => {
        expect(MAIN).toMatch(/import '\.\/health-card-folds\.js\?v=\d+';/);
        expect(SW).toMatch(/'\.\/js\/health-card-folds\.js\?v=\d+',/);
    });
});

describe('the folded summary line is never cut off', () => {
    it('drops to its own row and wraps when folded, and hides when open', () => {
        // 2026-11-14 대표: "총 192 · … 이렇게 잘리는데 펼쳤을 때는 지우고 접었을 때는 아래줄에 잘리지 않게 두줄로"
        expect(CSS).toMatch(/\.health-fold-summary \{[^}]*flex-wrap: wrap;/);
        const line = CSS.match(/\.health-fold-line \{[^}]*\}/)?.[0] || '';
        expect(line).toContain('flex: 1 1 100%;');
        expect(line).toContain('white-space: normal;');
        expect(line).not.toContain('text-overflow: ellipsis');
        expect(CSS).toContain('details[open] > .health-fold-summary .health-fold-line { display: none; }');
    });
});

describe('cholesterol lives with the blood test but can still be typed in', () => {
    it('keeps both input boxes, now inside the blood test card', () => {
        expect(bloodCard).toContain('id="blood-chol-manual"');
        expect(bloodCard).toContain('id="prof-total-chol"');
        expect(bloodCard).toContain('id="prof-hdl"');
        expect(INDEX.match(/id="prof-total-chol"/g)).toHaveLength(1);
        expect(INDEX).not.toContain('data-sensitive-card="콜레스테롤"');
    });

    it('says when to use it', () => {
        expect(bloodCard).toContain('결과지에 콜레스테롤 항목이 없으면 여기에 직접 적으세요.');
    });

    it('is still saved by the one save button', () => {
        const save = APP.split('window.saveHealthProfile = ')[1].split('\n};')[0];
        expect(save).toContain("document.getElementById('prof-total-chol')?.value");
        expect(save).toContain("document.getElementById('prof-hdl')?.value");
    });
});

describe('the PDF password box does not look like a login to the browser', () => {
    const PDF = readRepoFile('js/blood-test-pdf.js');

    it('is a text box masked with dots, so Chrome does not offer to save it', () => {
        // 2026-11-13 제보: PDF 비밀번호를 넣자 "비밀번호를 저장하시겠습니까?" 가 떴다.
        expect(PDF).not.toContain("input.type = 'password'");
        expect(PDF).toContain("input.type = 'text';");
        expect(PDF).toContain('-webkit-text-security:disc;');
        expect(PDF).toContain("input.autocomplete = 'off';");
    });
});
