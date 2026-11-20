import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-11-21 대표: "매 식단마다 아래에 식단 팁 · 과자·가공육·달콤한 음료를 멈추고 단백질과
// 채소로 채우기 붙는데 같은 메세지라면 필요 없어. 식단 맨 아래에 한번만 붙던가"
// → 팁은 식단 사진 칸 맨 아래에 한 번만, 분석이 하나라도 있을 때만.

const APP = readRepoFile('js/app-core.js');
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'meal5', 'meal6'];

function makeDom() {
    const nodes = {};
    const boxes = { id: 'diet-boxes-container', children: [], appendChild(el) {
        this.children = this.children.filter((c) => c !== el);
        this.children.push(el);
        el.parent = this;
        nodes[el.id] = el;
    } };
    nodes['diet-boxes-container'] = boxes;
    SLOTS.forEach((slot) => { nodes[`diet-analysis-${slot}`] = { _analysisData: null }; });
    const document = {
        getElementById: (id) => nodes[id] || null,
        querySelectorAll: () => [],
        createElement: () => ({ id: '', className: '', textContent: '', remove() {
            if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
            delete nodes[this.id];
        } }),
    };
    return { document, nodes, boxes };
}

function loadRefresh(document, tip) {
    const start = APP.indexOf('function refreshDietProgramAnalysisTips() {');
    const end = APP.indexOf('\n}\n', start) + 2;
    expect(start).toBeGreaterThan(-1);
    // eslint-disable-next-line no-new-func
    return Function('document', 'DIET_SLOTS', 'getDietProgramAnalysisTip', 'getCurrentDietProgramPreferences',
        `${APP.slice(start, end)}\nreturn refreshDietProgramAnalysisTips;`)(document, SLOTS, () => tip, () => ({}));
}

describe('식단 팁은 맨 아래에 한 번만', () => {
    it('끼니 셋을 분석해도 팁은 하나, 사진 칸들 맨 끝에', () => {
        const { document, nodes, boxes } = makeDom();
        boxes.children.push({ id: 'diet-box-breakfast' });
        const refresh = loadRefresh(document, '식단 팁 · 과자를 멈추고 채소로 채우기');
        ['breakfast', 'lunch', 'dinner'].forEach((slot) => {
            nodes[`diet-analysis-${slot}`]._analysisData = { grade: 'B' };
            refresh();
        });
        const tips = boxes.children.filter((c) => c.id === 'diet-program-analysis-tip');
        expect(tips).toHaveLength(1);
        expect(boxes.children[boxes.children.length - 1]).toBe(tips[0]);
        expect(tips[0].textContent).toContain('식단 팁');
    });

    it('분석이 모두 사라지면 팁도 사라지고, 식단 방법이 없으면 붙지 않는다', () => {
        const { document, nodes, boxes } = makeDom();
        const refresh = loadRefresh(document, '식단 팁 · x');
        nodes['diet-analysis-lunch']._analysisData = { grade: 'A' };
        refresh();
        expect(boxes.children).toHaveLength(1);
        nodes['diet-analysis-lunch']._analysisData = null;
        refresh();
        expect(boxes.children).toHaveLength(0);

        const none = makeDom();
        none.nodes['diet-analysis-lunch']._analysisData = { grade: 'A' };
        loadRefresh(none.document, '')();
        expect(none.boxes.children).toHaveLength(0);
    });

    it('끼니 결과 칸에는 더 이상 붙이지 않는다', () => {
        expect(APP).not.toContain('function renderDietProgramAnalysisTip(');
        expect(APP).not.toMatch(/resultContainer\.appendChild\(tipEl\)/);
    });
});
