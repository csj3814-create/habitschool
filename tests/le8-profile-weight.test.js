import { describe, expect, it } from 'vitest';
import { calculateLE8Score } from '../js/le8-score.js';
import { readRepoFile } from './source-helpers.js';

// 2026-09-24 제보: "Fitdays 데이터를 저장하고 점수 갱신을 눌렀는데 건강습관 점수가
// 반응이 없어. 새로고침해도 안 바뀌어." 체성분 칸에 체중 74.5kg·키 184cm 가 저장돼
// 있었는데, 체중 항목은 일일 기록만 봐서 최근 7일 체중이 없는 회원은 "체중 기록 필요"
// 로 빠져 있었다.
const log = (date, weight) => ({ date, metrics: weight === undefined ? {} : { weight } });

describe('건강습관 점수의 체중은 더 최근에 잰 쪽을 쓴다', () => {
    it('일일 기록에 체중이 없으면 체성분 체중을 쓴다', () => {
        const r = calculateLE8Score({ heightCm: 184, weight: 74.5, weightDate: '2026-09-24' }, [log('2026-09-24')]);
        expect(r.factors.bmi.missing).toBeUndefined();
        expect(r.factors.bmi.bmi).toBe(22);
        expect(r.factors.bmi.detail).toContain('체성분 체중');
    });

    it('체성분이 더 최근이면 그것을 쓴다', () => {
        const r = calculateLE8Score({ heightCm: 170, weight: 70, weightDate: '2026-09-24' }, [log('2026-09-20', 80)]);
        expect(r.factors.bmi.bmi).toBe(24.2);
    });

    it('일일 기록이 더 최근이면 그것을 쓴다', () => {
        const r = calculateLE8Score({ heightCm: 170, weight: 70, weightDate: '2026-09-18' }, [log('2026-09-20', 80)]);
        expect(r.factors.bmi.bmi).toBe(27.7);
        expect(r.factors.bmi.detail).not.toContain('체성분 체중');
    });

    it('측정일을 모르는 체성분 체중은 저장한 날로 본다', () => {
        const r = calculateLE8Score({ heightCm: 170, weight: 70, updatedAt: '2026-09-24T11:07:59.462Z' }, [log('2026-09-20', 80)]);
        expect(r.factors.bmi.bmi).toBe(24.2);
    });

    it('둘 다 없으면 여전히 체중 기록을 부탁한다', () => {
        const r = calculateLE8Score({ heightCm: 170 }, []);
        expect(r.factors.bmi.missing).toBe(true);
    });
});

describe('저장하면 점수가 어떻게 바뀌었는지 바로 말한다', () => {
    const APP = readRepoFile('js/app-core.js');
    const save = APP.split('window.saveHealthProfile = async function () {')[1].split('\n};\n')[0];

    it('체중과 함께 잰 날을 남긴다', () => {
        expect(save).toContain('profileData.weightDate =');
    });

    it('다시 계산한 점수를 기다려 전후를 말하고 카드를 짚는다', () => {
        expect(save).toContain('const after = await updateMetabolicScoreUI();');
        expect(save).toContain('showToast(describeScoreRefresh(before, after));');
        expect(save).toContain('focusElementWithHighlight(le8Card)');
    });

    it('점수 계산은 결과를 돌려준다', () => {
        const fn = APP.split('async function updateMetabolicScoreUI() {')[1].split('\n};\n')[0];
        expect(fn).toContain('return { ..._lastScoreTotals };');
        expect(fn).toContain('return null;');
    });

    it('문장이 바뀐 것과 그대로인 것을 가른다', () => {
        const src = APP.split('function describeScoreRefresh(')[1].split('\n}\n')[0];
        const describe = Function(`return function describeScoreRefresh(${src}\n}`)();
        expect(describe({ le8: 72, metabolic: 60 }, { le8: 78, metabolic: 60 })).toBe('🧬 저장했어요 · 건강습관 72 → 78점 · 대사건강 60점 (그대로)');
        expect(describe({ le8: null, metabolic: null }, { le8: 78, metabolic: null })).toContain('건강습관 78점');
        expect(describe({}, null)).toContain('잠시 뒤');
    });
});
