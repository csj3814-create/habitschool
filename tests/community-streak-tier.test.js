import { describe, expect, it } from 'vitest';
import {
    STREAK_TIER_MIN_PEOPLE,
    PERFECT_ATTENDANCE_MIN_DAYS,
    pickStreakTier,
    getElapsedDaysInMonth,
    countPerfectAttendance
} from '../functions/community-stats.js';
import {
    buildStreakHighlightHtml,
    buildAttendanceChipsHtml,
    buildCommunityEmptyStateHtml
} from '../js/community-stats-view.js';
import { readRepoFile } from './source-helpers.js';

// 31일짜리 달에서 매일 기록한 사람은 전부 31일이다. 거기서 한 명을 뽑으면
// 그건 순위가 아니라 스캔 순서다. 이름 대신 인원을 센다.
describe('연속 기록은 "누가"가 아니라 "몇 명"으로 센다', () => {
    it('인원이 충분하면 높은 단계를 쓴다', () => {
        const streaks = [180, 143, 120, 101, 40, 3];
        expect(pickStreakTier(streaks)).toEqual({ days: 100, label: '100일 이상', count: 4 });
    });

    it('높은 단계 인원이 너무 적으면 아래 단계로 내려간다', () => {
        // 100일 이상은 2명뿐 — "2명"은 자랑이 아니라 두 사람 이야기다.
        const streaks = [184, 143, 60, 45, 33, 31, 2];
        expect(STREAK_TIER_MIN_PEOPLE).toBe(3);
        expect(pickStreakTier(streaks)).toEqual({ days: 30, label: '한 달 이상', count: 6 });
    });

    it('어느 단계도 못 채우면 사람이 있는 가장 낮은 단계를 쓴다', () => {
        expect(pickStreakTier([120, 40])).toEqual({ days: 30, label: '한 달 이상', count: 2 });
    });

    it('아무도 없으면 아무것도 보여주지 않는다', () => {
        expect(pickStreakTier([])).toBeNull();
        expect(pickStreakTier([5, 12, 29])).toBeNull();
        expect(pickStreakTier(null)).toBeNull();
    });

    it('쓰레기 값이 사람 수를 늘리지 않는다', () => {
        expect(pickStreakTier([null, undefined, 'abc', -3, 0, 120, 120, 120]))
            .toEqual({ days: 100, label: '100일 이상', count: 3 });
    });
});

describe('개근 인원', () => {
    const stats = {
        a: { diet: 12, exercise: 12, mind: 12 },
        b: { diet: 12, exercise: 5, mind: 12 },
        c: { diet: 11, exercise: 0, mind: 12 },
        d: { diet: 13, exercise: 12, mind: 0 }   // 시차로 하루 넘칠 수 있다
    };

    it('경과일을 하루도 안 빠진 사람을 센다', () => {
        expect(countPerfectAttendance(stats, 12)).toEqual({ days: 12, diet: 3, exercise: 2, mind: 3 });
    });

    it('달 초에는 아예 세지 않는다', () => {
        // 1일에 "개근"은 "오늘 했다"와 같은 말이다.
        expect(PERFECT_ATTENDANCE_MIN_DAYS).toBe(5);
        expect(countPerfectAttendance(stats, 4)).toBeNull();
        expect(countPerfectAttendance(stats, 0)).toBeNull();
    });
});

describe('경과일', () => {
    it('이번 달이면 오늘이 며칠째인지', () => {
        expect(getElapsedDaysInMonth('2026-09', '2026-09-01')).toBe(1);
        expect(getElapsedDaysInMonth('2026-09', '2026-09-17')).toBe(17);
    });

    it('지난 달이면 그 달의 전체 일수', () => {
        expect(getElapsedDaysInMonth('2026-08', '2026-09-01')).toBe(31);
        expect(getElapsedDaysInMonth('2026-06', '2026-09-01')).toBe(30);
        expect(getElapsedDaysInMonth('2024-02', '2026-09-01')).toBe(29);
    });

    it('말이 안 되는 입력은 0', () => {
        expect(getElapsedDaysInMonth('', '2026-09-01')).toBe(0);
        expect(getElapsedDaysInMonth('2026-9', '2026-09-01')).toBe(0);
    });
});

describe('화면', () => {
    it('새 집계는 인원으로 그린다', () => {
        const html = buildStreakHighlightHtml({ statsVersion: 2, streakTier: { days: 100, label: '100일 이상', count: 7 } });
        expect(html).toContain('100일 이상 7명');
        expect(html).toContain('community-highlight');
    });

    it('새 집계인데 아직 셀 때가 아니면 옛 표시로 돌아가지 않는다', () => {
        // 달 초에는 개근 인원을 일부러 비워 둔다. 그때 옛 표시가 되살아나면
        // 방금 없앤 "누가 1일" 이 며칠간 다시 나온다.
        const early = {
            statsVersion: 2,
            streakTier: { days: 30, label: '한 달 이상', count: 5 },
            perfectAttendance: null,
            dietKing: { name: '26', count: 1 },
            bestStreak: 1,
            bestStreakName: '26'
        };
        expect(buildAttendanceChipsHtml(early)).toBe('');
        expect(buildStreakHighlightHtml(early)).toContain('한 달 이상 5명');
        expect(buildStreakHighlightHtml(early)).not.toContain('26');
    });

    it('지난 달 아카이브는 저장된 옛 표시로 그린다', () => {
        // 이미 저장된 달을 다시 쓸 수는 없다. 그 달은 그 달의 모양으로 남는다.
        const html = buildStreakHighlightHtml({ bestStreak: 31, bestStreakName: '루미나' });
        expect(html).toContain('루미나');
        expect(html).toContain('31일');
    });

    it('옛 표시의 이름을 그대로 넣지 않는다', () => {
        // 표시 이름은 회원이 정한다. 옛 코드는 이것을 날것으로 끼워 넣고 있었다.
        const html = buildStreakHighlightHtml({ bestStreak: 10, bestStreakName: '<img src=x onerror=alert(1)>' });
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });

    it('0명인 칸은 자리를 차지하지 않는다', () => {
        const html = buildAttendanceChipsHtml({ statsVersion: 2, perfectAttendance: { days: 12, diet: 3, exercise: 0, mind: 9 } });
        expect(html).toContain('식단 개근 <strong>3명</strong>');
        expect(html).toContain('마음 개근 <strong>9명</strong>');
        expect(html).not.toContain('운동');
    });

    it('아무도 개근하지 못했으면 줄 자체가 없다', () => {
        expect(buildAttendanceChipsHtml({ statsVersion: 2, perfectAttendance: { days: 12, diet: 0, exercise: 0, mind: 0 } })).toBe('');
        expect(buildStreakHighlightHtml({})).toBe('');
    });
});

// 참여자가 0명이면 섹션을 통째로 감추고 있었다. 그래서 매달 1일 첫 기록이 올라오기
// 전까지 이 칸이 사라진다. 사라진 화면은 고장과 구분되지 않는다.
describe('아무도 기록하지 않은 달', () => {
    const APP = readRepoFile('js/app-core.js');

    it('칸을 없애는 대신 비었다고 말한다', () => {
        expect(APP.split('content.innerHTML = buildCommunityEmptyStateHtml();').length - 1).toBe(3);
        expect(buildCommunityEmptyStateHtml()).toContain('아직 기록이 없어요');
    });

    it('문서를 못 읽은 것과 0명인 것을 구분한다', () => {
        // 못 읽었으면 아무 말도 하지 않는다 — 비었다고 단정할 근거가 없다.
        expect(APP).toContain("if (!s) { section.style.display = 'none'; return; }");
        expect(APP).not.toContain("if (!s || !s.totalUsers) { section.style.display = 'none'; return; }");
    });
});

describe('집계 두 곳이 같은 기준을 쓴다', () => {
    const RUNTIME = readRepoFile('functions/runtime.js');

    it('매시간 집계와 아카이브 백필이 같은 함수를 부른다', () => {
        expect(RUNTIME.split('pickStreakTier(').length - 1).toBe(2);
        expect(RUNTIME.split('countPerfectAttendance(').length - 1).toBe(2);
        expect(RUNTIME).toContain('streakTier: streakTier || null,');
        expect(RUNTIME).toContain('perfectAttendance: perfectAttendance || null,');
    });

    it('지난 달에는 오늘의 연속 기록을 적지 않는다', () => {
        // currentStreak 은 '지금' 값이다. 지난 달 문서에 적으면 없던 기록을 지어낸다.
        expect(RUNTIME).toContain("const streakTier = targetMonth === todayKst.slice(0, 7)");
    });

    it('옛 필드도 계속 남긴다', () => {
        // 아직 예전 JS 를 들고 있는 사람에게는 이것뿐이다.
        expect(RUNTIME).toContain('dietKing: dietKing ? { name: dietKing.name, count: dietKing.diet } : null,');
    });
});
