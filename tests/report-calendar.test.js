import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-21 질문: "일별 기록 히트맵은 어떤 의미야? 날짜별로 잘 했는지 한눈에
// 보여주고 싶으면 달력처럼 만들어서 각 날짜별 점수와 색깔 보여줘."
//
// 물어보실 만했다. 예전 히트맵은 **달력처럼 보이는데 달력이 아니었다.**
//
//   - 7칸씩 끊어 놓아 요일처럼 보이지만 요일과 맞춰 놓지 않았다
//   - 기록이 있는 날만 칸을 만들어서, 쉰 날은 사라지고 다음 날이 그 자리로 당겨졌다
//
// 쉰 날이 보이지 않으면 "한눈에" 볼 수가 없다. 아래 시험은 그 두 가지를 못 박는다.

const APP = readRepoFile('js/app-core.js');
const CSS = readRepoFile('styles-reports.css');
const HTML = readRepoFile('index.html');

function loadCalendar() {
    const start = APP.indexOf("const REPORT_CALENDAR_WEEKDAYS = Object.freeze(");
    const end = APP.indexOf('const REPORT_DIET_AXIS_LABELS', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return Function(`${APP.slice(start, end)}
        return { buildReportCalendar, renderReportCalendar, reportPointsTone, REPORT_CALENDAR_WEEKDAYS };`)();
}

const log = (date, points) => ({ date, userId: 'u1', awardedPoints: { dietPoints: points, exercisePoints: 0, mindPoints: 0 } });
const flat = (weeks) => weeks.flat();
const cellOn = (weeks, date) => flat(weeks).find((c) => c.date === date);

describe('the day grid is an actual calendar', () => {
    const cal = loadCalendar();

    it('puts every date in its own weekday column', () => {
        // 2026-09-21 은 월요일이다. 일요일부터 시작하는 격자에서 두 번째 칸이다.
        const weeks = cal.buildReportCalendar([log('2026-09-21', 50)]);
        expect(weeks).toHaveLength(1);
        expect(weeks[0]).toHaveLength(7);
        expect(weeks[0][1].date).toBe('2026-09-21');
        expect(cal.REPORT_CALENDAR_WEEKDAYS[1]).toBe('월');
    });

    it('pads out to whole weeks and marks the padding as outside', () => {
        const weeks = cal.buildReportCalendar([log('2026-09-21', 50)]);
        const outside = flat(weeks).filter((c) => c.tone === 'outside');
        expect(outside).toHaveLength(6);
        expect(outside.every((c) => !c.inRange)).toBe(true);
    });

    it('keeps a skipped day visible instead of closing the gap', () => {
        // 예전 히트맵은 기록이 있는 날만 칸을 만들어 20일이 사라지고 21일이
        // 그 자리로 당겨졌다. 쉰 날이 안 보이면 달력이 아니다.
        const weeks = cal.buildReportCalendar([log('2026-09-19', 50), log('2026-09-21', 50)]);
        const skipped = cellOn(weeks, '2026-09-20');
        expect(skipped).toBeTruthy();
        expect(skipped.inRange).toBe(true);
        expect(skipped.recorded).toBe(false);
        expect(skipped.tone).toBe('none');
        // 그리고 19일과 21일은 제 요일에 그대로 있다.
        expect(cellOn(weeks, '2026-09-19').day).toBe(19);
        expect(cellOn(weeks, '2026-09-21').day).toBe(21);
    });

    it('spans more than one month without losing the month', () => {
        const weeks = cal.buildReportCalendar([log('2026-08-23', 50), log('2026-09-21', 50)]);
        const first = cellOn(weeks, '2026-09-01');
        expect(first.month).toBe(9);
        expect(first.day).toBe(1);
        // 달이 바뀌는 날은 화면에서 9/1 로 적는다. 1 만 적으면 어느 달인지 모른다.
        const html = cal.renderReportCalendar(weeks);
        expect(html).toContain('>9/1<');
    });

    it('colours by the points of that day', () => {
        expect(cal.reportPointsTone(0)).toBe('none');
        expect(cal.reportPointsTone(15)).toBe('low');
        expect(cal.reportPointsTone(35)).toBe('mid');
        expect(cal.reportPointsTone(65)).toBe('high');
        expect(cal.reportPointsTone(95)).toBe('best');
    });

    it('writes the score into the cell, not only the colour', () => {
        const html = cal.renderReportCalendar(cal.buildReportCalendar([log('2026-09-21', 65)]));
        expect(html).toContain('65P');
        expect(html).toContain('class="rc-cell rc-high"');
        expect(html).toContain('title="2026-09-21 · 65P"');
    });

    it('says a day has no record rather than calling it zero points', () => {
        const weeks = cal.buildReportCalendar([log('2026-09-19', 50), log('2026-09-21', 50)]);
        const html = cal.renderReportCalendar(weeks);
        expect(html).toContain('title="2026-09-20 · 기록 없음"');
        expect(html).not.toContain('title="2026-09-20 · 0P"');
    });

    it('labels the weekdays so the columns mean something', () => {
        const html = cal.renderReportCalendar(cal.buildReportCalendar([log('2026-09-21', 50)]));
        ['일', '월', '화', '수', '목', '금', '토'].forEach((name) => {
            expect(html).toContain(`>${name}</div>`);
        });
        expect(html).toContain('rc-head rc-sun');
        expect(html).toContain('rc-head rc-sat');
    });

    it('returns nothing rather than an empty grid when there is nothing', () => {
        expect(cal.buildReportCalendar([])).toEqual([]);
        expect(cal.renderReportCalendar([])).toBe('');
    });
});

describe('the calendar replaces the heatmap everywhere', () => {
    it('leaves no heatmap behind in code or styles', () => {
        expect(APP).not.toContain('report-heatmap');
        expect(APP).not.toContain('hm-cell');
        expect(CSS).not.toContain('.hm-cell');
        expect(CSS).not.toContain('.report-heatmap');
    });

    it('tells the member how many days they skipped', () => {
        expect(APP).toContain('const skippedDays = calendarWeeks.flat().filter((cell) => cell.inRange && !cell.recorded).length;');
        expect(APP).toContain('이 기간에 ${skippedDays}일은 기록이 없었어요.');
    });

    it('does not require an optional section before it will print', () => {
        // activity·ai·health 는 자료가 있을 때만 그려진다. 인쇄가 그것들을
        // 기다리면 걸음수도 운동도 없는 회원은 인쇄가 조용히 아무 일도 안 한다.
        expect(APP).toContain('const hasAllRequiredSections = REPORT_PRINT_REQUIRED_SECTIONS.every');
        expect(APP).toContain("REPORT_PRINT_OPTIONAL_SECTIONS = Object.freeze(['activity', 'ai', 'health']);");

        const required = APP.split('REPORT_PRINT_REQUIRED_SECTIONS = Object.freeze(')[1].split(');')[0];
        expect(required).toContain('!REPORT_PRINT_OPTIONAL_SECTIONS.includes(name)');
    });
});

describe('the report can be closed from the top', () => {
    it('has an x in the header as well as the button at the bottom', () => {
        // 결과지는 길어서 끝까지 내려가야 닫기가 나온다.
        expect(HTML).toContain('class="report-close-x" onclick="close30DayReport()"');
        expect(HTML).toContain('aria-label="결과지 닫기"');
        // 아래 닫기 버튼은 그대로 둔다 — 다 읽고 내려온 사람에게는 그쪽이 가깝다.
        expect(HTML).toContain('class="report-btn report-btn-close"');
    });

    it('positions it against the header, not the page', () => {
        const header = CSS.split('.report-header {')[1].split('}')[0];
        expect(header).toContain('position: relative;');
        const x = CSS.split('.report-close-x {')[1].split('}')[0];
        expect(x).toContain('position: absolute;');
    });

    it('keeps it off the printed sheet', () => {
        expect(CSS).toContain('.report-print-sheet .report-close-x { display: none; }');
        expect(CSS).toContain('@media print { .report-close-x { display: none; } }');
    });

    it('is in the English build too', () => {
        expect(readRepoFile('en/index.html')).toContain('class="report-close-x"');
    });
});
