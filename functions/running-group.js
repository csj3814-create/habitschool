// 달리기 모임의 인증 판정. 러닝 앱 캡처에서 AI 가 읽은 거리·시간으로 가른다.
//
// 2026-11-07 대표: "러닝 기준은 12분/km 이내인 경우로 한정해서 1km 이상 뛴 경우 성공으로 하자."
// 앱(js/habit-groups.js)에도 같은 함수가 있다. 앱 쪽은 저장 직후 안내에만 쓰고, 인증은 서버가 정한다.
// 둘이 같은 답을 내는지는 tests/running-group.test.js 가 본다.

const RUNNING_TYPE_PATTERN = /달리|러닝|런닝|조깅|마라톤|트레드밀|running|run\b|jog|treadmill|marathon/i;

// 사람이 낼 수 없는 빠르기는 숫자를 잘못 읽은 것이다(세계 기록이 약 2분 35초/km).
const MIN_READABLE_PACE = 2.5;

const REASON_ORDER = ["no_record", "no_analysis", "not_running", "unread", "short", "slow"];

function strongerReason(current, next) {
    return REASON_ORDER.indexOf(next) > REASON_ORDER.indexOf(current) ? next : current;
}

/**
 * 이 날의 운동 칸에 인증이 되는 달리기가 있는가. 한 번의 달리기가 기준을 넘어야 한다.
 * 여러 기록을 더하지 않는다 — 300m 를 네 번 올린 것은 1km 달리기가 아니다.
 */
function evaluateRunningRecord(exercise = {}, requirement = {}) {
    const items = Array.isArray(exercise?.cardioList) ? exercise.cardioList : [];
    const minKm = Number(requirement.minKm) || 1;
    const maxPace = Number(requirement.maxPaceMinPerKm) || 12;
    let reason = "no_record";

    for (const item of items) {
        const analysis = item?.aiAnalysis;
        if (!analysis || !(item.imageUrl || item.imageThumbUrl)) {
            reason = strongerReason(reason, "no_analysis");
            continue;
        }
        if (!RUNNING_TYPE_PATTERN.test(String(analysis.exerciseType || ""))) {
            reason = strongerReason(reason, "not_running");
            continue;
        }
        const distanceKm = Number(analysis.distanceKm);
        const durationMinutes = Number(analysis.durationMinutes ?? item.durationMinutes);
        if (!(distanceKm > 0) || !(durationMinutes > 0)) {
            reason = strongerReason(reason, "unread");
            continue;
        }
        const pace = durationMinutes / distanceKm;
        if (pace < MIN_READABLE_PACE) {
            reason = strongerReason(reason, "unread");
            continue;
        }
        if (distanceKm < minKm) {
            reason = strongerReason(reason, "short");
            continue;
        }
        if (pace > maxPace) {
            reason = strongerReason(reason, "slow");
            continue;
        }
        return {
            qualified: true,
            reason: "",
            distanceKm,
            durationMinutes,
            paceMinPerKm: Math.round(pace * 100) / 100,
            imageThumbUrl: item.imageThumbUrl || item.imageUrl || "",
        };
    }
    return { qualified: false, reason };
}

module.exports = { evaluateRunningRecord };
