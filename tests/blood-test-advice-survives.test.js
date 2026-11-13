import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

const APP = readAppSource();
const ANALYSIS = readRepoFile('js/diet-analysis.js');
const RUNTIME = readRepoFile('functions/runtime.js');
const CSS = readRepoFile('styles-features.css');
const TREND = readRepoFile('js/blood-test-trend.js');

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
        // 2026-11-13: 이력은 추이 표 + 검사별 소견으로 바뀌었다. 최신 검사만 보이고 나머지는 접힌다.
        expect(APP).toContain('<details class="blood-test-detail${index > 0 ? \' fold-extra\' : \'\'}">');
    });

    it('folds them away so the table stays readable', () => {
        expect(APP).toContain("<span class=\"blood-test-detail-open\">${en ? 'Findings & advice' : '소견·조언 보기'}</span></summary>");
        expect(CSS).toContain('.blood-test-detail {');
        expect(CSS).toContain('.blood-test-detail-advice { background: #E8F5E9; color: #2E7D32; }');
    });

    it('says so when a test has no notes, instead of opening onto nothing', () => {
        expect(APP).toContain("${!summary && !advice ? `<p class=\"blood-test-detail-summary\">");
        expect(APP).toContain('이 검사에는 남은 소견이 없어요.');
    });

    it('escapes what it prints, since this is model output', () => {
        // 이 표는 예전에 값들을 그대로 넣고 있었다. 모델이 만든 문자열이 들어오는 자리다.
        const rows = APP.split('const itemsHtml = records.map((r, index) => {')[1].split('}).join(\'\');')[0];
        expect(rows).toContain('escapeHtml(summary)');
        expect(rows).toContain('escapeHtml(advice)');
        expect(rows).toContain('escapeHtml(String(grade))');
        // 수치는 추이 표가 그린다. 그쪽도 모델이 낸 값을 그대로 넣지 않는다.
        expect(TREND).toContain('escapeHtml(String(cell.value))');
        expect(TREND).toContain('escapeHtml(row.unit)');
    });
});
