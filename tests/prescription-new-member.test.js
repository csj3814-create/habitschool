import { describe, expect, it } from 'vitest';
import {
    buildAdminPrescriptionDrafts,
    ADMIN_PRESCRIPTION_GAP_MIN_HISTORY_DAYS as MIN_HISTORY,
    ADMIN_PRESCRIPTION_GAP_MIN_STRONG_DAYS as MIN_STRONG,
} from '../js/admin-utils.js';

const TODAY = '2026-09-16';
const dayAgo = (offset, extra) => ({
    date: new Date(new Date(`${TODAY}T12:00:00Z`).getTime() - offset * 86400000).toISOString().slice(0, 10),
    ...extra,
});
const EXERCISE = { exercise: { cardioList: [1] } };
const DIET = { diet: { breakfastUrl: 'x' } };

const gapDraft = (logs) => buildAdminPrescriptionDrafts({ logs, todayStr: TODAY })
    .find((d) => d.key.includes('gap'));

// 2026-09-15 지적: "신규 회원들에게 식단이 없다는 둥 운동이 없다는 둥 하면 안되지."
//
// 대기열에 올라온 세 분은 최근 7일에 기록이 하루뿐이었다. 그 하루로 "운동은
// 1일 남기셨는데 식단이 한 번도 없습니다" 라고 한 것이다.
describe('a member who just arrived is not told what is missing', () => {
    it('says nothing to the three who prompted this', () => {
        expect(gapDraft([dayAgo(1, EXERCISE)])).toBeUndefined();
        expect(gapDraft([dayAgo(0, DIET)])).toBeUndefined();
        expect(gapDraft([dayAgo(0, EXERCISE)])).toBeUndefined();
    });

    it('waits two weeks before calling an area empty', () => {
        expect(MIN_HISTORY).toBe(14);
        // 닷새 동안 나흘이나 기록해도, 아직 자리를 잡는 중이다.
        const eager = [1, 2, 3, 4].map((d) => dayAgo(d, EXERCISE));
        expect(gapDraft(eager)).toBeUndefined();
        // 2주가 지나면 같은 기록으로 말한다.
        expect(gapDraft([dayAgo(14, EXERCISE), ...eager])).toBeTruthy();
    });

    it('needs a few days before calling an area one they are doing', () => {
        expect(MIN_STRONG).toBe(3);
        const settled = (days) => [dayAgo(29, EXERCISE), ...days.map((d) => dayAgo(d, EXERCISE))];
        // 하루 기록으로 "운동은 1일 남기셨는데" 라고 하는 것은 근거가 아니다.
        expect(gapDraft(settled([1]))).toBeUndefined();
        expect(gapDraft(settled([1, 2]))).toBeUndefined();
        expect(gapDraft(settled([1, 2, 3]))).toBeTruthy();
    });

    it('counts the strong area inside the last seven days, not all history', () => {
        // 한 달 전에 사흘 했다고 지금 '하고 있다' 고 부를 수는 없다.
        expect(gapDraft([dayAgo(40, EXERCISE), dayAgo(39, EXERCISE), dayAgo(38, EXERCISE)])).toBeUndefined();
    });

    it('still names the gap for a settled member', () => {
        const draft = gapDraft([dayAgo(30, DIET), dayAgo(1, DIET), dayAgo(2, DIET), dayAgo(3, DIET)]);
        expect(draft.key).toMatch(/gap-(exercise|sleep)/);
        expect(draft.message).toContain('식단은 3일 남기셨습니다');
    });

    it('leaves the other kinds of draft alone for a new member', () => {
        // 새로 오신 분이라고 아무 말도 못 하는 것은 아니다. 잰 값이 기준을
        // 넘었으면 그건 첫날에도 말해야 한다.
        const drafts = buildAdminPrescriptionDrafts({
            logs: [dayAgo(0, { metrics: { glucose: 141 } })],
            todayStr: TODAY,
        });
        expect(drafts.find((d) => d.key.includes('alert'))).toBeTruthy();
    });
});
