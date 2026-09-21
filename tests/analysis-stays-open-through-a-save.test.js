import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-21 요청: "식단 운동 수면 ai분석하고 나면 다시 저장하느라 자동으로
// 접히는데 저장했을 때엔 자동으로 펼쳐져 있게 해 줘."
//
// 저장하면 기록을 다시 읽어 화면을 새로 그린다. 되살리는 쪽은 저장된 분석을 늘
// 접어 두었는데(지난 날을 열 때는 그게 맞다), 방금 분석을 읽고 있던 사람에게는
// 읽던 글이 눈앞에서 닫히는 일이 된다.
//
// 접어 둔 것을 함부로 펴서도 안 된다. 접은 것도 그 사람의 선택이다.

const APP = readRepoFile('js/app-core.js');

function loadMemory() {
    const start = APP.indexOf('const _expandedAnalysisSlots = new Set();');
    const end = APP.indexOf('// 식단 사진 AI 분석', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return Function(`${APP.slice(start, end)}
        return { analysisSlotKey, noteAnalysisExpanded, wasAnalysisExpanded,
                 setAnalysisExpanded, resetExpandedAnalysisSlotsFor };`)();
}

const makeBox = () => ({ style: { display: 'none' } });
const makeBtn = () => ({ textContent: '' });

describe('an analysis you were reading stays open through a save', () => {
    it('remembers the slots that are open right now', () => {
        const m = loadMemory();
        m.resetExpandedAnalysisSlotsFor('2026-09-21');
        m.setAnalysisExpanded(makeBox(), makeBtn(), true, m.analysisSlotKey('diet', 'lunch'));
        expect(m.wasAnalysisExpanded(m.analysisSlotKey('diet', 'lunch'))).toBe(true);
        // 다른 끼니까지 펼쳐지지는 않는다.
        expect(m.wasAnalysisExpanded(m.analysisSlotKey('diet', 'dinner'))).toBe(false);
    });

    it('forgets a slot the member collapsed on purpose', () => {
        const m = loadMemory();
        m.resetExpandedAnalysisSlotsFor('2026-09-21');
        const key = m.analysisSlotKey('sleep');
        m.setAnalysisExpanded(makeBox(), makeBtn(), true, key);
        m.setAnalysisExpanded(makeBox(), makeBtn(), false, key);
        expect(m.wasAnalysisExpanded(key)).toBe(false);
    });

    it('moves the button label with the panel, never apart from it', () => {
        const m = loadMemory();
        const box = makeBox();
        const btn = makeBtn();
        m.setAnalysisExpanded(box, btn, true, 'sleep');
        expect(box.style.display).toBe('block');
        expect(btn.textContent).toBe('🤖 분석 접기');
        m.setAnalysisExpanded(box, btn, false, 'sleep');
        expect(box.style.display).toBe('none');
        expect(btn.textContent).toBe('🤖 분석 보기');
    });

    it('keeps each exercise block apart by its media id', () => {
        const m = loadMemory();
        m.resetExpandedAnalysisSlotsFor('2026-09-21');
        m.setAnalysisExpanded(makeBox(), makeBtn(), true, m.analysisSlotKey('exercise', 'media-a'));
        expect(m.wasAnalysisExpanded(m.analysisSlotKey('exercise', 'media-a'))).toBe(true);
        expect(m.wasAnalysisExpanded(m.analysisSlotKey('exercise', 'media-b'))).toBe(false);
    });

    it('drops the memory when another day is opened', () => {
        const m = loadMemory();
        m.resetExpandedAnalysisSlotsFor('2026-09-21');
        m.setAnalysisExpanded(makeBox(), makeBtn(), true, m.analysisSlotKey('diet', 'lunch'));
        m.resetExpandedAnalysisSlotsFor('2026-09-20');
        expect(m.wasAnalysisExpanded(m.analysisSlotKey('diet', 'lunch'))).toBe(false);
    });

    it('keeps the memory when the same day is read again, which is what a save does', () => {
        const m = loadMemory();
        m.resetExpandedAnalysisSlotsFor('2026-09-21');
        m.setAnalysisExpanded(makeBox(), makeBtn(), true, m.analysisSlotKey('diet', 'lunch'));
        m.resetExpandedAnalysisSlotsFor('2026-09-21');
        expect(m.wasAnalysisExpanded(m.analysisSlotKey('diet', 'lunch'))).toBe(true);
    });
});

describe('all three kinds of analysis go through the same memory', () => {
    const restoredWith = (marker) => {
        const at = APP.indexOf(marker);
        expect(at, `${marker} 를 찾지 못했다`).toBeGreaterThan(-1);
        return APP.slice(at, at + 700);
    };

    it('restores the diet panel to the state it was in', () => {
        const near = restoredWith('            renderDietProgramAnalysisTip(resultContainer);\n            // 처음에는');
        expect(near).toContain("wasAnalysisExpanded(analysisSlotKey('diet', meal))");
        // 예전에는 무조건 접었다.
        expect(near).not.toContain("resultContainer.style.display = 'none'; // 분석결과는 처음에 접기");
    });

    it('restores the sleep panel to the state it was in', () => {
        const near = restoredWith('renderSleepMindAnalysisResult(data.sleepAndMind.sleepAnalysis, sleepResultBox);');
        expect(near).toContain("wasAnalysisExpanded(analysisSlotKey('sleep'))");
        expect(near).not.toContain("sleepResultBox.style.display = 'none';");
    });

    it('restores each exercise panel to the state it was in', () => {
        const near = restoredWith('        const savedResultBox = div.querySelector(\'.exercise-ai-result\');');
        expect(near).toContain("wasAnalysisExpanded(analysisSlotKey('exercise', div.dataset.mediaId))");
        expect(near).not.toContain("savedResultBox.style.display = 'none';");
    });

    it('marks a freshly finished analysis as open', () => {
        // 분석이 막 끝난 자리는 펼쳐진 채로 기억돼야, 이어지는 저장이 그것을 지킨다.
        expect(APP).toContain("setAnalysisExpanded(resultContainer, btn, true, analysisSlotKey('diet', meal));");
        expect(APP).toContain("setAnalysisExpanded(resultBox, aiBtn, true, analysisSlotKey('sleep'));");
        expect(APP).toContain("setAnalysisExpanded(resultBox, btn, true, analysisSlotKey('exercise', block?.dataset?.mediaId));");
    });

    it('still refuses to open something an upload analysed on its own', () => {
        // 자동 실행은 토글할 자격이 없다. 그 규칙은 그대로다.
        const diet = APP.split('async function analyzeMealPhoto(')[1].slice(0, 900);
        expect(diet).toContain('if (auto) return;');
    });
});
