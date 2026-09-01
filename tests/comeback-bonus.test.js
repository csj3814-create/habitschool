import { describe, expect, it } from 'vitest';
import {
    COMEBACK_BONUS_POINTS,
    COMEBACK_MIN_GAP_DAYS,
    COMEBACK_COOLDOWN_DAYS,
    decideComebackBonus
} from '../functions/comeback-bonus.js';
import { readRepoFile } from './source-helpers.js';

// 이 보상에서 가장 중요한 건 금액이 아니라 결석에 보상하지 않는 것이다.
// 7일을 쉬면 그동안 기록으로 벌 수 있었던 것이 300~560P(하루 최대 80P)다.
describe('복귀 보너스는 쉬는 쪽이 이득이 되지 않는다', () => {
    it('하루치 기록 수준을 넘지 않는다', () => {
        const maxPerDay = 80;                 // 식단 30 + 운동 30 + 마음 20
        expect(COMEBACK_BONUS_POINTS).toBeLessThanOrEqual(maxPerDay);
        // 7일을 쉬고 받는 값이, 7일을 기록해서 버는 최솟값보다 훨씬 작아야 한다.
        expect(COMEBACK_BONUS_POINTS * 4).toBeLessThan(7 * 40);
    });

    it('마일스톤 최고액보다 작다', () => {
        // 60일 연속 기록이 100P다. 꾸준함이 복귀보다 값져야 한다.
        expect(COMEBACK_BONUS_POINTS).toBeLessThan(100);
    });
});

describe('언제 주는가', () => {
    it('7일 이상 비었다가 돌아오면 준다', () => {
        const result = decideComebackBonus({
            logDate: '2026-09-02', previousLogDate: '2026-08-26', lastBonusDate: ''
        });
        expect(result).toEqual({ earned: true, points: 50, gapDays: 7, reason: 'earned' });
    });

    it('6일은 아직 "떠난" 것이 아니다', () => {
        const result = decideComebackBonus({
            logDate: '2026-09-02', previousLogDate: '2026-08-27', lastBonusDate: ''
        });
        expect(result.earned).toBe(false);
        expect(result.reason).toBe('gap_too_short');
        expect(COMEBACK_MIN_GAP_DAYS).toBe(7);
    });

    it('처음 기록하는 사람에게는 복귀가 없다', () => {
        // 그 자리는 가입 축하 200P 가 맡는다.
        expect(decideComebackBonus({ logDate: '2026-09-02', previousLogDate: '' }).reason)
            .toBe('no_previous_record');
    });

    it('지난 기록을 나중에 고친 것은 복귀가 아니다', () => {
        const result = decideComebackBonus({
            logDate: '2026-08-01', previousLogDate: '2026-09-01', lastBonusDate: ''
        });
        expect(result.earned).toBe(false);
        expect(result.reason).toBe('not_a_new_day');
    });
});

describe('반복 악용을 막는다', () => {
    it('30일 안에는 다시 받지 못한다', () => {
        // 이게 없으면 "일주일 쉬고 → 하루 기록 → 보너스" 를 계속 돌릴 수 있다.
        const result = decideComebackBonus({
            logDate: '2026-09-02', previousLogDate: '2026-08-20', lastBonusDate: '2026-08-19'
        });
        expect(result.earned).toBe(false);
        expect(result.reason).toBe('cooldown');
        expect(COMEBACK_COOLDOWN_DAYS).toBe(30);
    });

    it('30일이 지나면 다시 받을 수 있다', () => {
        const result = decideComebackBonus({
            logDate: '2026-09-02', previousLogDate: '2026-08-20', lastBonusDate: '2026-08-03'
        });
        expect(result.earned).toBe(true);
    });
});

describe('지급 경로', () => {
    const RUNTIME = readRepoFile('functions/runtime.js');

    it('기록이 들어올 때 판정한다', () => {
        expect(RUNTIME).toContain('await awardComebackBonus(userId, logDate, previousLogState);');
    });

    it('같은 날 여러 번 저장해도 한 번만 나간다', () => {
        const fn = RUNTIME.split('async function awardComebackBonus(userId, logDate, previous) {')[1].split('\n}\n')[0];
        expect(fn).toContain('doc(`comeback_${logDate}`)');
        expect(fn).toContain('if (ledgerSnap.exists || !userSnap.exists) return false;');
        // 트랜잭션 안에서 쿨다운을 다시 본다.
        expect(fn).toContain('if (!recheck.earned) return false;');
    });

    it('보너스가 실패해도 포인트 정산을 재시도시키지 않는다', () => {
        const fn = RUNTIME.split('async function awardComebackBonus(userId, logDate, previous) {')[1].split('\n}\n')[0];
        expect(fn).toContain('} catch (error) {');
        expect(fn).not.toContain('throw');
    });

    it('규칙을 runtime 에 다시 쓰지 않는다', () => {
        // 금액과 조건은 comeback-bonus.js 한 곳에 있다.
        expect(RUNTIME).toContain('decideComebackBonus({');
        expect(RUNTIME).not.toContain('COMEBACK_MIN_GAP_DAYS');
    });
});

describe('받은 것을 알린다', () => {
    const AUTH = readRepoFile('js/auth.js');
    const RULES = readRepoFile('firestore.rules');

    it('앱이 열릴 때 한 번 알린다', () => {
        // 조용히 넣으면 받은 줄도 모르고, 그 포인트는 돌아오게 만드는 힘을 갖지 못한다.
        expect(AUTH).toContain('announceComebackBonus(user, ud?.comebackBonusNotice);');
        expect(AUTH).toContain('복귀 보너스');
    });

    it('알린 뒤 표시를 지운다', () => {
        expect(AUTH).toContain("comebackBonusNotice: deleteField()");
    });

    it('그 삭제가 규칙에 막히지 않는다', () => {
        // 화이트리스트에 없으면 permission-denied 로 조용히 거부되고,
        // 같은 축하가 앱을 열 때마다 반복된다.
        expect(RULES).toContain("'comebackBonusNotice'");
    });
});

describe('메일 문구와 금액이 어긋나지 않는다', () => {
    const EMAIL = readRepoFile('functions/reengagement-email.js');

    it('메일이 적은 금액이 실제 지급액과 같다', () => {
        // 예전에는 '복귀 보너스' 라고만 적혀 있었고 그런 보상은 없었다.
        expect(EMAIL).toContain(`복귀 보너스 ${COMEBACK_BONUS_POINTS}P`);
        expect(EMAIL).toContain(`${COMEBACK_BONUS_POINTS}P comeback bonus`);
    });
});
