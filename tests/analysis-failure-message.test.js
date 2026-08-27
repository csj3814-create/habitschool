import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const SOURCE = readRepoFile('js/diet-analysis.js');
const I18N = readRepoFile('js/i18n.js');

// 실패 코드를 삼키면 제보가 "분석이 실패했대요"로만 돌아온다. 토큰 만료인지
// 타임아웃인지 서버 오류인지 가릴 단서가 화면에 남아야 한다.
describe('AI analysis failures stay legible', () => {
    const CALL_SITES = [
        'Diet analysis error:',
        'Sleep/mind analysis error:',
        'Blood test analysis error:',
        'Step screenshot analysis error:'
    ];

    it.each(CALL_SITES)('routes %s through analysisFailureMessage', (marker) => {
        const at = SOURCE.indexOf(marker);
        expect(at, `${marker} not found`).toBeGreaterThan(-1);
        // 같은 catch 블록 안에서 토스트가 헬퍼를 거치는지 본다.
        const block = SOURCE.slice(at, at + 400);
        expect(block).toContain('analysisFailureMessage(');
        expect(block).toContain('showToast(');
    });

    it('keeps a bare showToast out of every analysis catch block', () => {
        // showToast(isEnglishLocale() ? ... ) 를 catch 안에 직접 쓰면 코드가 사라진다.
        CALL_SITES.forEach((marker) => {
            const block = SOURCE.slice(SOURCE.indexOf(marker), SOURCE.indexOf(marker) + 400);
            expect(block).not.toMatch(/showToast\(\s*isEnglishLocale\(\)/);
        });
    });

    it('maps the codes a user cannot act on into plain sentences', () => {
        ['unauthenticated', 'deadline-exceeded', 'resource-exhausted', 'unavailable']
            .forEach((code) => expect(SOURCE).toContain(`'${code}':`));
    });

    it('strips the functions/ prefix before matching a code', () => {
        expect(SOURCE).toMatch(/replace\(\s*\/\^functions\\\/\/\s*,\s*''\s*\)/);
    });

    it('appends an unmapped code to the fallback instead of dropping it', () => {
        expect(SOURCE).toMatch(/\$\{fallback\}\s*\(\$\{code\}\)/);
    });

    it('ships both locales for every analysis message key', () => {
        const keys = ['analysis.signedOut', 'analysis.tooSlow', 'analysis.busy', 'analysis.offline'];
        keys.forEach((key) => {
            const hits = I18N.split(`'${key}':`).length - 1;
            expect(hits, `${key} needs a ko and an en entry`).toBe(2);
        });
    });
});
