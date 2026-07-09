// 일일 인증 포인트 정산 헬퍼
//
// 클라이언트가 daily_logs.awardedPoints를 직접 계산·기록하고, awardPoints 트리거가
// 그 차액만큼 users.coins를 증액한다. coins는 실물 쿠폰으로 교환되므로, 조작된 값을
// 서버가 신뢰하면 코인 무한 발행이 가능하다(경제 붕괴). 이 헬퍼는 카테고리별 정상
// 상한으로 클램프해 신뢰 가능한 합계만 산출한다. 클라이언트 계산 상한과 동일:
//   diet ≤ 30, exercise ≤ 30, mind ≤ 20 (하루 최대 80P)
const DAILY_POINT_CAPS = Object.freeze({
    dietPoints: 30,
    exercisePoints: 30,
    mindPoints: 20,
});

function clampField(value, cap) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(n, cap);
}

// awardedPoints 맵을 받아 상한으로 클램프한 총점을 반환한다.
function clampDailyAwardTotal(awarded = {}) {
    return clampField(awarded.dietPoints, DAILY_POINT_CAPS.dietPoints)
        + clampField(awarded.exercisePoints, DAILY_POINT_CAPS.exercisePoints)
        + clampField(awarded.mindPoints, DAILY_POINT_CAPS.mindPoints);
}

// 리액션 토글 결정(순수 함수). 실제 저장(coins increment 등)은 호출자가 트랜잭션에서
// 수행한다. uid는 반드시 서버가 검증한 request.auth.uid여야 한다(위조 불가). 정책:
//   - 이미 리액션함 → 취소(표시 배열에서 제거, 포인트 회수 없음, award=false)
//   - 처음 리액션 → 추가, 본인 게시물이 아니고 (post,reactor) 최초일 때만 award=true
function computeReactionToggle(logData, uid, reactionType) {
    const src = (logData && typeof logData.reactions === 'object' && logData.reactions) ? logData.reactions : {};
    const reactions = { ...src };
    const list = Array.isArray(reactions[reactionType]) ? [...reactions[reactionType]] : [];
    const postOwnerId = logData && logData.userId ? logData.userId : null;

    if (list.includes(uid)) {
        reactions[reactionType] = list.filter((u) => u !== uid);
        return { active: false, award: false, reactions, postOwnerId, count: reactions[reactionType].length };
    }

    list.push(uid);
    reactions[reactionType] = list;
    const rewardedUserIds = Array.isArray(logData && logData.reactionPointAwardedUserIds)
        ? logData.reactionPointAwardedUserIds
        : [];
    const award = !!postOwnerId && postOwnerId !== uid && !rewardedUserIds.includes(uid);
    return { active: true, award, reactions, postOwnerId, count: reactions[reactionType].length };
}

module.exports = {
    DAILY_POINT_CAPS,
    clampDailyAwardTotal,
    computeReactionToggle,
};
