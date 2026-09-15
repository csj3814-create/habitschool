import { describe, expect, it } from 'vitest';
import {
    buildAdminPrescriptionDrafts,
    ADMIN_PRESCRIPTION_MIN_ABSOLUTE_CHANGE as MIN_CHANGE,
} from '../js/admin-utils.js';
import { FLAT_RATIO } from '../functions/health-trends.js';

const TODAY = '2026-09-15';
const FULL_DAY = { date: TODAY, diet: { breakfastUrl: 'x' }, steps: { count: 9000 }, sleepAndMind: { sleepHours: 7 } };

const bpDraft = (key, label, previous, recent) => buildAdminPrescriptionDrafts({
    logs: [FULL_DAY], todayStr: TODAY,
    trendMetrics: [{
        key, label, unit: 'mmHg', decimals: 0,
        summary: {
            recent, previous, delta: recent - previous,
            direction: recent < previous ? 'improved' : 'worsened',
        },
    }],
}).find((d) => d.key.includes('improved') || d.key.includes('worsened'));

// 2026-09-15 지적: "이완기 혈압, 수축기 혈압 이정도 차이는 임상적으로 별 의미
// 없는 차이야. 최소 수축기 10 이상, 이완기 5 이상은 차이가 나야 칭찬할 만
// 하다고 할 수 있겠어."
//
// 그때까지 문턱은 상대값 하나뿐이었다. 수축기 108 의 2% 는 2.2mmHg 라 3mmHg
// 움직인 것이 '개선' 으로 올라왔다.
describe('blood pressure has to move enough to be worth a word', () => {
    it('says nothing about the readings that prompted this', () => {
        // 관제탑 화면의 Slow rabbit.
        expect(bpDraft('bpDiastolic', '이완기혈압', 75, 71)).toBeUndefined();  // 4mmHg
        expect(bpDraft('bpSystolic', '수축기혈압', 108, 105)).toBeUndefined(); // 3mmHg
    });

    it('holds systolic at 10 and diastolic at 5', () => {
        expect(MIN_CHANGE.bpSystolic).toBe(10);
        expect(MIN_CHANGE.bpDiastolic).toBe(5);
        expect(bpDraft('bpSystolic', '수축기혈압', 140, 131)).toBeUndefined();
        expect(bpDraft('bpSystolic', '수축기혈압', 140, 130)).toBeTruthy();
        expect(bpDraft('bpDiastolic', '이완기혈압', 90, 86)).toBeUndefined();
        expect(bpDraft('bpDiastolic', '이완기혈압', 90, 85)).toBeTruthy();
    });

    it('applies the same floor to getting worse, not only to praise', () => {
        // 3mmHg 올랐다고 "나빠졌습니다" 라고 하는 것도 같은 정도로 근거가 없다.
        expect(bpDraft('bpSystolic', '수축기혈압', 110, 113)).toBeUndefined();
        expect(bpDraft('bpSystolic', '수축기혈압', 110, 125)).toBeTruthy();
        expect(bpDraft('bpDiastolic', '이완기혈압', 78, 82)).toBeUndefined();
        expect(bpDraft('bpDiastolic', '이완기혈압', 78, 84)).toBeTruthy();
    });

    it('is a floor the relative test could not provide', () => {
        // 상대값 문턱만으로는 이 값들이 전부 통과한다 — 그래서 절대 변화폭이 필요했다.
        for (const [previous, recent] of [[108, 105], [75, 71], [140, 131]]) {
            expect(Math.abs(recent - previous) / previous).toBeGreaterThan(FLAT_RATIO);
        }
    });

    it('leaves the metrics it was not asked about to the relative test', () => {
        // 혈당·당화혈색소도 같은 질문이 있지만 임상 기준은 정해 주신 것만 쓴다.
        for (const key of ['glucose', 'hba1c', 'steps', 'sleepHours', 'dietGrade', 'nonHdl']) {
            expect(MIN_CHANGE[key], key).toBeUndefined();
        }
    });

    it('still lets the good-enough rule do its own job', () => {
        // 변화폭은 충분해도 78mmHg 는 기준(80) 안쪽이라 조용하다. 두 규칙은 따로 선다.
        expect(bpDraft('bpDiastolic', '이완기혈압', 70, 78)).toBeUndefined();
        expect(bpDraft('bpDiastolic', '이완기혈압', 80, 92)).toBeTruthy();
    });
});
