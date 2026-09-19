import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    summarizeWeeklyActivity,
    WEEKLY_ACTIVITY_TARGET_MINUTES,
    WEEKLY_ACTIVITY_STRETCH_MINUTES,
} from '../js/le8-score.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const APP = read('js/app-core.js');

const WEEK = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
const TODAY = '2026-09-17';

// 분을 직접 넣는 대신 걸음수로 만든다 — 실제 기록이 그렇게 들어온다.
// resolveDailyActivityMinutes 가 걸음수를 분으로 바꾼다.
const dayOf = (date, minutes) => ({ date, exercise: { cardioList: [{ durationMinutes: minutes }] } });
const summarize = (minutesPerDay) => summarizeWeeklyActivity(
    minutesPerDay.map((m, i) => dayOf(WEEK[i], m)).filter((_, i) => minutesPerDay[i] > 0),
    { todayStr: TODAY, weekStrs: WEEK }
);

// 2026-09-19 제안: "주간 운동량을 150분 최소량 채우고 나면 축하 메세지 나오면서
// 300분 권장량까지 바가 더 생기는 방식 어떨까?"
//
// 세계보건기구 권장이 정확히 150~300분 구간이다 — 150분이 최소선이고 300분까지
// 이득이 계속 늘어난다. 그래서 두 번째 눈금에 근거가 있다.
describe('the week gets a second mark after the first one is met', () => {
    it('keeps 150 as the minimum and 300 as the recommended ceiling', () => {
        expect(WEEKLY_ACTIVITY_TARGET_MINUTES).toBe(150);
        expect(WEEKLY_ACTIVITY_STRETCH_MINUTES).toBe(300);
    });

    it('counts the stretch from 150, not from zero', () => {
        // 최소선을 채운 사람에게 0% 로 되돌아간 막대를 보여 주면 방금 한 일이
        // 지워진 것처럼 보인다.
        const half = summarize([75, 75, 75, 0, 0, 0, 0]);   // 225분
        expect(half.met).toBe(true);
        expect(half.stretchPercent).toBe(50);
        expect(half.stretchRemaining).toBe(75);
    });

    it('stays at zero stretch until the minimum is reached', () => {
        const under = summarize([50, 50, 0, 0, 0, 0, 0]);   // 100분
        expect(under.met).toBe(false);
        expect(under.stretchPercent).toBe(0);
        expect(under.stretchMet).toBe(false);
    });

    it('caps at the ceiling instead of running past it', () => {
        const over = summarize([100, 100, 100, 100, 0, 0, 0]); // 400분
        expect(over.stretchPercent).toBe(100);
        expect(over.stretchMet).toBe(true);
        expect(over.stretchRemaining).toBe(0);
    });

    it('leaves the LE8 score alone', () => {
        // 150분에서 활동 점수는 이미 만점이다. 300분을 점수 기준으로 끌어들이면
        // 지난 기록의 점수가 소급해서 바뀐다. 새 상수는 화면만 쓴다.
        const scorer = read('js/le8-score.js').split('function calcActivityScore(')[1].split(String.fromCharCode(10) + '}')[0];
        expect(scorer).toContain('WEEKLY_ACTIVITY_TARGET_MINUTES');
        expect(scorer).not.toContain('WEEKLY_ACTIVITY_STRETCH_MINUTES');
    });
});

describe('the card celebrates before it asks for more', () => {
    const renderer = APP.split('function renderWeeklyActivityCard(summary) {')[1].split('\n}\n')[0];

    it('congratulates at the minimum and names what is left to the ceiling', () => {
        expect(renderer).toContain('최소 ${targetMinutes}분을 채우셨어요 🎉');
        expect(renderer).toContain('${stretchRemaining}분을 더 하면 권장 상한이에요');
    });

    it('stops asking once the ceiling is reached', () => {
        expect(renderer).toContain('권장 상한까지 채우셨어요');
        // 보채는 말이 이 자리에 남아 있으면 채운 사람을 못 채운 사람으로 만든다.
        const ceiling = renderer.split('stretchMet')[1].split(': met')[0];
        expect(ceiling).not.toContain('남았어요');
    });

    it('draws the second bar only after the first is full', () => {
        expect(renderer).toContain('const stretchBar = met');
        expect(renderer).toContain('weekly-activity-bar-fill is-stretch');
        // 순서: 첫 막대 → 두 번째 막대 → 요일 점
        const html = renderer.split('container.innerHTML')[1];
        expect(html.indexOf('weekly-activity-bar-bg'))
            .toBeLessThan(html.indexOf('${stretchBar}'));
        expect(html.indexOf('${stretchBar}'))
            .toBeLessThan(html.indexOf('weekly-activity-days'));
    });

    it('tells the truth about the guideline in the footnote', () => {
        expect(renderer).toContain('주 ${targetMinutes}~${stretchMinutes}분 중강도를 권합니다');
    });

    it('has a look in both themes', () => {
        expect(read('styles-features.css')).toContain('.weekly-activity-bar-fill.is-stretch {');
        expect(read('styles-dark-mode.css')).toContain('body.dark-mode .weekly-activity-stretch {');
    });
});
