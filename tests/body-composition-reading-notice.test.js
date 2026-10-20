import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-10-17 제보(대표): "체성분 결과 채울 때 시간이 걸리는데 안내가 부족해. 분석하고 있습니다
// 메세지에 잠시 기다려 달라는 말 추가하고 눈에 잘 띄게 해줘"
// 회색 13px 한 줄("체성분 결과를 읽고 있습니다...")이라 멈춘 것처럼 보였다.

const APP_CORE = readRepoFile('js/app-core.js');
const ANALYZE = APP_CORE.split('async function analyzeBodyCompositionFile(')[1]?.split('\n}\n')[0] || '';

describe('체성분을 읽는 동안의 안내', () => {
    it('기다려 달라는 말이 있다', () => {
        expect(ANALYZE).toContain('체성분 결과를 분석하고 있어요.');
        expect(ANALYZE).toContain('시간이 조금 걸려요. 화면을 닫지 말고 잠시만 기다려 주세요.');
        expect(ANALYZE).toContain('Please wait and keep this screen open.');
    });

    it('눈에 띄는 상자에 굵게 보이고, 화면 읽기 프로그램도 알린다', () => {
        expect(ANALYZE).toContain('class="body-composition-reading" role="status" aria-live="polite"');
        expect(ANALYZE).toContain('background:#F3E5F5');
        expect(ANALYZE).toContain('font-size:15px; font-weight:700;');
        expect(ANALYZE).not.toContain('체성분 결과를 읽고 있습니다...');
    });
});
