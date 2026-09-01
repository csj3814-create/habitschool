import { describe, expect, it } from 'vitest';
import {
    METRIC_SPECS,
    weekKeyOf,
    recentWeekKeys,
    extractDailyValues,
    aggregateWeekly,
    summarizeChange,
    bmiBandOf,
    countActiveDays,
    percentileOf,
    buildMemberTrends,
    buildCohortTrends
} from '../functions/health-trends.js';

const spec = (key) => METRIC_SPECS.find((item) => item.key === key);

describe('주차', () => {
    it('월요일로 묶는다', () => {
        // 2026-09-01 은 화요일 → 그 주 월요일은 08-31.
        expect(weekKeyOf('2026-09-01')).toBe('2026-08-31');
        expect(weekKeyOf('2026-08-31')).toBe('2026-08-31');
        expect(weekKeyOf('2026-09-06')).toBe('2026-08-31');  // 일요일은 그 주의 끝
        expect(weekKeyOf('2026-09-07')).toBe('2026-09-07');  // 다음 월요일
    });

    it('연말연시에도 끊기지 않는다', () => {
        expect(weekKeyOf('2027-01-01')).toBe('2026-12-28');
    });

    it('말이 안 되는 날짜는 null', () => {
        expect(weekKeyOf('')).toBeNull();
        expect(weekKeyOf('2026-9-1')).toBeNull();
    });

    it('13주를 오래된 것부터 만든다', () => {
        const keys = recentWeekKeys('2026-09-01', 13);
        expect(keys).toHaveLength(13);
        expect(keys[12]).toBe('2026-08-31');
        expect(keys[0]).toBe('2026-06-08');
        expect([...keys].sort()).toEqual(keys);
    });
});

describe('하루 기록에서 값 꺼내기', () => {
    it('키가 있으면 BMI 를 만든다', () => {
        const values = extractDailyValues({ metrics: { weight: '70' } }, { heightCm: 175 });
        expect(values.weight).toBe(70);
        expect(values.bmi).toBeCloseTo(22.86, 2);
    });

    it('키가 없으면 BMI 는 없다 — 지어내지 않는다', () => {
        expect(extractDailyValues({ metrics: { weight: 70 } }, {}).bmi).toBeNull();
    });

    it('식단은 끼니 등급의 평균', () => {
        const values = extractDailyValues({
            dietAnalysis: { breakfast: { grade: 'A' }, lunch: { grade: 'C' } }
        });
        expect(values.dietGrade).toBe(75);   // (100 + 50) / 2
    });

    it('없는 값은 0 이 아니라 null', () => {
        const values = extractDailyValues({});
        expect(values.glucose).toBeNull();
        expect(values.steps).toBeNull();
        expect(values.dietGrade).toBeNull();
    });
});

describe('주간 집계', () => {
    const weeks = ['2026-08-17', '2026-08-24', '2026-08-31'];

    it('같은 주는 평균으로 묶는다', () => {
        const series = aggregateWeekly([
            { date: '2026-08-31', value: 100 },
            { date: '2026-09-01', value: 110 }
        ], weeks);
        expect(series[2]).toBe(105);
    });

    it('기록이 없는 주는 null 로 남는다', () => {
        // 0 으로 채우면 그 주에 급격히 나빠진 것처럼 그려진다.
        const series = aggregateWeekly([{ date: '2026-08-31', value: 100 }], weeks);
        expect(series).toEqual([null, null, 100]);
    });

    it('창 밖의 기록은 무시한다', () => {
        expect(aggregateWeekly([{ date: '2026-01-05', value: 999 }], weeks)).toEqual([null, null, null]);
    });
});

describe('방향', () => {
    // 앞 4주 100, 뒤 4주 90 → 10 내려갔다.
    const falling = [null, null, null, null, null, 100, 100, 100, 100, 90, 90, 90, 90];
    const rising = [null, null, null, null, null, 90, 90, 90, 90, 100, 100, 100, 100];

    it('내려가면 좋은 지표는 내려갈 때 개선', () => {
        expect(summarizeChange(falling, spec('glucose')).direction).toBe('improved');
        expect(summarizeChange(rising, spec('glucose')).direction).toBe('worsened');
    });

    it('올라가면 좋은 지표는 반대', () => {
        expect(summarizeChange(rising, spec('steps')).direction).toBe('improved');
        expect(summarizeChange(falling, spec('steps')).direction).toBe('worsened');
    });

    it('거의 안 바뀌었으면 방향이라고 부르지 않는다', () => {
        const barely = [null, null, null, null, null, 100, 100, 100, 100, 100.5, 100.5, 100.5, 100.5];
        expect(summarizeChange(barely, spec('glucose')).direction).toBe('flat');
    });

    it('표본이 모자라면 unknown 이고 값도 내놓지 않는다', () => {
        const sparse = [null, null, null, null, null, null, null, null, null, null, null, null, 90];
        const result = summarizeChange(sparse, spec('glucose'));
        expect(result.direction).toBe('unknown');
        expect(result.recent).toBeNull();
        expect(result.delta).toBeNull();
    });

    it('체중은 방향 대신 구간 이동으로 읽는다', () => {
        // 감량이 언제나 개선인 것은 아니다 — 저체중인 사람에게는 반대다.
        const result = summarizeChange(falling, spec('weight'));
        expect(result.direction).toBe('neutral');
        expect(result.delta).toBe(-10);
    });

    it('BMI 는 어느 구간에서 어느 구간으로 갔는지 말한다', () => {
        const bmi = [null, null, null, null, null, 26, 26, 26, 26, 24, 24, 24, 24];
        const result = summarizeChange(bmi, spec('bmi'));
        expect(result.bandFrom).toBe('비만');
        expect(result.bandTo).toBe('과체중');
    });

    it('BMI 구간은 아시아-태평양 기준', () => {
        expect(bmiBandOf(18.4)).toBe('저체중');
        expect(bmiBandOf(22.9)).toBe('정상');
        expect(bmiBandOf(24.9)).toBe('과체중');
        expect(bmiBandOf(25)).toBe('비만');
        expect(bmiBandOf(null)).toBeNull();
    });
});

describe('꾸준 활동 판정', () => {
    const logsFor = (dates) => dates.map((date) => ({ date }));

    it('창 안의 서로 다른 날만 센다', () => {
        expect(countActiveDays(logsFor(['2026-09-01', '2026-09-01', '2026-08-30']), '2026-09-01', 30)).toBe(2);
    });

    it('창 밖은 세지 않는다', () => {
        expect(countActiveDays(logsFor(['2026-06-01']), '2026-09-01', 30)).toBe(0);
    });
});

describe('회원 한 명', () => {
    it('체성분과 혈액검사도 같은 주간 시계열에 올린다', () => {
        const result = buildMemberTrends({
            todayStr: '2026-09-01',
            profile: { heightCm: 170 },
            logs: [{ date: '2026-09-01', metrics: { weight: 70, glucose: 95 } }],
            inbodyHistory: [{ date: '2026-09-01', fat: 18, smm: 30, visceral: 8 }],
            bloodTests: [{ date: '2026-09-01', metrics: { totalCholesterol: { value: 190 }, hdl: { value: 55 } } }]
        });
        const last = (key) => result.metrics.find((m) => m.key === key).weekly.at(-1);
        expect(last('weight')).toBe(70);
        expect(last('bodyFat')).toBe(18);
        expect(last('muscle')).toBe(30);
        expect(last('nonHdl')).toBe(135);
        expect(result.weekKeys).toHaveLength(13);
    });
});

describe('코호트', () => {
    const daily = (uid, count, value) => Array.from({ length: count }, (_, i) => {
        const date = new Date(Date.UTC(2026, 7, 3) + i * 86400000).toISOString().slice(0, 10);
        return { date, metrics: { glucose: value } };
    });

    it('15일 미만 기록자는 빼고 센다', () => {
        const result = buildCohortTrends({
            todayStr: '2026-09-01',
            logsByUid: { steady: daily('steady', 30, 100), casual: daily('casual', 5, 100) },
            profiles: {}
        });
        expect(result.memberCount).toBe(1);
        expect(result.minActiveDays).toBe(15);
    });

    it('개인 화면 전용 지표는 코호트에 넣지 않는다', () => {
        // 회원마다 하위 컬렉션을 읽어야 해서 606번 질의가 된다.
        const result = buildCohortTrends({ todayStr: '2026-09-01', logsByUid: {}, profiles: {} });
        const keys = result.metrics.map((m) => m.key);
        expect(keys).toContain('glucose');
        expect(keys).not.toContain('nonHdl');
        expect(keys).not.toContain('bodyFat');
    });

    it('개선·악화 인원을 세되 표본 부족은 세지 않는다', () => {
        const result = buildCohortTrends({
            todayStr: '2026-09-01',
            logsByUid: { steady: daily('steady', 30, 100) },
            profiles: {}
        });
        const glucose = result.metrics.find((m) => m.key === 'glucose');
        const counted = glucose.counts.improved + glucose.counts.worsened + glucose.counts.flat;
        expect(counted + glucose.counts.unknown).toBe(result.memberCount);
    });
});

describe('추가 개선 — 숫자를 믿어도 되는가', () => {
    it('가장 최근 측정이 언제인지 함께 준다', () => {
        const result = buildMemberTrends({
            todayStr: '2026-09-01',
            profile: { heightCm: 170 },
            logs: [],
            inbodyHistory: [
                { date: '2026-07-10', fat: 20 },
                { date: '2026-08-28', fat: 18 }
            ],
            bloodTests: []
        });
        const fat = result.metrics.find((m) => m.key === 'bodyFat');
        expect(fat.latest).toEqual({ date: '2026-08-28', value: 18 });
    });

    it('몇 주나 기록했는지 센다 — 빈 칸이 고장인지 미기록인지 가른다', () => {
        const result = buildMemberTrends({
            todayStr: '2026-09-01',
            profile: {},
            logs: [
                { date: '2026-09-01', metrics: { glucose: 95 } },
                { date: '2026-08-25', metrics: { glucose: 97 } }
            ],
            bloodTests: [], inbodyHistory: []
        });
        const glucose = result.metrics.find((m) => m.key === 'glucose');
        expect(glucose.weeksWithData).toBe(2);
        expect(glucose.totalWeeks).toBe(13);
    });

    it('경보 기준을 지표 정의 한 곳에 둔다', () => {
        // 목록 필터와 상세가 서로 다른 기준을 쓰면 목록은 빨간데 상세는 멀쩡해진다.
        expect(METRIC_SPECS.find((m) => m.key === 'glucose').alertAbove).toBe(126);
        expect(METRIC_SPECS.find((m) => m.key === 'bpSystolic').alertAbove).toBe(140);
    });
});

describe('코호트 안에서의 위치', () => {
    const pool = [90, 95, 100, 105, 110, 115, 120];

    it('낮을수록 좋은 지표는 낮을수록 높은 백분위', () => {
        expect(percentileOf(pool, 92, 'down')).toBeGreaterThan(percentileOf(pool, 118, 'down'));
    });

    it('높을수록 좋은 지표는 반대', () => {
        expect(percentileOf(pool, 118, 'up')).toBeGreaterThan(percentileOf(pool, 92, 'up'));
    });

    it('방향이 없는 지표에는 위치를 말하지 않는다', () => {
        // 체중은 높아도 낮아도 '좋은 쪽' 이 없다.
        expect(percentileOf(pool, 100, null)).toBeNull();
    });

    it('표본이 적으면 백분위를 만들지 않는다', () => {
        expect(percentileOf([90, 100], 95, 'down')).toBeNull();
    });

    it('코호트는 회원별 최근값 분포를 남긴다', () => {
        const daily = (value) => Array.from({ length: 30 }, (_, i) => ({
            date: new Date(Date.UTC(2026, 7, 3) + i * 86400000).toISOString().slice(0, 10),
            metrics: { glucose: value }
        }));
        const result = buildCohortTrends({
            todayStr: '2026-09-01',
            logsByUid: { a: daily(100), b: daily(120) },
            profiles: {}
        });
        const glucose = result.metrics.find((m) => m.key === 'glucose');
        expect(glucose.recentValues.sort()).toEqual([100, 120]);
    });
});
