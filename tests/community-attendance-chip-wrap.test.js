import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { buildAttendanceChipsHtml } from '../js/community-stats-view.js';

// 2026-10-20 제보(운영 v521, 안드로이드 앱): "식단 개근 운동 개근 마음 개근 뒤에 몇명
// 숫자가 안보인다". 대시보드의 커뮤니티 현황은 개근 칩 세 개를 한 줄에 두고, 넘치면
// … 으로 잘랐다. 글씨가 큰 폰에서는 "🥗 식단 개근…" 까지만 보이고 정작 알려 줘야 할
// 사람 수가 잘렸다.

const CSS = readRepoFile('styles-features.css');
const rule = (selector) => {
    const start = CSS.indexOf(`\n${selector} {`);
    if (start < 0) throw new Error(`찾지 못함: ${selector}`);
    return CSS.slice(start, CSS.indexOf('}', start));
};

describe('개근 칩은 사람 수를 자르지 않는다', () => {
    it('넘치면 … 으로 자르지 않고 줄을 바꾼다', () => {
        const chip = rule('.cat-king');
        expect(chip).not.toMatch(/text-overflow:\s*ellipsis/);
        expect(chip).not.toMatch(/white-space:\s*nowrap/);
        expect(chip).not.toMatch(/overflow:\s*hidden/);
    });

    it('사람 수는 한 덩어리로 둔다 — "12" 와 "명" 이 갈라지지 않게', () => {
        expect(rule('.cat-king strong')).toMatch(/white-space:\s*nowrap/);
    });

    it('사람 수는 그 strong 안에 있다', () => {
        const html = buildAttendanceChipsHtml({
            statsVersion: 2,
            perfectAttendance: { days: 19, diet: 12, exercise: 5, mind: 3 }
        });
        expect(html).toContain('<strong>12명</strong>');
    });
});
