// 안드로이드 웹 회원에게 걸음수·수면 자리에서 해빛스쿨 안드로이드 앱의 쓰임을 알리는 카드를 고른다.
//
// 2026-11-02 대표: "헬스커넥트 연동도 HBT 만큼이나 꽤 큰 기능이어서 포기하기 아까운데",
// "플레이 앱도 엄연히 본 앱인데 PWA 사용자에서는 도우미 역할을 하는 것이지, 아예 도우미 앱이라고 부르는 것은 맞지 않는듯 해."
// 안드로이드 앱은 열 때마다 Health Connect 의 걸음수·수면·운동을 그날 기록에 자동 저장한다(health-connect-autosave.js).
// 같은 계정이라 웹 앱에서도 그대로 보인다. 설계: tasks/2026-11-02_건강데이터_도우미앱_설계.md

export const HEALTH_HELPER_DISMISS_DAYS = 30;
// 이보다 오래된 Health Connect 걸음수는 새로 받으라고 한다(옛 "앱에서 최신 걸음수 가져오기", 2026-10-02 제보).
export const HEALTH_HELPER_STALE_MS = 30 * 60 * 1000;

/**
 * @returns {'get'|'open'|'refresh'|null}
 *   get     — 안드로이드 앱이 없다(또는 모른다): Google Play 에서 받기
 *   open    — 깔려 있다: 열면 오늘 걸음수·수면이 저장된다
 *   refresh — 오늘 걸음수가 Health Connect 에서 왔지만 30분 넘게 묵었다: 열어서 새로 받기
 *   null    — 그리지 않는다
 */
export function resolveHealthHelperCard({
    platform = '', inPlayApp = false, isToday = false, stepSource = '', syncedAt = 0,
    now = Date.now(), appInstalled = null, dismissedAt = 0,
} = {}) {
    if (inPlayApp || platform !== 'android' || !isToday) return null;
    if (stepSource === 'health_connect') {
        // 이미 안드로이드 앱으로 받고 있는 사람이다. 묵었을 때만 새로 받으라고 한다(닫아 둔 것과 무관).
        return syncedAt > 0 && now - syncedAt >= HEALTH_HELPER_STALE_MS ? 'refresh' : null;
    }
    const dismissedFor = now - (Number(dismissedAt) || 0);
    if (dismissedAt && dismissedFor >= 0 && dismissedFor < HEALTH_HELPER_DISMISS_DAYS * 24 * 60 * 60 * 1000) return null;
    return appInstalled === true ? 'open' : 'get';
}
