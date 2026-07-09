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

module.exports = {
    DAILY_POINT_CAPS,
    clampDailyAwardTotal,
};
