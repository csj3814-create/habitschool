/**
 * le8-score.test.js
 * 건강습관 점수(LE8 방식) 계산 테스트
 *
 * 로직을 복제하지 않고 실제 모듈을 그대로 불러 검증한다.
 * 배점표의 경계값은 한 칸만 어긋나도 사용자 점수가 통째로 달라지므로 양쪽을 다 본다.
 */
import { describe, it, expect } from 'vitest';
import { calculateLE8Score, getLevel, parseSleepDuration } from '../js/le8-score.js';

// ── 테스트 데이터 헬퍼 ───────────────────────────────────────────────────
// 키를 100cm로 두면 BMI = 체중이 되어 경계값을 직관적으로 쓸 수 있다.

function log(overrides = {}) {
    return { metrics: {}, ...overrides };
}

/** 등급이 매겨진 식단 n끼 */
function dietLogs(grade, meals = 3) {
    const analysis = {};
    ['breakfast', 'lunch', 'dinner'].slice(0, meals).forEach(slot => {
        analysis[slot] = { grade };
    });
    return [log({ dietAnalysis: analysis })];
}

/** 수면 n일 */
function sleepLogs(hours, days = 2) {
    return Array.from({ length: days }, () =>
        log({ sleepAndMind: { sleepAnalysis: { details: { sleepHours: hours } } } })
    );
}

/** 총점 가드를 통과시키기 위한 최소 구성: 생활습관 2 + 대사지표 2 */
function sufficientBase() {
    return {
        profile: { smokingStatus: 'never', heightCm: 100 },
        logs: [
            ...sleepLogs(8, 2),
            log({ metrics: { weight: 22, bpSystolic: 110, bpDiastolic: 70 } })
        ]
    };
}

// ── 체중 (BMI) ───────────────────────────────────────────────────────────

describe('BMI 배점표', () => {
    const cases = [
        [24.9, 100], [25.0, 70], [29.9, 70],
        [30.0, 30], [34.9, 30],
        [35.0, 15], [39.9, 15],
        [40.0, 0]
    ];

    cases.forEach(([weight, expected]) => {
        it(`BMI ${weight} → ${expected}점`, () => {
            const r = calculateLE8Score({ heightCm: 100 }, [log({ metrics: { weight } })]);
            expect(r.factors.bmi.score).toBe(expected);
        });
    });

    it('키가 없으면 계산하지 않는다', () => {
        const r = calculateLE8Score({}, [log({ metrics: { weight: 70 } })]);
        expect(r.factors.bmi.missing).toBe(true);
    });

    it('한국인 기준 해석을 함께 보여준다', () => {
        const r = calculateLE8Score({ heightCm: 100 }, [log({ metrics: { weight: 24 } })]);
        // AHA 배점으로는 만점이지만 아시아 기준으로는 과체중이다.
        expect(r.factors.bmi.score).toBe(100);
        expect(r.factors.bmi.detail).toContain('과체중');
    });
});

// ── 혈중지질 ─────────────────────────────────────────────────────────────

describe('혈중지질 (non-HDL)', () => {
    const bt = (total, hdl) => ({ totalCholesterol: { value: total }, hdl: { value: hdl } });

    it('non-HDL 129 → 100점', () => {
        const r = calculateLE8Score({}, [], {}, bt(200, 71));
        expect(r.factors.lipids.nonHdl).toBe(129);
        expect(r.factors.lipids.score).toBe(100);
    });

    it('non-HDL 130 → 60점 (경계 한 칸)', () => {
        const r = calculateLE8Score({}, [], {}, bt(200, 70));
        expect(r.factors.lipids.score).toBe(60);
    });

    it('non-HDL 220 이상 → 0점', () => {
        const r = calculateLE8Score({}, [], {}, bt(280, 60));
        expect(r.factors.lipids.score).toBe(0);
    });

    it('고지혈증약 복용 시 20점 감점', () => {
        const r = calculateLE8Score({ meds: ['고지혈증약'] }, [], {}, bt(200, 71));
        expect(r.factors.lipids.score).toBe(80);
        expect(r.factors.lipids.detail).toContain('고지혈증약');
    });

    it('감점이 0점 아래로 내려가지 않는다', () => {
        const r = calculateLE8Score({ meds: ['고지혈증약'] }, [], {}, bt(280, 60));
        expect(r.factors.lipids.score).toBe(0);
    });

    it('총콜레스테롤이 없으면 LDL로 근사한다', () => {
        const r = calculateLE8Score({}, [], {}, { ldl: { value: 100 } });
        expect(r.factors.lipids.nonHdl).toBe(130);
        expect(r.factors.lipids.approximated).toBe(true);
    });
});

// ── 혈당 ─────────────────────────────────────────────────────────────────

describe('혈당', () => {
    it('HbA1c 5.69 → 100점', () => {
        const r = calculateLE8Score({ hba1c: 5.69 }, []);
        expect(r.factors.glucose.score).toBe(100);
    });

    it('HbA1c 5.7 → 60점 (전당뇨 경계)', () => {
        const r = calculateLE8Score({ hba1c: 5.7 }, []);
        expect(r.factors.glucose.score).toBe(60);
    });

    it('HbA1c 6.5 → 당뇨 판정, 40점', () => {
        const r = calculateLE8Score({ hba1c: 6.5 }, []);
        expect(r.factors.glucose.diabetic).toBe(true);
        expect(r.factors.glucose.score).toBe(40);
    });

    it('HbA1c 10 이상 → 0점', () => {
        const r = calculateLE8Score({ hba1c: 10.2 }, []);
        expect(r.factors.glucose.score).toBe(0);
    });

    it('당뇨약을 먹으면 수치가 정상이어도 당뇨 배점표를 쓴다', () => {
        const r = calculateLE8Score({ hba1c: 5.0, meds: ['당뇨약'] }, []);
        expect(r.factors.glucose.diabetic).toBe(true);
        expect(r.factors.glucose.score).toBe(40);
    });

    it('HbA1c가 없으면 공복혈당으로 대체한다', () => {
        const r = calculateLE8Score({}, [log({ metrics: { glucose: 99 } })]);
        expect(r.factors.glucose.score).toBe(100);
        const pre = calculateLE8Score({}, [log({ metrics: { glucose: 100 } })]);
        expect(pre.factors.glucose.score).toBe(60);
    });

    it('공복혈당 126 이상은 당뇨로 본다', () => {
        const r = calculateLE8Score({}, [log({ metrics: { glucose: 130 } })]);
        expect(r.factors.glucose.diabetic).toBe(true);
    });
});

// ── 혈압 ─────────────────────────────────────────────────────────────────

describe('혈압 배점표', () => {
    const bp = (s, d) => calculateLE8Score({}, [log({ metrics: { bpSystolic: s, bpDiastolic: d } })]).factors.bp.score;

    it('119/79 → 100점', () => expect(bp(119, 79)).toBe(100));
    it('120/79 → 75점', () => expect(bp(120, 79)).toBe(75));
    it('130/79 → 50점', () => expect(bp(130, 79)).toBe(50));
    it('140/79 → 25점', () => expect(bp(140, 79)).toBe(25));
    it('160/79 → 0점', () => expect(bp(160, 79)).toBe(0));

    it('이완기가 나쁘면 수축기가 정상이어도 등급이 내려간다', () => {
        expect(bp(110, 80)).toBe(50);
        expect(bp(110, 90)).toBe(25);
        expect(bp(110, 100)).toBe(0);
    });

    it('고혈압약 복용 시 20점 감점', () => {
        const r = calculateLE8Score(
            { meds: ['고혈압약'] },
            [log({ metrics: { bpSystolic: 110, bpDiastolic: 70 } })]
        );
        expect(r.factors.bp.score).toBe(80);
    });

    it('한쪽만 있으면 계산하지 않는다', () => {
        const r = calculateLE8Score({}, [log({ metrics: { bpSystolic: 110 } })]);
        expect(r.factors.bp.missing).toBe(true);
    });
});

// ── 니코틴 ───────────────────────────────────────────────────────────────

describe('니코틴 노출', () => {
    it('비흡연 → 100점', () => {
        expect(calculateLE8Score({ smokingStatus: 'never' }, []).behaviors.nicotine.score).toBe(100);
    });

    it('금연 기간에 따라 점수가 달라진다', () => {
        const s = (v) => calculateLE8Score({ smokingStatus: v }, []).behaviors.nicotine.score;
        expect(s('quit_5y_plus')).toBe(75);
        expect(s('quit_1_5y')).toBe(50);
        expect(s('quit_under_1y')).toBe(25);
        expect(s('current')).toBe(0);
    });

    it('간접흡연 노출 시 20점 감점', () => {
        const r = calculateLE8Score({ smokingStatus: 'never', secondhandSmoke: true }, []);
        expect(r.behaviors.nicotine.score).toBe(80);
    });

    it('흡연 중에는 감점이 0점 아래로 내려가지 않는다', () => {
        const r = calculateLE8Score({ smokingStatus: 'current', secondhandSmoke: true }, []);
        expect(r.behaviors.nicotine.score).toBe(0);
    });

    it('입력이 없으면 계산하지 않는다', () => {
        expect(calculateLE8Score({}, []).behaviors.nicotine.missing).toBe(true);
    });
});

// ── 수면 ─────────────────────────────────────────────────────────────────

describe('수면', () => {
    const s = (h) => calculateLE8Score({}, sleepLogs(h)).behaviors.sleep.score;

    it('7.0시간 → 100점', () => expect(s(7)).toBe(100));
    it('6.9시간 → 70점 (경계 한 칸)', () => expect(s(6.9)).toBe(70));
    it('8.9시간 → 100점', () => expect(s(8.9)).toBe(100));
    it('9.0시간 → 90점', () => expect(s(9)).toBe(90));
    it('10시간 → 40점', () => expect(s(10)).toBe(40));
    it('5.5시간 → 40점', () => expect(s(5.5)).toBe(40));
    it('4.5시간 → 20점', () => expect(s(4.5)).toBe(20));
    it('3시간 → 0점', () => expect(s(3)).toBe(0));

    it('하루치만으로는 계산하지 않는다', () => {
        const r = calculateLE8Score({}, sleepLogs(8, 1));
        expect(r.behaviors.sleep.missing).toBe(true);
    });

    it('문자열 수면시간도 읽어낸다', () => {
        const logs = [
            log({ sleepAndMind: { sleepAnalysis: { details: { sleepDuration: '7시간 30분' } } } }),
            log({ sleepAndMind: { sleepAnalysis: { details: { sleepDuration: '8시간' } } } })
        ];
        expect(calculateLE8Score({}, logs).behaviors.sleep.score).toBe(100);
    });
});

describe('parseSleepDuration', () => {
    it('여러 표기를 시간 단위로 바꾼다', () => {
        expect(parseSleepDuration('7시간 30분')).toBeCloseTo(7.5);
        expect(parseSleepDuration('7h 30m')).toBeCloseTo(7.5);
        expect(parseSleepDuration('7:30')).toBeCloseTo(7.5);
        expect(parseSleepDuration('7.5')).toBeCloseTo(7.5);
        expect(parseSleepDuration(7.5)).toBeCloseTo(7.5);
        expect(parseSleepDuration('45분')).toBeCloseTo(0.75);
    });

    it('읽을 수 없으면 null', () => {
        expect(parseSleepDuration('')).toBeNull();
        expect(parseSleepDuration(null)).toBeNull();
        expect(parseSleepDuration('알 수 없음')).toBeNull();
    });
});

// ── 식단 ─────────────────────────────────────────────────────────────────

describe('식단', () => {
    it('AI 등급이 LE8 5분위로 대응된다', () => {
        const s = (g) => calculateLE8Score({}, dietLogs(g)).behaviors.diet.score;
        expect(s('A')).toBe(100);
        expect(s('B')).toBe(80);
        expect(s('C')).toBe(50);
        expect(s('D')).toBe(25);
        expect(s('F')).toBe(0);
    });

    it('3끼 미만이면 계산하지 않는다', () => {
        expect(calculateLE8Score({}, dietLogs('A', 2)).behaviors.diet.missing).toBe(true);
        expect(calculateLE8Score({}, dietLogs('A', 3)).behaviors.diet.missing).toBeUndefined();
    });

    it('여러 끼의 평균을 낸다', () => {
        const logs = [log({ dietAnalysis: { breakfast: { grade: 'A' }, lunch: { grade: 'A' }, dinner: { grade: 'F' } } })];
        // (100 + 100 + 0) / 3 = 66.67 → 67
        expect(calculateLE8Score({}, logs).behaviors.diet.score).toBe(67);
    });
});

// ── 신체활동 ─────────────────────────────────────────────────────────────

describe('신체활동', () => {
    it('건강앱 활동시간을 우선 사용한다', () => {
        const logs = [log({ steps: { active_minutes: 150 } })];
        const r = calculateLE8Score({}, logs);
        expect(r.behaviors.activity.weeklyMinutes).toBe(150);
        expect(r.behaviors.activity.score).toBe(100);
        expect(r.behaviors.activity.detail).toContain('건강앱');
    });

    it('걸음수에서 활동시간을 추정한다 (일상 이동분 제외)', () => {
        // 10000보 → (10000-4000)/100 = 60분
        const logs = [log({ steps: { count: 10000 } })];
        expect(calculateLE8Score({}, logs).behaviors.activity.weeklyMinutes).toBe(60);
    });

    it('4000보 이하는 활동시간 0으로 본다', () => {
        const logs = [log({ steps: { count: 3000 } })];
        expect(calculateLE8Score({}, logs).behaviors.activity.weeklyMinutes).toBe(0);
    });

    it('걸음수와 운동기록을 합치지 않고 큰 쪽만 쓴다 (중복 계산 방지)', () => {
        // 같은 날 산책 사진 1건(30분)과 6000보(20분)가 함께 있으면 30분.
        const logs = [log({ steps: { count: 6000 }, exercise: { cardioList: [{}] } })];
        expect(calculateLE8Score({}, logs).behaviors.activity.weeklyMinutes).toBe(30);
    });

    it('주당 분에 따라 배점표를 적용한다', () => {
        const s = (mins) => calculateLE8Score({}, [log({ steps: { active_minutes: mins } })]).behaviors.activity.score;
        expect(s(150)).toBe(100);
        expect(s(120)).toBe(90);
        expect(s(90)).toBe(80);
        expect(s(60)).toBe(60);
        expect(s(30)).toBe(40);
        expect(s(1)).toBe(20);
        expect(s(0)).toBe(0);
    });

    it('걸음수도 운동기록도 없으면 0점이 아니라 결측이다', () => {
        // 걸음수를 연동하지 않은 사용자가 부당하게 0점을 받으면 안 된다.
        const logs = [log({ metrics: { weight: 70 } })];
        expect(calculateLE8Score({}, logs).behaviors.activity.missing).toBe(true);
    });
});

// ── 총점과 결측 가드 ─────────────────────────────────────────────────────

describe('총점 가드', () => {
    it('대사지표 하나만으로는 총점을 만들지 않는다', () => {
        // 혈압만 잰 사람이 100점을 받는 오해를 막는다.
        const r = calculateLE8Score({}, [log({ metrics: { bpSystolic: 110, bpDiastolic: 70 } })]);
        expect(r.sufficient).toBe(false);
        expect(r.total).toBeNull();
        expect(r.level).toBeNull();
    });

    it('생활습관 1개 + 대사지표 1개로도 부족하다', () => {
        const r = calculateLE8Score(
            { smokingStatus: 'never' },
            [log({ metrics: { bpSystolic: 110, bpDiastolic: 70 } })]
        );
        expect(r.sufficient).toBe(false);
        expect(r.neededBehaviors).toBe(1);
        expect(r.neededFactors).toBe(1);
    });

    it('생활습관 2개 + 대사지표 2개면 총점을 낸다', () => {
        const { profile, logs } = sufficientBase();
        const r = calculateLE8Score(profile, logs);
        expect(r.sufficient).toBe(true);
        expect(r.total).toBe(100); // 금연100 + 수면100 + BMI100 + 혈압100
        expect(r.neededBehaviors).toBe(0);
        expect(r.neededFactors).toBe(0);
    });

    it('총점은 있는 항목들의 단순 평균이다', () => {
        const { profile, logs } = sufficientBase();
        // 흡연 중으로 바꾸면 4개 중 하나가 0점 → (0+100+100+100)/4 = 75
        const r = calculateLE8Score({ ...profile, smokingStatus: 'current' }, logs);
        expect(r.total).toBe(75);
    });

    it('생활습관과 대사지표 점수를 따로 낸다', () => {
        const { profile, logs } = sufficientBase();
        const r = calculateLE8Score({ ...profile, smokingStatus: 'current' }, logs);
        expect(r.behaviorScore).toBe(50);  // 금연 0 + 수면 100
        expect(r.factorScore).toBe(100);   // BMI 100 + 혈압 100
    });
});

describe('구간 판정', () => {
    it('LE8 표준 구간을 따른다', () => {
        expect(getLevel(80).key).toBe('high');
        expect(getLevel(79).key).toBe('moderate');
        expect(getLevel(50).key).toBe('moderate');
        expect(getLevel(49).key).toBe('low');
        expect(getLevel(0).key).toBe('low');
    });
});

describe('입력 방어', () => {
    it('인자가 없어도 터지지 않는다', () => {
        const r = calculateLE8Score();
        expect(r.total).toBeNull();
        expect(r.sufficient).toBe(false);
    });

    it('빈 문자열 지표를 값으로 오해하지 않는다', () => {
        const r = calculateLE8Score({ heightCm: '' }, [log({ metrics: { weight: '' } })]);
        expect(r.factors.bmi.missing).toBe(true);
    });

    it('가장 최근 기록된 지표를 쓴다', () => {
        const logs = [
            log({ metrics: { bpSystolic: 180, bpDiastolic: 110 } }),
            log({ metrics: { bpSystolic: 110, bpDiastolic: 70 } })
        ];
        expect(calculateLE8Score({}, logs).factors.bp.systolic).toBe(110);
    });

    it('최근 기록이 비어 있으면 그 이전 값을 찾는다', () => {
        const logs = [
            log({ metrics: { bpSystolic: 110, bpDiastolic: 70 } }),
            log({ metrics: {} })
        ];
        expect(calculateLE8Score({}, logs).factors.bp.systolic).toBe(110);
    });
});
