// 친구를 초대한 사람이 받는 보상 — 친구가 기록할 때마다 조금씩.
//
// 2026-11-03 대표: "200 먼저 주고 하루 기록할때마다 100씩 더 주면? 총 3일간 500" → "A: 첫 기록 때".
// 예전에는 친구가 3일 연속을 채워야 500P 를 한 번에 받았다. 초대로 온 32명 중 그 보상이 나간 것은 3번이다.
// 설계: tasks/2026-11-03_친구초대_설계.md

const REFERRAL_FIRST_RECORD_POINTS = 200;
const REFERRAL_RECORD_DAY_POINTS = 100;
const REFERRAL_RECORD_DAYS = 3;

// 초대한 사람의 보너스 원장 분류. 초대 현황(getMyInviteStatus)이 받은 포인트를 더할 때 쓴다.
// referral_day3 는 예전 규칙(3일 연속 +500P)으로 이미 나간 몫이다.
const REFERRAL_INVITER_CATEGORIES = Object.freeze([
    "referral_day3",
    "referral_first",
    ...Array.from({ length: REFERRAL_RECORD_DAYS }, (_, index) => `referral_record_day${index + 1}`),
]);

/** 포인트를 받은 날의 수. 연속이 아니어도 되고, 같은 날은 한 번만 센다. */
function countRecordedDays(logs = []) {
    const days = new Set();
    (Array.isArray(logs) ? logs : []).forEach((log) => {
        const awarded = log?.awardedPoints || {};
        const total = (Number(awarded.dietPoints) || 0)
            + (Number(awarded.exercisePoints) || 0)
            + (Number(awarded.mindPoints) || 0);
        if (total > 0 && log?.date) days.add(String(log.date));
    });
    return days.size;
}

/**
 * 친구가 기록한 날 수까지 초대한 사람이 받았어야 할 단계들.
 * 1일: 첫 기록 200P + 그날 100P, 2일·3일: 100P 씩 — 3일에서 멈춘다(총 500P).
 * 단계마다 원장 한 줄이라, 이미 받은 단계는 다시 나가지 않는다.
 */
function planReferralRecordRewards(recordedDays = 0) {
    const days = Math.min(REFERRAL_RECORD_DAYS, Math.max(0, Math.floor(Number(recordedDays) || 0)));
    if (days === 0) return [];
    return [
        { id: "referral_first", points: REFERRAL_FIRST_RECORD_POINTS },
        ...Array.from({ length: days }, (_, index) => ({
            id: `referral_record_day${index + 1}`,
            points: REFERRAL_RECORD_DAY_POINTS,
        })),
    ];
}

module.exports = {
    REFERRAL_FIRST_RECORD_POINTS,
    REFERRAL_RECORD_DAY_POINTS,
    REFERRAL_RECORD_DAYS,
    REFERRAL_INVITER_CATEGORIES,
    countRecordedDays,
    planReferralRecordRewards,
};
