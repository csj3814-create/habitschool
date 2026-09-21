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
    });

    it('has no band above the daily maximum', () => {
        // 2026-09-21: "81+는 필요 없어 80점이 만점이니까." 아무도 못 받는 칸을
        // 범례에 두면 무슨 뜻인지 묻게만 된다. 만점도 51~80 칸에 들어간다.
        expect(cal.reportPointsTone(80)).toBe('high');
        expect(APP).not.toContain("return 'best'");
        expect(APP).not.toContain('81P+');
        expect(CSS).not.toContain('.rc-best');
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

    it('does not count the skipped days out loud', () => {
        // 2026-09-21: "이 기간에 34일은 기록이 없었어요 필요 없어. 지워줘."
        // 달력이 이미 보여 준다. 숫자로 한 번 더 말하면 셈해 주는 것이 아니라
        // 나무라는 문장이 된다. 축하하던 반대쪽 줄도 같이 뺐다 — 한 자리의 두 갈래다.
        expect(APP).not.toContain('skippedDays');
        expect(APP).not.toContain('일은 기록이 없었어요');
        expect(APP).not.toContain('하루도 빠뜨리지 않으셨어요');
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

describe('the buttons at the bottom have room to breathe', () => {
    // 2026-09-21: "A4 한장에 인쇄, 닫기 아래에 공간 만들어 줘."
    // 그리고 이어서: "맨아래 잠깐 여백 보였다가 스크롤 더 내리니까 다시 바닥에 붙어버렸어."
    //
    // 브라우저에서 재 보고서야 원인을 알았다. 세로 auto 마진이었다 — 내용이 화면보다
    // 길면 auto 마진이 카드를 가운데로 밀어 위아래로 똑같이 넘치게 만들고, 아래로
    // 넘친 만큼은 끝까지 스크롤해도 닿지 않는다. 카드 아랫변이 화면 밖 20px 에 있었고
    // 버튼 아래로 보이는 여백은 4px 뿐이었다. 고친 뒤 24px, 화면 밖 0px.

    it('does not centre the card with vertical auto margins', () => {
        const card = CSS.split('.report-container {')[1].split('}')[0];
        expect(card).toContain('margin: 0 auto 20px;');
        // margin: auto 로 되돌리면 같은 증상이 그대로 돌아온다.
        expect(card).not.toMatch(/margin:\s*auto\s*;/);
    });

    it('does not lean on the scroll container to hold that space', () => {
        // 스크롤 컨테이너의 끝 패딩은 여기서 그려지지 않는다. 재 봤다.
        const modal = CSS.split('.report-modal {')[1].split('}')[0];
        expect(modal).toContain('padding: 20px 0 0;');
    });

    it('measures the modal against the height the phone actually shows', () => {
        const modal = CSS.split('.report-modal {')[1].split('}')[0];
        expect(modal).toContain('height: 100dvh;');
        // dvh 를 모르는 브라우저를 위해 100% 를 먼저 둔다.
        expect(modal.indexOf('height: 100%;')).toBeLessThan(modal.indexOf('height: 100dvh;'));
    });

    it('keeps the buttons clear of the home indicator', () => {
        const actions = CSS.split('.report-actions {')[1].split('}')[0];
        expect(actions).toContain('env(safe-area-inset-bottom');
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
