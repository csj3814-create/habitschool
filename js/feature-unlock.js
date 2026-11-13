/**
 * 단계별 기능 잠금과 해빛 배지 — 누구에게 무엇을 열어 둘지 정한다.
 *
 * 2026-11-07 대표 합의(tasks/2026-11-07_단계별_기능_잠금_설계.md). 새 회원은 식단·운동·마음
 * 기록에 집중하고, 나머지 기능은 자물쇠로 "있다" 는 것만 보인다. 기록이 쌓이면 자산 탭에서
 * 배지를 받아 연다. 첫 배지(건강 점수·소모임)는 무료다 — 건강 점수를 포인트로 파는 모양을
 * 피한다.
 *
 * 잠금이 회원에게서 아무것도 빼앗지 않게 하는 약속이 이 파일의 대부분이다.
 *   - 기존 회원(출시 전 가입 + 기록 1일 이상)은 잠그지 않는다.
 *   - 써 본 흔적이 있으면 그 기능은 열려 있다(미션·챌린지·건강 수치).
 *   - 건강 수치를 하나라도 넣었으면 점수가 바로 열린다. 소개 페이지가 건강검진 풀이를
 *     약속하고 있어서, 그걸 보고 온 회원이 사흘을 기다리면 안 된다.
 *   - 무엇이든 확실하지 않으면(설정·기록을 못 읽음) 연다.
 *
 * 의존성이 없는 순수 모듈이다(미션 흔적 판단만 mission-gate.js 에서 빌린다). 화면은 app-core.js 가
 * 그리고, 배지를 주는 것은 서버(functions/feature-badges.js)다. 단계 숫자는 서버와 같아야 한다 —
 * tests/feature-unlock.test.js 가 둘을 맞춰 본다.
 */
import { hasUsedWeeklyMissions } from './mission-gate.js?v=601';

export const FEATURE_BADGES = Object.freeze([
    Object.freeze({ id: 'first', days: 3, cost: 0, features: Object.freeze(['healthScore', 'habitGroup']) }),
    Object.freeze({ id: 'habit', days: 7, cost: 100, features: Object.freeze(['challenge']) }),
    Object.freeze({ id: 'haebit', days: 14, cost: 200, features: Object.freeze(['report30']) })
]);

export const LOCKABLE_FEATURES = Object.freeze(FEATURE_BADGES.flatMap((badge) => badge.features));

// 점수와 상관없는 칸. 이것만 있으면 "건강 수치를 넣었다" 고 보지 않는다.
const NON_MEASUREMENT_PROFILE_KEYS = new Set(['updatedAt', 'sex', 'meds', 'medOther', 'secondhandSmoke']);

function hasValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return value === true;
}

/** 회원 문서의 건강 프로필에 잰 값이 하나라도 있는가(혈액검사 결과도 여기로 들어온다). */
export function hasHealthProfileData(userData = {}) {
    const profile = userData?.healthProfile;
    if (!profile || typeof profile !== 'object') return false;
    return Object.entries(profile).some(([key, value]) => !NON_MEASUREMENT_PROFILE_KEYS.has(key) && hasValue(value));
}

/**
 * 계산된 두 점수에 잰 값이 들어갔는가. 식단·운동·수면은 기록에서 오므로 세지 않는다 —
 * 그것만으로 점수를 열면 기록 1일째 회원 모두에게 열린다.
 */
export function hasMeasuredScoreData(le8Data = null, metabolicData = null) {
    const factors = Object.values(le8Data?.factors || {});
    if (factors.some((item) => item && !item.missing)) return true;
    if (le8Data?.behaviors?.nicotine && !le8Data.behaviors.nicotine.missing) return true;
    const breakdown = metabolicData?.breakdown || {};
    return ['bodyFat', 'muscle', 'insulinResistance'].some((key) => breakdown[key] && !breakdown[key].missing);
}

/** 진행 중인 챌린지가 있는가. 있으면 챌린지 화면을 가리지 않는다. */
export function hasChallengeTrace(userData = {}) {
    const active = userData?.activeChallenges;
    if (active && typeof active === 'object' && Object.values(active).some(Boolean)) return true;
    return !!userData?.activeChallenge;
}

/**
 * 서버가 준 스위치(meta/featureUnlock)와 계정 만든 때로 이 회원의 설정을 만든다.
 * settings 가 없으면(읽지 못함) null — 모르면 잠그지 않는다.
 * 만든 때를 모르면 출시 전 회원으로 본다(기록이 있으면 열린다).
 */
export function resolveFeatureUnlockConfig(settings, accountCreatedMs) {
    if (!settings || typeof settings !== 'object') return null;
    const launchedMs = Date.parse(String(settings.launchedAt || ''));
    if (settings.enabled !== true || !Number.isFinite(launchedMs)) return { enabled: false, legacy: true };
    const created = Number(accountCreatedMs);
    return { enabled: true, legacy: !Number.isFinite(created) || created < launchedMs };
}

function allOpen() {
    return Object.fromEntries(LOCKABLE_FEATURES.map((feature) => [feature, true]));
}

/**
 * config         서버가 대시보드와 함께 준 { enabled, legacy }. 없으면 모른다는 뜻이다.
 * userData       회원 문서(featureBadges 는 서버만 쓴다)
 * recordedDays   대시보드가 최근 30개 기록으로 센 기록일. 못 읽었으면 null.
 * hasHealthData  건강 수치를 넣은 적이 있는가
 *
 * 돌려주는 것:
 *   active   이 회원에게 잠금이 하나라도 걸려 있는가
 *   open     기능별로 열려 있는가
 *   badges   배지별 상태(받음·받을 수 있음·남은 날)
 *   next     아직 열리지 않은 배지 중 가장 가까운 것
 */
export function decideFeatureAccess({ config = null, userData = {}, recordedDays = null, hasHealthData = false } = {}) {
    const ud = userData && typeof userData === 'object' ? userData : {};
    const days = Number.isFinite(Number(recordedDays)) && recordedDays !== null
        ? Math.max(0, Math.floor(Number(recordedDays)))
        : null;
    const owned = ud.featureBadges && typeof ud.featureBadges === 'object' ? ud.featureBadges : {};

    const unlockedAll = !config || config.enabled !== true || days === null || (config.legacy === true && days >= 1);
    const open = allOpen();
    if (!unlockedAll) {
        LOCKABLE_FEATURES.forEach((feature) => { open[feature] = false; });
        FEATURE_BADGES.forEach((badge) => {
            if (owned[badge.id]) badge.features.forEach((feature) => { open[feature] = true; });
        });
        if (hasHealthData || hasHealthProfileData(ud)) open.healthScore = true;
        if (hasUsedWeeklyMissions(ud)) open.weeklyMission = true;
        if (hasChallengeTrace(ud)) open.challenge = true;
    }

    const badges = FEATURE_BADGES.map((badge) => {
        const isOwned = !!owned[badge.id];
        const unlocked = isOwned || badge.features.every((feature) => open[feature]);
        const remainingDays = days === null ? 0 : Math.max(0, badge.days - days);
        return {
            id: badge.id,
            days: badge.days,
            cost: badge.cost,
            features: [...badge.features],
            owned: isOwned,
            unlocked,
            eligible: !unlocked && days !== null && remainingDays === 0,
            remainingDays
        };
    });

    const active = LOCKABLE_FEATURES.some((feature) => !open[feature]);
    return {
        active,
        recordedDays: days,
        open,
        badges,
        next: active ? (badges.find((badge) => !badge.unlocked) || null) : null
    };
}

/** html 에 걸어 둘 잠긴 기능 목록. CSS 가 `[data-locked-features~="report30"]` 로 가린다. */
export function lockedFeatureList(access = {}) {
    if (!access?.active) return '';
    return LOCKABLE_FEATURES.filter((feature) => !access.open?.[feature]).join(' ');
}
