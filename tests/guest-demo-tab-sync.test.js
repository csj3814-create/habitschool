import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const DEMO = readRepoFile('js/guest-demo.js');
const APP = readRepoFile('js/app-core.js');

// "운동 기록 남기러 가기" 를 누르면 화면은 운동 탭으로 가는데 상단 탭 표시와 밑줄은
// 식단에 그대로 머물렀다. 탭 버튼의 활성 표시는 앱의 openTab 안에서만 바뀌는데,
// 체험 모드의 "하러 가기" 는 컨트롤러 내부 openTab 을 직접 불러 그 과정을 건너뛰었다.
describe('the tour keeps the tab bar in step with the screen', () => {
    it('routes the step-guide jump through the app tab switch', () => {
        const handler = DEMO.split("const gotoElement = closestDataElement(event.target, '[data-guest-demo-goto]');")[1]
            .split('return;')[0];
        expect(handler).toContain("typeof window.openTab === 'function'");
        expect(handler).toContain('window.openTab(target);');
    });

    it('still works if the app tab switch is unavailable', () => {
        const handler = DEMO.split("const gotoElement = closestDataElement(event.target, '[data-guest-demo-goto]');")[1]
            .split('return;')[0];
        expect(handler).toContain("openTab(target, { source: 'step-guide' });");
    });

    it('confirms the active state really is the app openTab\'s job', () => {
        // 이 테스트가 지키는 전제. 여기가 옮겨가면 위 우회도 다시 봐야 한다.
        expect(APP).toContain('const btns = document.getElementsByClassName("tab-btn");');
        expect(APP).toContain('targetBtn.classList.add("active");');
        expect(APP).toContain('targetBtn.setAttribute("aria-current", "page");');
    });
});
