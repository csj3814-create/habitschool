import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readRepoFile } from './source-helpers.js';

const require = createRequire(import.meta.url);
const {
    countRecordedDays,
    planReferralRecordRewards,
    REFERRAL_INVITER_CATEGORIES,
} = require('../functions/referral-rewards.js');

// 2026-11-03 대표: "200 먼저 주고 하루 기록할때마다 100씩 더 주면? 총 3일간 500" → "A: 첫 기록 때".
// 예전에는 친구가 3일 연속을 채워야 초대한 사람이 500P 를 받았다. 지금까지 32명이 초대로 왔고,
// 그 보상이 나간 것은 3번이다. 설계: tasks/2026-11-03_친구초대_설계.md

const RUNTIME = readRepoFile('functions/runtime.js');
const CORE = readRepoFile('js/app-core.js');
const HTML = readRepoFile('index.html');

function fnBody(source, signature) {
    const start = source.indexOf(signature);
    expect(start, signature).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf('\n}\n', start));
}

const day = (date, points) => ({ date, awardedPoints: { dietPoints: points, exercisePoints: 0, mindPoints: 0 } });

describe('초대한 사람의 보상 — 첫 기록 200P, 기록한 날마다 100P, 3일까지 500P', () => {
    it('첫 기록 날은 300P, 둘째 날 400P, 셋째 날 500P 에서 멈춘다', () => {
        const total = (n) => planReferralRecordRewards(n).reduce((sum, step) => sum + step.points, 0);
        expect(planReferralRecordRewards(0)).toEqual([]);
        expect(total(1)).toBe(300);
        expect(total(2)).toBe(400);
        expect(total(3)).toBe(500);
        expect(total(7)).toBe(500);
    });

    it('단계마다 원장 한 줄 — 같은 단계는 두 번 나가지 않는다', () => {
        expect(planReferralRecordRewards(3).map((step) => step.id)).toEqual([
            'referral_first', 'referral_record_day1', 'referral_record_day2', 'referral_record_day3',
        ]);
        expect(REFERRAL_INVITER_CATEGORIES).toEqual(expect.arrayContaining([
            'referral_day3', 'referral_first', 'referral_record_day1', 'referral_record_day2', 'referral_record_day3',
        ]));
    });

    it('"기록한 날" 은 포인트를 받은 날이다 — 연속이 아니어도, 같은 날은 한 번', () => {
        expect(countRecordedDays([day('2026-11-01', 10), day('2026-11-04', 5)])).toBe(2);
        expect(countRecordedDays([day('2026-11-01', 0), day('2026-11-02', 10)])).toBe(1);
        expect(countRecordedDays([day('2026-11-01', 10), day('2026-11-01', 10)])).toBe(1);
        expect(countRecordedDays([])).toBe(0);
    });
});

describe('서버 정산', () => {
    const check = fnBody(RUNTIME, 'async function checkReferralRecordRewards(');

    it('기록에 포인트가 나갈 때마다 확인한다', () => {
        const award = RUNTIME.slice(RUNTIME.indexOf('exports.awardPoints'), RUNTIME.indexOf('/** Private daily log'));
        expect(award).toContain('await checkReferralRecordRewards(userId, after.userName);');
    });

    it('예전 3일 연속 보상을 받은 친구, 다 받은 친구는 건너뛴다', () => {
        expect(check).toContain('participant.referralDay3BonusGiven === true');
        expect(check).toContain('participant.referralRecordRewardsDone === true');
    });

    it('원장에 단계마다 한 줄을 만들고, 초대한 사람 포인트를 올린다', () => {
        expect(check).toContain('collection("entries").doc(`${step.id}_${userId}`)');
        expect(check).toContain('coins: FieldValue.increment(');
        expect(check).toContain('referralRecordDays');
    });

    it('초대한 사람에게 친구 소식을 남긴다', () => {
        expect(check).toContain("type: 'referral_progress'");
        expect(check).toContain('postOwnerId: result.referrerUid');
    });

    it('3일 연속 +500P 는 더 주지 않는다 — 친구 7일 +300P 만 남는다', () => {
        const milestone = fnBody(RUNTIME, 'async function checkReferralMilestone(');
        expect(milestone).toContain('if (streak !== 7) return;');
        expect(milestone).not.toContain('500');
    });

    it('초대 현황은 새 원장까지 더하고, 친구 목록을 돌려준다', () => {
        const status = RUNTIME.slice(RUNTIME.indexOf('exports.getMyInviteStatus'), RUNTIME.indexOf('// ===== 공유 카드 링크 미리보기'));
        expect(status).toContain('REFERRAL_INVITER_CATEGORIES');
        expect(status).toContain('friends');
        expect(status).toContain('referralRecordDays');
    });
});

describe('화면', () => {
    it('프로필의 보상 안내가 새 규칙을 말한다', () => {
        expect(HTML).toContain('친구가 첫 기록하면 <strong>나에게 +300P</strong>');
        expect(HTML).not.toContain('친구 3일 연속 기록 시 <strong>나에게 +500P</strong>');
    });

    it('초대한 친구 목록을 그린다', () => {
        expect(HTML).toContain('id="invite-status-friends"');
        expect(fnBody(CORE, 'function renderInviteStatus(')).toContain("getElementById('invite-status-friends')");
    });

    it('친구 소식을 앱을 열 때 한 번 알린다', () => {
        const fn = fnBody(CORE, 'async function checkReferralProgressNotifications(');
        expect(fn).toContain("where('type', '==', 'referral_progress')");
        expect(CORE).toContain('checkReferralProgressNotifications(user.uid)');
    });

    it('연속 기록 보상을 받은 순간에 초대를 권한다 — 평점 요청이 뜬 때는 다음으로 미룬다', () => {
        const claim = CORE.slice(CORE.indexOf('window.claimMilestoneBonus = async function'), CORE.indexOf('window.claimMilestoneBonus = async function') + 2500);
        expect(claim).toContain('const reviewPrompt = maybePromptPlayReview(');
        expect(claim).toContain('if (!reviewPrompt) maybeOfferInviteAfterStreakReward(');
        expect(HTML).toContain('id="invite-after-reward"');
    });
});
