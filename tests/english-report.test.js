import { describe, expect, it } from 'vitest';
import { EN_MESSAGES } from '../js/i18n-en.js';
import { KO_MESSAGES } from '../js/i18n-ko.js';
import { readRawRepoFile } from './source-helpers.js';

// 해외 3단계 E5-3 (2026-10-22): 30일 결과지를 영어 앱에 연다.
// 화면 글은 모두 사전(report.*)으로 옮겼다. 한국어 글자는 그대로다(tests/korean-app-unchanged-i18n.test.js).
const HANGUL = /[가-힣]/;
const APP = readRawRepoFile('js/app-core.js');
const REPORT = APP.slice(APP.indexOf('function summarizeReportActivity('), APP.indexOf('window.switchFastingGraph = function'));

describe('30일 결과지는 영어 앱에서 영어로 그려진다', () => {
    it('결과지 코드에 화면으로 나갈 한글이 없다 (서버가 적는 강도 낱말 표와 시간 초과 표식만 빼고)', () => {
        const lines = REPORT.split('\n')
            .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
            .filter((line) => !line.includes('console.'))
            .filter((line) => !line.includes('const REPORT_INTENSITY_KEYS'))
            // 읽기가 넘쳤는지 가르는 표식. 화면에는 연결 문장이 나간다.
            .filter((line) => !line.includes('const REPORT_READ_TIMEOUT_MESSAGE'))
            .map((line) => line.replace(/\s\/\/\s.*$/, ''))
            .filter((line) => HANGUL.test(line));
        expect(lines).toEqual([]);
    });

    it('결과지가 쓰는 사전 키가 영어 사전에 모두 있다', () => {
        const keys = [...REPORT.matchAll(/t\('(report\.[\w.]+)'/g)].map((m) => m[1]);
        expect(keys.length).toBeGreaterThan(40);
        for (const key of keys) expect(EN_MESSAGES[key], key).toBeTruthy();
        for (const key of ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']) {
            expect(EN_MESSAGES[`report.weekday.${key}`]).toBeTruthy();
            expect(KO_MESSAGES[`report.weekday.${key}`]).toBeTruthy();
        }
        for (const axis of ['minerals', 'fiber', 'vitamins', 'antioxidants']) expect(EN_MESSAGES[`report.axis.${axis}`]).toBeTruthy();
    });

    it('한국어 결과지의 낱말은 예전 그대로다', () => {
        expect(KO_MESSAGES['report.title']).toBe('☀️ 해빛스쿨 30일 종합 결과지');
        expect(KO_MESSAGES['report.dayCount']).toBe('{n}일');
        expect(KO_MESSAGES['report.activity.who']).toBe('🎯 세계보건기구 권장은 주 {min}~{max}분입니다.');
        expect(KO_MESSAGES['report.weekday.sun']).toBe('일');
    });

    it('운동 강도는 한국어 화면에서는 낱말 그대로, 다른 언어는 사전으로', () => {
        const fn = REPORT.split('function reportIntensityLabel(level) {')[1].split('\n}\n')[0];
        expect(fn).toContain("getLocale() === 'ko' || !key ? level : t(`exercise.intensity.${key}`)");
        expect(REPORT).toContain('escapeHtml(reportIntensityLabel(level))');
    });

    it('숫자 자리 표시는 보는 사람 언어로', () => {
        expect(REPORT).not.toContain("toLocaleString('ko-KR')");
        expect(REPORT).toContain("toLocaleString(getLocale() === 'ko' ? 'ko-KR' : 'en-US')");
    });
});
