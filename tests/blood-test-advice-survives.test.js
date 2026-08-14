import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

const APP = readAppSource();
const ANALYSIS = readRepoFile('js/diet-analysis.js');
const RUNTIME = readRepoFile('functions/runtime.js');
const CSS = readRepoFile('styles-features.css');

// 이 기능의 기획 의도는 건강검진 결과지를 읽어 조언을 주는 것이었다. 분석은 실제로
// 그렇게 동작하지만, 이력 표에는 등급과 숫자 셋만 남아서 화면을 벗어나는 순간 소견과
// 조언이 사라졌다. 저장은 이미 되고 있었으므로 보여주기만 하면 되는 문제였다.

describe('the analysis asks for the advice the feature exists to give', () => {
    it('requests a summary and advice, not just numbers', () => {
        const prompt = RUNTIME.split('const BLOOD_TEST_ANALYSIS_PROMPT = `')[1].split('`;')[0];
        expect(prompt).toContain('"summary"');
        expect(prompt).toContain('"advice"');
        expect(prompt).toContain('"overallGrade"');
        expect(prompt).toContain('생활습관 개선 조언');
    });

    it('stores them alongside the metrics', () => {
        // analysis 를 통째로 펼쳐 넣으므로 summary/advice 도 함께 저장된다.
        expect(RUNTIME).toContain('...analysis,');
    });
});

describe('the advice is shown when the result first arrives', () => {
    it('renders the summary, the risk items and the advice', () => {
        expect(ANALYSIS).toContain('escapeHtml(analysis.summary || \'\')');
        expect(ANALYSIS).toContain('analysis.advice ?');
        expect(ANALYSIS).toContain('const riskHtml = (analysis.riskItems || [])');
    });
});

describe('the advice is still there afterwards', () => {
    it('carries summary and advice into the history rows', () => {
        expect(APP).toContain("const summary = String(r.summary || '').trim();");
        expect(APP).toContain("const advice = String(r.advice || '').trim();");
        expect(APP).toContain('class="blood-test-detail"');
    });

    it('folds them away so the table stays readable', () => {
        expect(APP).toContain('<summary>소견·조언 보기</summary>');
        expect(CSS).toContain('.blood-test-detail {');
        expect(CSS).toContain('.blood-test-detail-advice { background: #E8F5E9; color: #2E7D32; }');
    });

    it('adds no row when there is nothing to say', () => {
        expect(APP).toContain('const detailHtml = (summary || advice)');
        expect(APP).toContain("            : '';");
    });

    it('escapes what it prints, since this is model output', () => {
        // 이 표는 예전에 값들을 그대로 넣고 있었다. 모델이 만든 문자열이 들어오는 자리다.
        const rows = APP.split('const rowsHtml = records.map(r => {')[1].split('}).join(\'\');')[0];
        expect(rows).toContain('escapeHtml(summary)');
        expect(rows).toContain('escapeHtml(advice)');
        expect(rows).toContain('escapeHtml(String(gl))');
        expect(rows).toContain('escapeHtml(String(grade))');
    });
});
