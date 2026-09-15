import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDailyGrades, resolveDietDayGrade, resolveExerciseDayGrade, resolveSleepDayGrade } from '../js/admin-utils.js';
import { WEEKLY_ACTIVITY_TARGET_MINUTES, resolveDailyActivityMinutes } from '../js/le8-score.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const ADMIN = read('admin.html');

// 2026-09-15 요청: "식단, 운동, 잠에 한눈에 볼 수 있게 등급(A~F) 보여줘서
// 한눈에 잘 하고 있는지 알게 해줘."
// 관제탑에서 회원을 열면 30일치 카드가 나오는데, 잘하고 있는지 알려면 카드마다
// 'AI 분석 결과' 아코디언을 하나씩 펼쳐야 했다. 하루 넷씩이면 백 번이다.
describe('a day says how it went without being opened', () => {
    it('reads the grade the diet analysis already gives', () => {
        const day = resolveDietDayGrade({ dietAnalysis: { breakfast: { grade: 'A' }, lunch: { grade: 'C' } } });
        expect(day.grade).toBe('B');
        expect(day.detail).toContain('2끼');
    });

    it('reads the grade the sleep analysis already gives', () => {
        const day = resolveSleepDayGrade({ sleepAndMind: { sleepAnalysis: { grade: 'B' }, sleepHours: 7.5 } });
        expect(day.grade).toBe('B');
        expect(day.detail).toContain('7.5시간');
    });

    it('derives the exercise grade from the ruler the app already uses', () => {
        // 새 기준을 만들지 않는다. 주 150분을 7로 나눈 하루치 문턱이다.
        // 8,000보 = 40분 → 주 280분 페이스 → A
        expect(resolveExerciseDayGrade({ steps: { count: 8000 } }).grade).toBe('A');
        // 6,200보 = 22분 → 주 154분 → 딱 권장선 위 → A
        expect(resolveExerciseDayGrade({ steps: { count: 6200 } }).grade).toBe('A');
        // 5,800보 = 18분 → 주 126분 → B
        expect(resolveExerciseDayGrade({ steps: { count: 5800 } }).grade).toBe('B');
        // 5,400보 = 14분 → 주 98분 → C
        expect(resolveExerciseDayGrade({ steps: { count: 5400 } }).grade).toBe('C');
        // 4,600보 = 6분 → 주 42분 → D
        expect(resolveExerciseDayGrade({ steps: { count: 4600 } }).grade).toBe('D');
        // 4,200보 = 2분 → 주 14분 → F
        expect(resolveExerciseDayGrade({ steps: { count: 4200 } }).grade).toBe('F');
    });

    it('says the pace so the letter can be checked', () => {
        const day = resolveExerciseDayGrade({ steps: { count: 8000 } });
        expect(day.detail).toContain('40분');
        expect(day.detail).toContain('주 280분');
    });

    it('counts the minutes the same way the app does', () => {
        // 관제탑은 le8-score 를 싣지 않아 계산을 옮겨 적었다. 어긋나면 화면 두 곳이
        // 다른 말을 한다. 같은 로그로 두 계산을 나란히 돌려 묶어 둔다.
        const cases = [
            { steps: { count: 8000 } },
            { steps: { count: 12000 }, exercise: { strengthList: [{ durationMinutes: 30, aiAnalysis: { intensity: '고강도' } }] } },
            { exercise: { cardioList: [{ durationMinutes: 20, aiAnalysis: { exerciseType: '자전거', intensity: '중강도' } }] }, steps: { count: 9000 } },
            { exercise: { strengthList: [{ aiAnalysis: { exerciseType: '계단 오르기', intensity: '중강도' } }] }, steps: { count: 10000 } },
            { exercise: { cardioList: [{}] } },
        ];
        for (const log of cases) {
            const appMinutes = Math.round(resolveDailyActivityMinutes(log).minutes);
            const adminDetail = resolveExerciseDayGrade(log).detail;
            expect(adminDetail, JSON.stringify(log)).toContain(`${appMinutes}분`);
        }
    });

    it('leaves a missing record blank instead of failing it', () => {
        // 'F' 로 채우면 안 한 것과 모르는 것이 섞인다.
        const grades = resolveDailyGrades({});
        expect(grades.diet).toBeNull();
        expect(grades.exercise).toBeNull();
        expect(grades.sleep).toBeNull();
    });

    it('shows the three letters on the card header', () => {
        expect(ADMIN).toContain('renderDailyGradeBadges(r)');
        const fn = ADMIN.split('function renderDailyGradeBadges(')[1].split('\n    }\n')[0];
        expect(fn).toContain("['diet', 'exercise', 'sleep']");
        expect(fn).toContain('hc-grade g-');
        // 자세한 근거는 마우스를 올리면 나온다 — 줄을 늘리지 않고도 알 수 있다.
        expect(fn).toContain('title="${escapeHtml(title)}"');
        for (const letter of ['A', 'B', 'C', 'D', 'F']) {
            expect(ADMIN, letter).toContain(`.hc-grade.g-${letter} {`);
        }
    });

    it('keeps the weekly target in one place', () => {
        expect(WEEKLY_ACTIVITY_TARGET_MINUTES).toBe(150);
        const utils = read('js/admin-utils.js');
        expect(utils).toContain('const WEEKLY_ACTIVITY_TARGET_MINUTES = 150;');
        expect(utils).toContain('150 / 7');
    });
});

// "상세 항목 폭을 키워서 한눈에 보기 좋게" + "주간 추이 그래프도 한눈에"
describe('the detail panel is wide enough to read', () => {
    it('gives the modal room instead of squeezing two columns into 1000px', () => {
        expect(ADMIN).toContain('max-width: min(1560px, 96vw)');
        expect(ADMIN).not.toContain('max-width: 1000px; height: 95vh;');
    });

    it('gives the left column a floor so the table stops scrolling sideways', () => {
        expect(ADMIN).toContain('grid-template-columns: minmax(420px, 1fr) minmax(0, 1.25fr)');
    });

    it('lays every trend out at once instead of one chip at a time', () => {
        expect(ADMIN).toContain('<div id="member-trend-sparks" class="trend-spark-grid"></div>');
        expect(ADMIN).not.toContain('id="member-trend-toggle"');
        expect(ADMIN).toContain("renderTrendSparklines('member-trend-sparks'");
    });

    it('draws a sparkline only when there are two points to join', () => {
        // 점 하나로 선을 그으면 없는 경향을 보여주게 된다.
        const fn = ADMIN.split('function buildSparklinePath(')[1].split('\n    }\n')[0];
        expect(fn).toContain('if (points.length < 2) return null;');
        expect(fn).toContain('const span = max - min || 1;');
    });

    it('colours the direction by whether it is good, not by which way it points', () => {
        // 체중은 오르내림에 좋고 나쁨이 없다. better 가 없으면 화살표만 준다.
        const fn = ADMIN.split('function renderTrendSparklines(')[1].split('\n    }\n')[0];
        expect(fn).toContain("if (!metric.better) { dirClass = 'flat';");
        expect(fn).toContain("const good = (metric.better === 'up') === rising;");
    });

    it('still opens the big chart when one is chosen', () => {
        const fn = ADMIN.split('function drawMemberTrendChart(')[1].split('\n    }\n')[0];
        expect(fn).toContain("renderTrendSparklines('member-trend-sparks'");
        expect(fn).toContain("renderTrendChart('trendChart', null,");
    });
});
