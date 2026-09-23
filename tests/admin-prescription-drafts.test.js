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
        expect(alert.message).toContain('9월 12일');
        // ISO 날짜는 관제탑이 보내기 전에 대조할 evidence 에만 남는다.
        expect(alert.message).not.toContain('2026-09-12');
        expect(alert.evidence).toContain('2026-09-12');
        expect(alert.evidence).toContain('126');
        // 한 번의 수치로 단정하지 않는다.
        expect(alert.message).toContain('두세 번 값이 모여야');
    });

    it('puts the alert first — the urgent thing goes on top', () => {
        // 2026-09-23: 이 재료에 오늘 기록을 더했다. 157일 연속이면서 마지막
        // 기록이 사흘 전이라는 것은 실제로는 있을 수 없는 조합이고 — 그게 바로
        // users.currentStreak 이 낡았을 때의 모습이다 — 이제 꾸준함 카드가
        // 그런 재료를 거른다. 이 테스트가 보는 것은 순서이지 그 판정이 아니다.
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나',
            logs: [{ date: TODAY }, { date: '2026-09-12', metrics: { glucose: 141 } }],
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

    it('names the area that is thin, and the one that is not', () => {
        // 일곱 날 중 식단만 남긴 회원에게 "운동도 하세요" 는 게으른 말이다.
        // 무엇을 이미 하고 있는지 먼저 말하고 나서 한 가지를 더 청한다.
        const logs = ['08-20', '09-09', '09-10', '09-11', '09-12', '09-13'].map((d) => ({
            date: `2026-${d}`, diet: { breakfastUrl: 'https://x/a' },
        }));
        // 첫 기록이 2주보다 앞서야 '비어 있는 자리' 를 말한다 — 막 시작한 분께
        // 빠진 것부터 세지 않기 위해서다(tests/prescription-new-member.test.js).
        const drafts = buildAdminPrescriptionDrafts({ name: '루미나', logs, todayStr: TODAY });
        const gap = draftFor(drafts, 'gap');
        expect(gap.evidence).toContain('식단 5일');
        expect(gap.message).toContain('지난 7일 중');
        expect(gap.message).toContain('5일 남기셨습니다');
        expect(gap.message).toMatch(/운동|수면/);
        // 2026-09-18 지시: "메세지는 운동 기록을 하면 더 좋아진다는 긍정 피드백
        // 방향으로 하자." 깎인다고 겁주는 대신 올라간다고 청한다
        // (tests/prescription-sparse-area.test.js).
        expect(gap.message).toContain('올라갑니다');
        expect(gap.message).not.toContain('낮게 잡히니');
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

    // 2026-09-15 지적: "마지막 기록 복귀 권유는 메일로 해야지 앱에다 잔소리로
    // 보내봐야 볼 수가 없지."
    //
    // 코치 메시지 카드는 앱을 열어야 보인다. 열흘째 안 들어온 분께 앱 안에
    // "열흘째 기록이 없습니다" 라고 적어 두는 것은 닿지 않는 자리에 써 붙이는
    // 것과 같다. 그 일은 재참여 메일이 이미 한다.
    it('leaves the come-back nudge to email, which actually reaches them', () => {
        const drafts = buildAdminPrescriptionDrafts({
            logs: [{ date: '2026-09-08', diet: { breakfastUrl: 'https://x/a' } }],
            todayStr: TODAY,
        });
        expect(draftFor(drafts, 'comeback')).toBeUndefined();
        const text = drafts.map((d) => d.message + d.summary + d.label).join('\n');
        expect(text).not.toContain('복귀');
        expect(text).not.toContain('일째 기록이 없습니다');
    });

    it('stays quiet about a streak that has not been earned', () => {
        const drafts = buildAdminPrescriptionDrafts({ logs: [{ date: TODAY }], streak: 3, todayStr: TODAY });
        expect(draftFor(drafts, 'streak')).toBeUndefined();
    });

    // 2026-09-15 지적: "66일 연속 기록을 축하하면서 응원을 해야 하는 메세지가
    // 나와야 하는데 엉뚱한 이야기를 하고 있어."
    //
    // 분기가 100일 기준 둘뿐이라 66일째인 분이 "2주를 넘기면…" 을 받았고,
    // 둘째 줄은 통째로 '혹시 끊기더라도' 였다 — 축하 자리에서 실패를 먼저 꺼냈다.
    const streakMessage = (days) => draftFor(
        buildAdminPrescriptionDrafts({ logs: [{ date: TODAY }], streak: days, todayStr: TODAY }),
        'streak'
    ).message;

    it('congratulates instead of warning about breaking the run', () => {
        for (const days of [7, 10, 14, 30, 66, 100, 365]) {
            const message = streakMessage(days);
            for (const wrong of ['혹시 끊기더라도', '빠뜨린 날이', '다시 세면']) {
                expect(message, `${days}일 · ${wrong}`).not.toContain(wrong);
            }
        }
        expect(streakMessage(66)).toContain('축하');
    });

    it('measures the run in a unit that fits its length', () => {
        expect(streakMessage(7)).toContain('일주일을 채우셨습니다');
        // 10일에게 "일주일을 채우셨습니다" 는 사흘을 빠뜨리고 세는 말이다.
        expect(streakMessage(10)).toContain('일주일을 넘기셨습니다');
        expect(streakMessage(21)).toContain('3주째');
        expect(streakMessage(66)).toContain('2개월 넘게');
        expect(streakMessage(365)).toContain('1년을');
        expect(streakMessage(730)).toContain('2년을');
    });

    it('never tells a two-month member what happens at two weeks', () => {
        // 66일째인 분께 "2주를 넘기면" 은 엉뚱한 말이다.
        expect(streakMessage(66)).not.toContain('2주를 넘기면');
        expect(streakMessage(66)).not.toContain('첫 주가');
        // 반대로 일주일째인 분께 세 자리 이야기를 하지 않는다.
        expect(streakMessage(7)).not.toContain('손에 꼽');
    });

    it('does not repeat the same ending twice in one line', () => {
        // "…기록하고 계십니다. 2주째 이어오고 계십니다." 로 겹쳐 읽혔다.
        for (const days of [14, 21, 45]) {
            const first = streakMessage(days).split(String.fromCharCode(10))[0];
            expect(first.split('계십니다').length - 1, `${days}일`).toBe(1);
        }
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
            expect(draft.message.length, draft.key).toBeGreaterThan(60);
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
        // 2026-09-15: 주간 대기열이 4주 쿨다운을 걸려면 어떤 초안이었는지도 함께 간다.
        expect(fn).toContain('quickMsg(draft.message, draft.summary, draft.key)');
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
        for (const wrong of ['걸음수이', '걸음수을', '점로', '시간로', '혈당가', '혈압가', '레벨으로', 'kg로', 'mg/dL을']) {
            expect(text, wrong).not.toContain(wrong);
        }
        // 맞는 쪽은 실제로 들어 있어야 한다 — 없는 문장을 통과시키지 않기 위해서다.
        expect(text).toContain('공복혈당이');
        expect(text).toContain('70.5kg으로');
        // 칭찬은 회원이 주어다 — '걸음수가' 가 아니라 '걸음수를 … 늘려오셨습니다'.
        expect(text).toContain('걸음수를');
    });
});

// 2026-09-15 지적: "걸음수는 잘 늘려왔습니다라고 표현해야지 올라섰다는 표현은
// 어색해. 우연이 아니라 라는 말도 쓸데 없는 표현이야. AI 티 안나게 내가 직접
// 세심하게 작성한 것처럼 작성해 줘."
//
// 한 문장 틀에 모든 지표를 끼워 넣은 것이 원인이었다. 걸음수가 '올라서고'
// 수면이 '올라서면' 사람이 쓴 글이 아니다.
describe('the verb comes from the metric, not from a template', () => {
    const praiseFor = (key, label, unit, previous, recent) => buildAdminPrescriptionDrafts({
        logs: [{ date: TODAY }],
        todayStr: TODAY,
        trendMetrics: [{
            key, label, unit, decimals: 1,
            summary: { recent, previous, delta: recent - previous, direction: 'improved' },
        }],
    })[0].message;

    it('gives each metric the verb that actually fits it', () => {
        expect(praiseFor('steps', '걸음수', '보', 7200, 9549)).toContain('늘려오셨습니다');
        expect(praiseFor('sleepHours', '수면', '시간', 6.9, 7.7)).toContain('늘리셨습니다');
        expect(praiseFor('glucose', '공복혈당', 'mg/dL', 141, 105)).toContain('내리셨습니다');
        expect(praiseFor('bodyFat', '체지방', 'kg', 28.0, 25.5)).toContain('줄이셨습니다');
        expect(praiseFor('dietGrade', '식단 등급', '점', 85, 95)).toContain('올리셨습니다');
    });

    it('never says a number "stepped up"', () => {
        // 한 틀로 찍어 내던 흔적. 어느 지표에서도 다시 나오면 안 된다.
        for (const key of ['steps', 'sleepHours', 'glucose', 'bodyFat', 'dietGrade', 'muscle']) {
            expect(praiseFor(key, '지표', '', 10, 20), key).not.toContain('올라섰습니다');
        }
    });

    it('passes no judgment on a metric that has no good direction', () => {
        // 체중은 health-trends.js 에서 better: null 이다. 저체중 회원의 증량을
        // '나빠졌습니다' 라고 부르면 안 된다.
        const drafts = buildAdminPrescriptionDrafts({
            logs: [{ date: TODAY }],
            todayStr: TODAY,
            trendMetrics: [{
                key: 'weight', label: '체중', unit: 'kg', decimals: 1,
                summary: { recent: 70.5, previous: 69.0, delta: 1.5, direction: 'worsened' },
            }],
        });
        const message = draftFor(drafts, 'worsened').message;
        expect(message).toContain('늘었습니다');
        expect(message).not.toContain('나빠졌습니다');
    });

    it('drops the filler that gave it away', () => {
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나',
            logs: [{ date: '2026-09-12', metrics: { glucose: 141 } }],
            streak: 157,
            todayStr: TODAY,
            trendMetrics: [{
                key: 'steps', label: '걸음수', unit: '보', decimals: 0, percentile: 79,
                summary: { recent: 9549, previous: 7200, delta: 2349, direction: 'improved' },
            }],
        });
        const text = drafts.map((d) => d.message + String.fromCharCode(10) + d.summary).join(String.fromCharCode(10));
        for (const filler of ['우연이 아니라', '쌓아 만든 결과', '잘 올라왔어요', '진짜입니다', '아까워서요']) {
            expect(text, filler).not.toContain(filler);
        }
    });

    it('closes every sentence it opens', () => {
        // 마침표 없이 다음 절이 붙어 "늘려오셨습니다 전체 회원 중" 이 된 적이 있다.
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나',
            logs: [{ date: '2026-09-12', metrics: { glucose: 141 } }],
            streak: 157,
            todayStr: TODAY,
            trendMetrics: [
                { key: 'steps', label: '걸음수', unit: '보', decimals: 0, percentile: 79,
                  summary: { recent: 9549, previous: 7200, delta: 2349, direction: 'improved' } },
                { key: 'sleepHours', label: '수면', unit: '시간', decimals: 1,
                  summary: { recent: 6.2, previous: 7.7, delta: -1.5, direction: 'worsened' } },
            ],
        });
        for (const draft of drafts) {
            for (const line of draft.message.split(String.fromCharCode(10))) {
                expect(line.trim(), draft.key + ' :: ' + line).toMatch(/[.?]$/);
            }
        }
    });
});
