import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdminPrescriptionDrafts, withJosa } from '../js/admin-utils.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = readFileSync(resolve(ROOT_DIR, 'admin.html'), 'utf8');
const TODAY = '2026-09-15';

const draftFor = (drafts, keyPart) => drafts.find((d) => d.key.includes(keyPart));

// 2026-09-15 요청: "다이렉트 처방을 더 자세하고 데이터 기반으로 준비해 줘.
// 내가 직접 분석해서 정성들여 메세지 보내듯이."
//
// 버튼 넷이 누구에게나 같은 말을 했다 — 혈당을 한 번도 안 잰 회원에게도
// "혈당 조절에 한 걸음 더 가까워지고 있어요" 가 갔다. 받는 사람은 이게 나를 보고
// 쓴 말이 아니라는 것을 안다.
describe('a prescription is written from this member, or not written', () => {
    it('says nothing about a number the member never recorded', () => {
        // 이 규칙 하나가 예전 버튼과의 차이 전부다.
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나',
            logs: [{ date: TODAY, diet: { breakfastUrl: 'https://x/a' } }],
            trendMetrics: [],
            streak: 0,
            todayStr: TODAY,
        });
        const text = drafts.map((d) => d.message).join('\n');
        expect(text).not.toContain('혈당');
        expect(text).not.toContain('혈압');
    });

    it('cites the actual reading when there is one over the line', () => {
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나',
            logs: [{ date: '2026-09-12', metrics: { glucose: 141 } }],
            todayStr: TODAY,
        });
        const alert = draftFor(drafts, 'alert');
        expect(alert.tone).toBe('warn');
        expect(alert.message).toContain('141');
        expect(alert.message).toContain('2026-09-12');
        expect(alert.evidence).toContain('126');
        // 한 번의 수치로 단정하지 않는다.
        expect(alert.message).toContain('단정할 수는 없지만');
    });

    it('puts the alert first — the urgent thing goes on top', () => {
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나',
            logs: [{ date: '2026-09-12', metrics: { glucose: 141 } }],
            streak: 157,
            todayStr: TODAY,
        });
        expect(drafts[0].key).toContain('alert');
        // 나쁜 말만 늘어놓지도 않는다 — 좋은 것도 함께 올라온다.
        expect(draftFor(drafts, 'streak')).toBeTruthy();
    });

    it('praises with the two numbers that made the change', () => {
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나',
            logs: [{ date: TODAY }],
            trendMetrics: [{
                key: 'dietGrade', label: '식단 등급', unit: '점', decimals: 0, percentile: 79,
                summary: { recent: 95, previous: 85, delta: 10, direction: 'improved' },
            }],
            todayStr: TODAY,
        });
        const praise = draftFor(drafts, 'improved');
        expect(praise.tone).toBe('good');
        expect(praise.message).toContain('85점');
        expect(praise.message).toContain('95점');
        expect(praise.message).toContain('상위 21%');
        expect(praise.evidence).toContain('85점');
    });

    it('leaves the ranking out when the cohort position is unknown', () => {
        const drafts = buildAdminPrescriptionDrafts({
            logs: [{ date: TODAY }],
            trendMetrics: [{
                key: 'sleepHours', label: '수면', unit: '시간', decimals: 1,
                summary: { recent: 7.7, previous: 6.9, delta: 0.8, direction: 'improved' },
            }],
            todayStr: TODAY,
        });
        const praise = draftFor(drafts, 'improved');
        expect(praise.message).toContain('7.7시간');
        expect(praise.message).not.toContain('상위');
    });

    it('names the area that is empty, and the one that is not', () => {
        // 일곱 날 중 식단만 남긴 회원에게 "운동도 하세요" 는 게으른 말이다.
        // 무엇을 이미 하고 있는지 먼저 말하고 나서 비어 있는 한 가지를 청한다.
        const logs = ['09-09', '09-10', '09-11', '09-12', '09-13'].map((d) => ({
            date: `2026-${d}`, diet: { breakfastUrl: 'https://x/a' },
        }));
        const drafts = buildAdminPrescriptionDrafts({ name: '루미나', logs, todayStr: TODAY });
        const gap = draftFor(drafts, 'gap');
        expect(gap.evidence).toContain('식단 5일');
        expect(gap.message).toContain('7일 중 5일');
        expect(gap.message).toMatch(/운동|수면/);
        // 점수가 실제보다 낮게 잡힌다는 이유까지 말한다.
        expect(gap.message).toContain('낮게 잡히고');
    });

    it('offers nothing about gaps when every area is already covered', () => {
        const logs = ['09-13', '09-14', '09-15'].map((d) => ({
            date: `2026-${d}`,
            diet: { breakfastUrl: 'https://x/a' },
            steps: { count: 9000 },
            sleepAndMind: { sleepHours: 7 },
        }));
        const drafts = buildAdminPrescriptionDrafts({ logs, todayStr: TODAY });
        expect(draftFor(drafts, 'gap')).toBeUndefined();
    });

    it('counts the days since the last record instead of scolding', () => {
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나',
            logs: [{ date: '2026-09-08', diet: { breakfastUrl: 'https://x/a' } }],
            todayStr: TODAY,
        });
        const back = draftFor(drafts, 'comeback');
        expect(back.message).toContain('2026-09-08');
        expect(back.message).toContain('7일');
        expect(back.message).toContain('채근하려고 드리는 말씀이 아니라');
    });

    it('stays quiet about a streak that has not been earned', () => {
        const drafts = buildAdminPrescriptionDrafts({ logs: [{ date: TODAY }], streak: 3, todayStr: TODAY });
        expect(draftFor(drafts, 'streak')).toBeUndefined();
    });

    it('reads a three-digit streak differently from a one-week one', () => {
        const long = buildAdminPrescriptionDrafts({ logs: [{ date: TODAY }], streak: 157, todayStr: TODAY });
        expect(draftFor(long, 'streak').message).toContain('생활이라고');
        const short = buildAdminPrescriptionDrafts({ logs: [{ date: TODAY }], streak: 9, todayStr: TODAY });
        expect(draftFor(short, 'streak').message).toContain('한 주를 넘기면');
    });

    it('carries the evidence so it can be checked before sending', () => {
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나',
            logs: [{ date: '2026-09-12', metrics: { glucose: 141 } }],
            streak: 157,
            todayStr: TODAY,
        });
        expect(drafts.length).toBeGreaterThan(0);
        for (const draft of drafts) {
            expect(draft.evidence, draft.key).toBeTruthy();
            expect(draft.label, draft.key).toBeTruthy();
            expect(draft.message.length, draft.key).toBeGreaterThan(80);
        }
    });

    it('hands back nothing at all for a member with no record', () => {
        expect(buildAdminPrescriptionDrafts({ logs: [], todayStr: TODAY })).toEqual([]);
    });
});

describe('the admin screen shows drafts instead of four fixed lines', () => {
    it('drops the canned buttons', () => {
        expect(ADMIN).not.toContain('혈당 조절에 한 걸음 더 가까워지고 있어요');
        expect(ADMIN).not.toContain('조금만 더 힘내세요! 꾸준한 실천이 건강을 만듭니다');
    });

    it('renders one card per draft, with its evidence', () => {
        expect(ADMIN).toContain('<div id="rx-drafts" class="rx-drafts">');
        const fn = ADMIN.split('function renderPrescriptionDrafts(')[1].split('\n    }\n')[0];
        expect(fn).toContain('rx-draft-label');
        expect(fn).toContain('rx-draft-evidence');
        expect(fn).toContain('quickMsg(draft.message)');
    });

    it('says so plainly when it has no grounds, rather than filling the gap', () => {
        const fn = ADMIN.split('function renderPrescriptionDrafts(')[1].split('\n    }\n')[0];
        expect(fn).toContain('근거 있는 초안을 만들지 못했습니다');
        expect(fn).toContain('직접 적어 보내 주세요');
    });

    it('rebuilds once the four-week trend arrives', () => {
        // 추이는 로그보다 늦게 온다. 그 전에 만든 초안에는 4주 비교가 없다.
        expect(ADMIN).toContain('function refreshPrescriptionDrafts()');
        expect(ADMIN.split('refreshPrescriptionDrafts();').length - 1).toBe(2);
        expect(ADMIN).toContain('trendMetrics: memberTrendPayload?.metrics || []');
    });
});

// 조사가 틀리면 "걸음수이 85점에서 95점로" 가 되고, 받는 사람은 한 줄 만에
// 사람이 쓴 글이 아니라는 것을 안다. 정성 들인 메시지가 목적인 기능에서는
// 이 한 글자가 문장 전체를 무너뜨린다.
describe('the sentences read like a person wrote them', () => {
    it('picks 이/가 by the final consonant', () => {
        expect(withJosa('걸음수', '이가')).toBe('걸음수가');   // 받침 없음
        expect(withJosa('식단 등급', '이가')).toBe('식단 등급이'); // ㅂ
        expect(withJosa('수면', '이가')).toBe('수면이');        // ㄴ
        expect(withJosa('공복혈당', '이가')).toBe('공복혈당이'); // ㅇ
        expect(withJosa('혈압', '이가')).toBe('혈압이');        // ㅂ
    });

    it('picks 은/는 the same way', () => {
        expect(withJosa('식단', '은는')).toBe('식단은');
        expect(withJosa('운동', '은는')).toBe('운동은');
        expect(withJosa('걸음수', '은는')).toBe('걸음수는');
    });

    it('picks 로/으로, including the ㄹ exception', () => {
        expect(withJosa('95점', '으로')).toBe('95점으로');      // ㅁ
        expect(withJosa('7.7시간', '으로')).toBe('7.7시간으로'); // ㄴ
        expect(withJosa('9549보', '으로')).toBe('9549보로');     // 받침 없음
        expect(withJosa('6레벨', '으로')).toBe('6레벨로');       // ㄹ — '레벨으로'가 아니다
    });

    it('reads a unit by how it is spoken, not how it is spelled', () => {
        // kg 는 '킬로그램' 이라 받침이 있고, mg/dL 은 '데시리터' 라 없다.
        expect(withJosa('70.5kg', '으로')).toBe('70.5kg으로');
        expect(withJosa('141mg/dL', '으로')).toBe('141mg/dL로');
        expect(withJosa('128mmHg', '으로')).toBe('128mmHg로');
        // 단위 없는 숫자는 마지막 자리의 소리로 — 3은 '삼', 2는 '이'.
        expect(withJosa('22.3', '으로')).toBe('22.3으로');
        expect(withJosa('22.2', '으로')).toBe('22.2로');
    });

    it('never leaves a wrong particle in a generated message', () => {
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나',
            logs: [{ date: '2026-09-12', metrics: { glucose: 141, bpSystolic: 145, bpDiastolic: 95 } }],
            streak: 157,
            todayStr: TODAY,
            trendMetrics: [
                { key: 'steps', label: '걸음수', unit: '보', decimals: 0,
                  summary: { recent: 9549, previous: 7200, delta: 2349, direction: 'improved' } },
                { key: 'weight', label: '체중', unit: 'kg', decimals: 1,
                  summary: { recent: 70.5, previous: 69.0, delta: 1.5, direction: 'worsened' } },
            ],
        });
        const text = drafts.map((d) => d.message).join(String.fromCharCode(10));
        for (const wrong of ['걸음수이', '점로', '시간로', '혈당가', '혈압가', '레벨으로', 'kg로']) {
            expect(text, wrong).not.toContain(wrong);
        }
        // 맞는 쪽은 실제로 들어 있어야 한다 — 없는 문장을 통과시키지 않기 위해서다.
        expect(text).toContain('걸음수가');
        expect(text).toContain('9,549보로');
        expect(text).toContain('141 mg/dL로');
    });
});
