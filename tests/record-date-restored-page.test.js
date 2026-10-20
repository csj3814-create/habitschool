import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-10-18·19 제보(안드로이드 앱, v521): "8시55분에 사진을 등록하려하니 이전날짜라고 나옵니다",
// "오전 7시25분 날짜 변경 안되었어요". 캡처의 날짜 칸이 아침인데도 어제였다.
//
// 재현: 날짜 칸을 어제로 둔 채 다른 페이지로 갔다가 뒤로 오면(back_forward — 휴대폰이 밤새
// 내려 둔 페이지를 아침에 되살릴 때와 같은 길) 앱은 날짜를 오늘로 맞추지만, 브라우저가 그 뒤에
// 칸의 지난 값(어제)을 되살린다. 앱은 오늘을 이미 확인했다고 기억해서 다시 열어도 넘기지 않았다.
// 같은 실험에서 autocomplete="off" 를 단 칸은 처음부터 오늘로 나왔다.

const APP_CORE = readRepoFile('js/app-core.js');

function selectedDateInput(html) {
    return html.match(/<input[^>]*id="selected-date"[^>]*>/)?.[0] || '';
}

describe('되살린 페이지에서도 날짜 칸은 오늘이다', () => {
    it('브라우저가 날짜 칸의 지난 값을 되살리지 않는다 (한국어·영어 앱)', () => {
        expect(selectedDateInput(readRepoFile('index.html'))).toContain('autocomplete="off"');
        expect(selectedDateInput(readRepoFile('en/index.html'))).toContain('autocomplete="off"');
    });

    it('기록 이동으로 다시 불린 페이지도 새로고침처럼 오늘로 맞춘다', () => {
        const guard = APP_CORE.split('function installRecordDateReloadGuard() {')[1]?.split('\n}\n')[0] || '';
        expect(APP_CORE).toContain("return type === 'reload' || type === 'back_forward';");
        expect(guard).toContain('if (isFormRestoringNavigation(navigationType)) {');
        expect(guard).toContain('if (event.persisted || isFormRestoringNavigation()) {');
        expect(guard).not.toContain("getPageNavigationType() === 'reload'");
    });
});
