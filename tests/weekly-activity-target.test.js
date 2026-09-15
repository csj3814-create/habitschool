import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEEKLY_ACTIVITY_TARGET_MINUTES, resolveDailyActivityMinutes, summarizeWeeklyActivity } from '../js/le8-score.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-09-14: "운동량을 평가해 적절한 양을 제시하고 완수율을 보여준다"
// 평가는 이미 calcActivityScore 안에 있었다(주 150분, WHO·AHA). 빠진 것은 그 숫자를
// 기록하는 자리에 내보이는 일과, 자가 둘로 갈라진 것이었다.
describe('one ruler for physical activity', () => {
    it('is the WHO/AHA weekly target, named once', () => {
        expect(WEEKLY_ACTIVITY_TARGET_MINUTES).toBe(150);
        // 점수 문턱도 같은 상수를 본다 — 숫자를 손으로 적어 두면 한쪽만 바뀐다.
        expect(read('js/le8-score.js')).toContain('if (weeklyMinutes >= WEEKLY_ACTIVITY_TARGET_MINUTES) score = 100;');
    });

    it('has the analysis card measure against that target, not a daily one', () => {
        const client = read('js/diet-analysis.js');
        expect(client).toContain("import { WEEKLY_ACTIVITY_TARGET_MINUTES } from './le8-score.js");
        expect(client).toContain('weightedMinutes / WEEKLY_ACTIVITY_TARGET_MINUTES');
        // 하루 30분짜리 두 번째 자는 없어져야 한다.
        expect(client).not.toContain('recommendedDailyProgress');
        expect(read('functions/runtime.js')).not.toContain('"recommendedDailyProgress"');
    });

    it('weights intensity the same way on both sides', () => {
        const le8 = read('js/le8-score.js');
        const runtime = read('functions/runtime.js');
        for (const pair of ["'저강도': 0.5", "'중강도': 1", "'고강도': 2", "'초고강도': 3"]) {
            expect(le8).toContain(pair);
            expect(runtime).toContain(pair.split("'").join('"'));
        }
    });

    it('does the goal arithmetic on the server, not in the model', () => {
        // 모델에게 달성률을 시키면 지어낸 숫자가 그대로 점수가 된다.
        const norm = read('functions/runtime.js').split('function normalizeExerciseAnalysis(')[1].split('\n}\n')[0];
        expect(norm).toContain('durationMinutes * (EXERCISE_INTENSITY_MINUTE_WEIGHTS[intensity] || 1)');
        expect(norm).toContain('durationMinutes !== null');
    });
});

describe('one rule for daily minutes, read by two windows', () => {
    it('counts health-app minutes when the app gives them', () => {
        const day = resolveDailyActivityMinutes({ steps: { active_minutes: 42, count: 12000 } });
        expect(day.minutes).toBe(42);
        expect(day.usedHealthApp).toBe(true);
        expect(day.hasSignal).toBe(true);
    });

    it('subtracts everyday walking from the step count', () => {
        // 4000보는 일상 이동으로 보고 뺀다. 분당 100보.
        expect(resolveDailyActivityMinutes({ steps: { count: 8000 } }).minutes).toBe(40);
        expect(resolveDailyActivityMinutes({ steps: { count: 3000 } }).minutes).toBe(0);
    });

    it('uses the minutes the AI actually read from the photo', () => {
        const day = resolveDailyActivityMinutes({
            exercise: { cardioList: [{ aiAnalysis: { weightedMinutes: 60 } }] }
        });
        expect(day.minutes).toBe(60);
    });

    it('falls back to the old estimate when nothing was read', () => {
        // 예전 기록에는 aiAnalysis 가 없다. 30분 추정이 그대로 살아 있어야 한다.
        const day = resolveDailyActivityMinutes({ exercise: { cardioList: [{}], strengthList: [{}] } });
        expect(day.minutes).toBe(60);
    });

    it('caps what one day of photos can claim', () => {
        const day = resolveDailyActivityMinutes({
            exercise: { cardioList: [{ aiAnalysis: { weightedMinutes: 600 } }] }
        });
        expect(day.minutes).toBe(120);
    });

    it('never adds steps and photos of the same walk together', () => {
        const day = resolveDailyActivityMinutes({
            steps: { count: 14000 },
            exercise: { cardioList: [{ aiAnalysis: { weightedMinutes: 30 } }] }
        });
        expect(day.minutes).toBe(100);
    });

    it('says "unknown", not "zero", when there is no record at all', () => {
        expect(resolveDailyActivityMinutes(null).hasSignal).toBe(false);
        expect(resolveDailyActivityMinutes({}).minutes).toBe(0);
    });
});

describe('the weekly bar tells you what today asks of you', () => {
    const weekStrs = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];

    it('divides what is left by the days that are left', () => {
        // 남은 양 ÷ 남은 일수가 곧 처방이다.
        const summary = summarizeWeeklyActivity(
            [{ date: '2026-09-14', steps: { count: 8000 } }],
            { todayStr: '2026-09-16', weekStrs }
        );
        expect(summary.weeklyMinutes).toBe(40);
        expect(summary.targetMinutes).toBe(150);
        expect(summary.percent).toBe(27);
        expect(summary.remainingMinutes).toBe(110);
        // 수(오늘)부터 일요일까지 5일. 오늘도 아직 할 수 있는 날이다.
        expect(summary.daysLeft).toBe(5);
        expect(summary.perDayNeeded).toBe(22);
        expect(summary.met).toBe(false);
    });

    it('stops at 100% and says it is done', () => {
        const summary = summarizeWeeklyActivity(
            weekStrs.map((date) => ({ date, steps: { count: 12000 } })),
            { todayStr: '2026-09-20', weekStrs }
        );
        expect(summary.met).toBe(true);
        expect(summary.percent).toBe(100);
        expect(summary.remainingMinutes).toBe(0);
    });

    it('marks each day so the week reads at a glance', () => {
        const summary = summarizeWeeklyActivity(
            [{ date: '2026-09-14', steps: { count: 9000 } }],
            { todayStr: '2026-09-15', weekStrs }
        );
        expect(summary.days).toHaveLength(7);
        expect(summary.days[0].minutes).toBe(50);
        expect(summary.days[1].isToday).toBe(true);
        expect(summary.days[1].isFuture).toBe(false);
        expect(summary.days[2].isFuture).toBe(true);
    });

    it('holds up on an empty week without dividing by zero', () => {
        const summary = summarizeWeeklyActivity([], { todayStr: '2026-09-20', weekStrs });
        expect(summary.weeklyMinutes).toBe(0);
        expect(summary.percent).toBe(0);
        expect(summary.daysLeft).toBe(1);
        expect(summary.perDayNeeded).toBe(150);
    });
});

describe('the weekly bar sits where the recording happens', () => {
    const app = read('js/app-core.js');

    it('leads the exercise tab, in the place every tab keeps for content', () => {
        // 2026-09-15: 처음엔 가이드 카드 위에 뒀는데 운동 탭만 순서가 달라졌다.
        // 식단·마음 탭은 모두 가이드 → 포인트 배너 → 본문 카드 순이다.
        const html = read('index.html');
        const tab = html.indexOf('<div id="exercise" class="content-section">');
        const guide = html.indexOf('data-record-guide="exercise"');
        const banner = html.indexOf('id="quest-exercise"');
        const card = html.indexOf('id="weekly-activity-card"');
        const stepCard = html.indexOf('id="step-card"');
        const photoCard = html.indexOf('id="exercise-image-title"') > -1
            ? html.indexOf('id="exercise-image-title"')
            : html.indexOf('📸 운동 이미지');

        expect(guide).toBeGreaterThan(tab);
        expect(banner).toBeGreaterThan(guide);
        // 본문 카드 중에서는 맨 앞 — 기록하기 전에 남은 양이 보여야 한다.
        expect(card).toBeGreaterThan(banner);
        expect(card).toBeLessThan(stepCard);
        expect(card).toBeLessThan(photoCard);
    });

    it('keeps the same running order as the other record tabs', () => {
        // 세 기록 탭이 같은 뼈대를 쓴다:
        //   가이드 → 포인트 배너 → 업로드 CTA → 삼성 인터넷 안내 → 본문 카드
        // 한 탭만 어긋나면 탭을 옮길 때마다 첫 화면이 달라져 눈에 걸린다.
        const html = read('index.html');
        for (const [tabId, guideAttr] of [
            ['diet', 'data-record-guide="diet"'],
            ['exercise', 'data-record-guide="exercise"'],
            ['sleep', 'data-record-guide="sleep"']
        ]) {
            const start = html.indexOf(`<div id="${tabId}" class="content-section"`);
            expect(start, tabId).toBeGreaterThan(-1);
            const seg = html.slice(start, start + 16000);

            const guide = seg.indexOf(guideAttr);
            const banner = seg.indexOf('quest-board');
            // 식단 탭은 class="upload-cta upload-cta-split" 이다. 닫는 따옴표까지 맞추면 빗나간다.
            const cta = seg.indexOf('class="upload-cta');
            const notice = seg.indexOf('samsung-file-picker-guide');
            const card = seg.indexOf('class="card');

            for (const [label, at] of [['가이드', guide], ['배너', banner], ['CTA', cta], ['안내', notice], ['카드', card]]) {
                expect(at, `${tabId} ${label}`).toBeGreaterThan(-1);
            }
            expect(banner, tabId).toBeGreaterThan(guide);
            expect(cta, tabId).toBeGreaterThan(banner);
            expect(notice, tabId).toBeGreaterThan(cta);
            expect(card, tabId).toBeGreaterThan(notice);
        }
    });

    it('refreshes when the tab opens and after a save lands', () => {
        expect(app).toContain("if (resolvedTabName === 'exercise' && user) {");
        expect(app).toContain('refreshWeeklyActivityCard();');
        expect(app.split('refreshWeeklyActivityCard({ force: true });').length - 1).toBe(2);
    });

    it('does not block recording when it cannot load', () => {
        const fn = app.split('async function refreshWeeklyActivityCard(')[1].split('\n}\n')[0];
        expect(fn).toContain('.catch(');
        expect(fn).toContain('console.warn(');
        expect(fn).not.toContain('showToast(');
    });

    it('does not nag a week that is already met', () => {
        const fn = app.split('function renderWeeklyActivityCard(')[1].split('\n}\n')[0];
        expect(fn).toContain('const guide = met');
        expect(fn).toContain('남은 날은 덤입니다');
        expect(fn).toContain('하루 ${perDayNeeded}분씩이면 채워요');
    });
});

// 2026-09-15: 걸음수와 운동기록을 큰 쪽만 쓰던 규칙을 종류별로 나눴다.
// 90일 실측 결과 근력 영상이 있는 367일 중 204일(55.6%)에서 그날 한 운동이
// 걸음수에 가려 사라지고 있었다 — 하루 평균 34분, 합계 6,977분.
// 포인트(사진 1장 = 10점, 하루 30점 상한)와는 무관하다. 서버는 이 함수를 모른다.
describe('steps explain a walk, not a workout', () => {
    it('adds strength to steps instead of choosing one', () => {
        // 8,000보(40분) 걷고 근력 한 건(30분) 한 사람은 70분을 움직였다.
        expect(resolveDailyActivityMinutes({
            steps: { count: 8000 },
            exercise: { strengthList: [{}] }
        }).minutes).toBe(70);
    });

    it('still refuses to count the same walk twice', () => {
        // 종류를 모르는 유산소는 그 걸음수가 설명하는 산책일 수 있다.
        expect(resolveDailyActivityMinutes({
            steps: { count: 8000 },
            exercise: { cardioList: [{}] }
        }).minutes).toBe(40);
        // 달리기라고 읽혔으면 더더욱 겹친다.
        expect(resolveDailyActivityMinutes({
            steps: { count: 8000 },
            exercise: { cardioList: [{ durationMinutes: 20, aiAnalysis: { exerciseType: '달리기', intensity: '중강도' } }] }
        }).minutes).toBe(40);
    });

    it('adds a workout the step count cannot see', () => {
        // 자전거는 페달을 밟지 걸음을 만들지 않는다.
        expect(resolveDailyActivityMinutes({
            steps: { count: 8000 },
            exercise: { cardioList: [{ durationMinutes: 40, aiAnalysis: { exerciseType: '자전거', intensity: '중강도' } }] }
        }).minutes).toBe(80);
        expect(resolveDailyActivityMinutes({
            steps: { count: 8000 },
            exercise: { cardioList: [{ durationMinutes: 30, aiAnalysis: { exerciseType: '수영', intensity: '고강도' } }] }
        }).minutes).toBe(100);
    });

    it('treats an unknown type as overlapping, so old records do not move', () => {
        // 분석 이전 기록에는 exerciseType 이 없다. 그 숫자가 갑자기 바뀌면 안 된다.
        const before = resolveDailyActivityMinutes({
            steps: { count: 12000 },
            exercise: { cardioList: [{}, {}] }
        }).minutes;
        expect(before).toBe(80); // max(80, 60) — 예전과 같다
    });

    it('caps each side so one day cannot claim the week', () => {
        const day = resolveDailyActivityMinutes({
            steps: { count: 20000 },
            exercise: {
                cardioList: [{ durationMinutes: 300, aiAnalysis: { exerciseType: '자전거', intensity: '초고강도' } }],
                strengthList: [{ durationMinutes: 300, aiAnalysis: { intensity: '초고강도' } }]
            }
        }).minutes;
        // 걸음수 120 상한 + 안 겹치는 쪽 120 상한
        expect(day).toBe(240);
    });

    it('says nothing when there is nothing', () => {
        expect(resolveDailyActivityMinutes({}).minutes).toBe(0);
        expect(resolveDailyActivityMinutes({}).hasSignal).toBe(false);
    });
});

// 측정 스크립트는 '지금 규칙'과 '바꿀 규칙'을 자기 안에 들고 비교한다. 앱 코드를
// 읽지 않으므로, 상수가 어긋나면 측정 결과가 조용히 거짓이 된다. 둘을 묶어 둔다.
describe('the measurement script measures the rule we actually ship', () => {
    const script = read('scripts/measure-activity-overlap-2026-09-15.js');
    const le8 = read('js/le8-score.js');

    it('shares the target, the weights and the caps', () => {
        expect(script).toContain(`const WEEKLY_TARGET = ${WEEKLY_ACTIVITY_TARGET_MINUTES};`);
        for (const [word, weight] of [['저강도', '0.5'], ['중강도', '1'], ['고강도', '2'], ['초고강도', '3']]) {
            expect(script, word).toContain(`"${word}": ${weight}`);
            expect(le8, word).toContain(`'${word}': ${weight}`);
        }
        for (const line of ['MAX_MEDIA_MINUTES_PER_DAY = 120', 'DEFAULT_MEDIA_MINUTES_PER_UNIT = 30']) {
            expect(script, line).toContain(line);
            expect(le8, line).toContain(line);
        }
    });

    it('shares the list of exercises the step count already sees', () => {
        const scriptList = script.split('STEP_OVERLAPPING_KEYWORDS = [')[1].split('];')[0];
        const appList = le8.split('STEP_OVERLAPPING_EXERCISE_KEYWORDS = Object.freeze([')[1].split('])')[0];
        const words = (text) => (text.match(/['"]([^'"]+)['"]/g) || []).map(w => w.slice(1, -1)).sort();
        expect(words(scriptList)).toEqual(words(appList));
    });

    it('says out loud that it cannot confirm a deploy', () => {
        // 2026-09-15: 배포 뒤 다시 돌려 '손실 0'을 보자고 했는데, 이 스크립트는
        // 배포와 무관하게 늘 같은 답을 낸다. 다음 사람이 같은 착각을 하지 않도록.
        expect(script).toContain('배포 확인용이 아니다');
    });
});
