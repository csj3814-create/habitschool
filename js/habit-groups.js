// 화면 글(이름·소개·태그)은 사전(habitGroup.*)에 있다(해외 3단계 E4-2). 읽을 때마다 화면 언어로 돌려준다.
import { getLocale, t } from './i18n.js?v=595';

export const HABIT_GROUP_TYPES = Object.freeze(['exercise']);
// 2026-11-08 대표: 한 번에 한 모임(두 모임이면 한 달 보상이 2,000P). 이미 두 모임인 회원은 그대로 보인다.
export const MAX_HABIT_GROUP_MEMBERSHIPS = 1;
export const EXERCISE_GROUP_ENTRY_FEE_POINTS = 200;
// 2026-11-08 대표 결정: 모든 소모임을 4주 안에 14번, 완주 1,000P 로 (예전 120일 안에 100번, 3,000P).
export const EXERCISE_GROUP_REWARD_TARGET = 14;
export const EXERCISE_GROUP_REWARD_POINTS = 1000;
export const EXERCISE_GROUP_REWARD_WINDOW_DAYS = 28;

const DEFAULT_GROUP_RULES = Object.freeze({
    entryFeePoints: EXERCISE_GROUP_ENTRY_FEE_POINTS,
    rewardTarget: EXERCISE_GROUP_REWARD_TARGET,
    rewardPoints: EXERCISE_GROUP_REWARD_POINTS,
    windowDays: EXERCISE_GROUP_REWARD_WINDOW_DAYS
});

export const RUNBICKERS_GROUP_ID = 'exercise-runbickers';

export const DEFAULT_HABIT_GROUPS = Object.freeze([
    {
        // 2026-11-07 대표 결정: 4주에 14번, 참가비 200P, 완주 1,000P. 달리기만 인정한다.
        // 인증은 서버가 기록을 보고 쓴다(functions/runtime.js syncRunningGroupCheckin).
        id: RUNBICKERS_GROUP_ID,
        type: 'exercise',
        emoji: '🏃',
        koreanOnly: true,
        linkSlug: 'runbickers',
        get title() { return t('habitGroup.runbickers.title'); },
        get description() { return t('habitGroup.runbickers.description'); },
        get tags() { return [t('habitGroup.runbickers.tag1'), t('habitGroup.runbickers.tag2')]; },
        requirement: Object.freeze({ kind: 'running', minKm: 1, maxPaceMinPerKm: 12 }),
        rules: Object.freeze({ entryFeePoints: 200, rewardTarget: 14, rewardPoints: 1000, windowDays: 28 }),
        memberCountEstimate: 30
    },
    {
        id: 'exercise-walking-10000',
        type: 'exercise',
        emoji: '🚶',
        get title() { return t('habitGroup.walking.title'); },
        get description() { return t('habitGroup.walking.description'); },
        get tags() { return [t('habitGroup.walking.tag1'), t('habitGroup.walking.tag2')]; },
        requirement: Object.freeze({ kind: 'steps', minSteps: 10000 }),
        memberCountEstimate: 22
    },
    {
        id: 'exercise-home-training',
        type: 'exercise',
        emoji: '🏠',
        get title() { return t('habitGroup.homeTraining.title'); },
        get description() { return t('habitGroup.homeTraining.description'); },
        get tags() { return [t('habitGroup.homeTraining.tag1'), t('habitGroup.homeTraining.tag2')]; },
        requirement: Object.freeze({ kind: 'exercise_record' }),
        memberCountEstimate: 16
    },
    {
        id: 'exercise-gym-checkin',
        type: 'exercise',
        emoji: '🏋️',
        get title() { return t('habitGroup.gym.title'); },
        get description() { return t('habitGroup.gym.description'); },
        get tags() { return [t('habitGroup.gym.tag1'), t('habitGroup.gym.tag2')]; },
        requirement: Object.freeze({ kind: 'exercise_record' }),
        memberCountEstimate: 12
    },
    {
        id: 'exercise-running-club',
        type: 'exercise',
        emoji: '🏃',
        get title() { return t('habitGroup.running.title'); },
        get description() { return t('habitGroup.running.description'); },
        get tags() { return [t('habitGroup.running.tag1'), t('habitGroup.running.tag2')]; },
        requirement: Object.freeze({ kind: 'exercise_record' }),
        memberCountEstimate: 14
    }
]);

export function listHabitGroups(type = 'all') {
    const normalizedType = String(type || 'all').trim();
    if (normalizedType === 'all') return [...DEFAULT_HABIT_GROUPS];
    return DEFAULT_HABIT_GROUPS.filter(group => group.type === normalizedType);
}

export function getHabitGroupById(groupId = '') {
    const normalizedId = String(groupId || '').trim();
    return DEFAULT_HABIT_GROUPS.find(group => group.id === normalizedId) || null;
}

/** 지금 화면 언어로 보여 줄 모임. 한국어 커뮤니티 모임은 영어 앱 목록에 넣지 않는다. */
export function getVisibleHabitGroups() {
    const isKorean = getLocale() === 'ko';
    return DEFAULT_HABIT_GROUPS.filter(group => isKorean || !group.koreanOnly);
}

export function getHabitGroupRules(groupOrId = '') {
    const group = typeof groupOrId === 'object' ? groupOrId : getHabitGroupById(groupOrId);
    return { ...DEFAULT_GROUP_RULES, ...(group?.rules || {}) };
}

/** 소모임 링크(?group=runbickers)의 이름을 모임으로 바꾼다. 모르는 이름이면 null. */
export function getHabitGroupByLinkSlug(slug = '') {
    const normalized = String(slug || '').trim().toLowerCase();
    if (!normalized) return null;
    return DEFAULT_HABIT_GROUPS.find(group => group.linkSlug === normalized) || null;
}

export function getHabitGroupMemberDocId(groupId = '', uid = '') {
    return `${String(groupId || '').trim()}_${String(uid || '').trim()}`;
}

export function getHabitGroupCheckinDocId(groupId = '', dateStr = '', uid = '') {
    return `${String(groupId || '').trim()}_${String(dateStr || '').trim()}_${String(uid || '').trim()}`;
}

export function getHabitGroupRewardProgressDocId(groupId = '', uid = '') {
    return getHabitGroupMemberDocId(groupId, uid);
}

export function getHabitGroupTypeLabel(type = '') {
    return String(type || '').trim() === 'exercise' ? t('habitGroup.type.exercise') : t('habitGroup.type.group');
}

export function getHabitGroupRecordTab() {
    return 'exercise';
}

function hasPositiveNumber(value) {
    return (Number(value) || 0) > 0;
}

function hasAnyString(...values) {
    return values.some(value => String(value || '').trim().length > 0);
}

function hasAnyExerciseItem(items = [], mediaKeys = []) {
    return Array.isArray(items) && items.some(item => {
        if (!item || typeof item !== 'object') return false;
        if (mediaKeys.some(key => hasAnyString(item[key]))) return true;
        return hasAnyString(item.mediaId, item.type, item.memo, item.name);
    });
}

export function getStepCount(dailyLog = {}) {
    const steps = dailyLog.steps || {};
    return Number(steps.count || steps.steps || steps.active_steps || 0) || 0;
}

export function hasStepGoalRecord(dailyLog = {}, minSteps = 10000) {
    return getStepCount(dailyLog) >= minSteps;
}

export function hasExerciseRecord(dailyLog = {}) {
    const exercise = dailyLog.exercise || {};
    return hasAnyExerciseItem(exercise.cardioList, ['imageUrl', 'imageThumbUrl'])
        || hasAnyExerciseItem(exercise.strengthList, ['videoUrl', 'videoThumbUrl', 'imageUrl'])
        || hasAnyString(
            exercise.cardioImageUrl,
            exercise.cardioImageThumbUrl,
            exercise.strengthVideoUrl,
            exercise.strengthVideoThumbUrl,
            exercise.cardioTime,
            exercise.cardioDist,
            exercise.memo
        )
        || hasPositiveNumber(exercise.cardioTime)
        || hasPositiveNumber(exercise.cardioDist);
}

export function hasAnyHabitGroupExerciseRecord(dailyLog = {}) {
    return hasStepGoalRecord(dailyLog, 10000) || hasExerciseRecord(dailyLog);
}

const RUNNING_TYPE_PATTERN = /달리|러닝|런닝|조깅|마라톤|트레드밀|running|run\b|jog|treadmill|marathon/i;
const MIN_READABLE_PACE = 2.5;
const RUNNING_REASON_ORDER = ['no_record', 'no_analysis', 'not_running', 'unread', 'short', 'slow'];

// functions/running-group.js 와 같은 판정이다. 인증은 서버가 정하고, 여기 답은 저장 직후 안내에만 쓴다.
export function evaluateRunningRecord(exercise = {}, requirement = {}) {
    const items = Array.isArray(exercise?.cardioList) ? exercise.cardioList : [];
    const minKm = Number(requirement.minKm) || 1;
    const maxPace = Number(requirement.maxPaceMinPerKm) || 12;
    let reason = 'no_record';
    const raise = (next) => {
        if (RUNNING_REASON_ORDER.indexOf(next) > RUNNING_REASON_ORDER.indexOf(reason)) reason = next;
    };

    for (const item of items) {
        const analysis = item?.aiAnalysis;
        if (!analysis || !(item.imageUrl || item.imageThumbUrl)) {
            raise('no_analysis');
            continue;
        }
        if (!RUNNING_TYPE_PATTERN.test(String(analysis.exerciseType || ''))) {
            raise('not_running');
            continue;
        }
        const distanceKm = Number(analysis.distanceKm);
        const durationMinutes = Number(analysis.durationMinutes ?? item.durationMinutes);
        if (!(distanceKm > 0) || !(durationMinutes > 0)) {
            raise('unread');
            continue;
        }
        const pace = durationMinutes / distanceKm;
        if (pace < MIN_READABLE_PACE) {
            raise('unread');
            continue;
        }
        if (distanceKm < minKm) {
            raise('short');
            continue;
        }
        if (pace > maxPace) {
            raise('slow');
            continue;
        }
        return {
            qualified: true,
            reason: '',
            distanceKm,
            durationMinutes,
            paceMinPerKm: Math.round(pace * 100) / 100,
            imageThumbUrl: item.imageThumbUrl || item.imageUrl || ''
        };
    }
    return { qualified: false, reason };
}

export function getHabitGroupRecordStatus(groupOrType = '', dailyLog = {}) {
    const group = typeof groupOrType === 'object' ? groupOrType : getHabitGroupById(groupOrType);
    const type = group?.type || (String(groupOrType || '').trim() === 'exercise' ? 'exercise' : '');
    if (type !== 'exercise') {
        return { type, complete: false, source: '', recordTab: 'exercise' };
    }

    if (group?.requirement?.kind === 'running') {
        const evaluation = evaluateRunningRecord(dailyLog.exercise, group.requirement);
        return {
            type: 'exercise',
            complete: evaluation.qualified,
            source: 'running',
            recordTab: 'exercise',
            reason: evaluation.reason
        };
    }

    if (group?.requirement?.kind === 'steps') {
        const minSteps = Number(group.requirement.minSteps || 10000) || 10000;
        return {
            type: 'exercise',
            complete: hasStepGoalRecord(dailyLog, minSteps),
            source: 'steps',
            recordTab: 'exercise',
            stepCount: getStepCount(dailyLog),
            minSteps
        };
    }

    return {
        type: 'exercise',
        complete: group ? hasExerciseRecord(dailyLog) : hasAnyHabitGroupExerciseRecord(dailyLog),
        source: 'exercise',
        recordTab: 'exercise'
    };
}

export function getRecommendedHabitGroups(dailyLog = {}, joinedGroupIds = []) {
    const joinedSet = new Set((joinedGroupIds || []).map(id => String(id || '').trim()).filter(Boolean));
    return getVisibleHabitGroups()
        .filter(group => !joinedSet.has(group.id))
        .sort((a, b) => {
            const memberDiff = (Number(b.memberCountEstimate) || 0) - (Number(a.memberCountEstimate) || 0);
            if (memberDiff) return memberDiff;
            return DEFAULT_HABIT_GROUPS.indexOf(a) - DEFAULT_HABIT_GROUPS.indexOf(b);
        });
}

function normalizeDateArray(values = []) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map(value => String(value || '').trim())
        .filter(Boolean))]
        .sort();
}

/** "2026-09-14" 두 개 사이의 날짜 수. 끝나는 날을 포함해 센다. */
function countDaysInclusive(fromDateStr = '', toDateStr = '') {
    const from = Date.parse(`${String(fromDateStr).trim()}T00:00:00+09:00`);
    const to = Date.parse(`${String(toDateStr).trim()}T00:00:00+09:00`);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    return Math.round((to - from) / 86400000) + 1;
}

// 이 바퀴가 끝났는가 — 기간이 지났거나 보상을 받았다. 서버의 isHabitGroupRoundOver 와 같은 규칙.
// 2026-10-03 제보: "소모임 기간 종료가 지났는데 계속 떠있네? 마무리하고 결과 알려주고
// 리워드 확인하는 절차, 새로 소모임을 시작하는 절차가 필요하겠어."
export function isHabitGroupRoundOver(progressSummary = {}) {
    return !!(progressSummary.windowExpired || progressSummary.rewardStatus === 'paid');
}

export function summarizeHabitGroupProgress(progress = {}, todayStr = '') {
    const rules = getHabitGroupRules(progress.groupId);
    const submittedDates = normalizeDateArray(progress.submittedDates);
    const approvedDates = normalizeDateArray(progress.approvedDates);
    const pendingDates = normalizeDateArray(progress.pendingDates);
    const rejectedDates = normalizeDateArray(progress.rejectedDates);
    const submittedCount = Array.isArray(progress.submittedDates) ? submittedDates.length : Number(progress.submittedCount || 0) || 0;
    const approvedCount = Array.isArray(progress.approvedDates) ? approvedDates.length : Number(progress.approvedCount || 0) || 0;
    const pendingCount = Array.isArray(progress.pendingDates) ? pendingDates.length : Number(progress.pendingCount || 0) || 0;
    const remainingCount = Math.max(0, rules.rewardTarget - submittedCount);

    // 14번은 아무 때나 채우면 되는 것이 아니라 4주(28일) 창 안에서 채워야 한다.
    // 화면이 그 창을 말해 주지 않으면, 남은 날을 알 방법이 없다.
    const startedDate = String(progress.startedDate || '').trim();
    const windowEndDate = String(progress.windowEndDate || '').trim();
    const daysLeft = (windowEndDate && todayStr)
        ? countDaysInclusive(todayStr, windowEndDate)
        : null;

    return {
        startedDate,
        windowEndDate,
        windowDaysLeft: Number.isFinite(daysLeft) ? Math.max(0, daysLeft) : null,
        windowExpired: Number.isFinite(daysLeft) ? daysLeft <= 0 : false,
        submittedDates,
        approvedDates,
        pendingDates,
        rejectedDates,
        submittedCount,
        approvedCount,
        pendingCount,
        rejectedCount: Array.isArray(progress.rejectedDates) ? rejectedDates.length : Number(progress.rejectedCount || 0) || 0,
        remainingCount,
        rewardStatus: progress.rewardStatus || 'in_progress',
        rewardPoints: Number(progress.rewardPoints || rules.rewardPoints) || rules.rewardPoints,
        entryFeePoints: Number(progress.entryFeePoints || rules.entryFeePoints) || rules.entryFeePoints,
        target: rules.rewardTarget,
        complete: submittedCount >= rules.rewardTarget
    };
}

function shouldCountCheckinForProgress(checkin = null) {
    if (!checkin || typeof checkin !== 'object') return false;
    const status = String(checkin.reviewStatus || 'pending').trim();
    return !!checkin.date
        && checkin.countsTowardReward !== false
        && (status === 'pending' || status === 'approved');
}

export function applyHabitGroupProgressChange(progress = {}, previousCheckin = null, nextCheckin = null) {
    const next = {
        ...progress,
        submittedDates: normalizeDateArray(progress.submittedDates),
        approvedDates: normalizeDateArray(progress.approvedDates),
        pendingDates: normalizeDateArray(progress.pendingDates),
        rejectedDates: normalizeDateArray(progress.rejectedDates)
    };

    const removeDate = (key, date) => {
        if (!date) return;
        next[key] = normalizeDateArray(next[key]).filter(item => item !== date);
    };
    const addDate = (key, date) => {
        if (!date) return;
        next[key] = normalizeDateArray([...normalizeDateArray(next[key]), date]);
    };
    const removeCheckin = (checkin) => {
        if (!checkin?.date) return;
        removeDate('submittedDates', checkin.date);
        removeDate('pendingDates', checkin.date);
        removeDate('approvedDates', checkin.date);
        removeDate('rejectedDates', checkin.date);
    };
    const addCheckin = (checkin) => {
        if (!checkin?.date) return;
        const status = String(checkin.reviewStatus || 'pending').trim();
        if (shouldCountCheckinForProgress(checkin)) {
            addDate('submittedDates', checkin.date);
            if (status === 'approved') addDate('approvedDates', checkin.date);
            else addDate('pendingDates', checkin.date);
            return;
        }
        if (status === 'rejected') addDate('rejectedDates', checkin.date);
    };

    removeCheckin(previousCheckin);
    addCheckin(nextCheckin);

    const summary = summarizeHabitGroupProgress(next);
    return {
        ...next,
        submittedDates: summary.submittedDates,
        approvedDates: summary.approvedDates,
        pendingDates: summary.pendingDates,
        rejectedDates: summary.rejectedDates,
        submittedCount: summary.submittedCount,
        approvedCount: summary.approvedCount,
        pendingCount: summary.pendingCount,
        rejectedCount: summary.rejectedCount,
        rewardStatus: next.rewardStatus === 'paid'
            ? 'paid'
            : summary.submittedCount >= summary.target
            ? 'pending_review'
            : 'in_progress'
    };
}

export function summarizeHabitGroups({ groups = DEFAULT_HABIT_GROUPS, memberships = [], checkins = [] } = {}) {
    const activeMemberships = memberships.filter(item => item?.active !== false);
    const joinedGroupIds = new Set(activeMemberships.map(item => item.groupId).filter(Boolean));
    const checkedGroupIds = new Set(checkins
        .filter(item => String(item?.reviewStatus || 'pending') !== 'rejected')
        .map(item => item.groupId)
        .filter(Boolean));
    const joinedGroups = groups.filter(group => joinedGroupIds.has(group.id));

    return {
        joinedCount: joinedGroups.length,
        checkedInCount: joinedGroups.filter(group => checkedGroupIds.has(group.id)).length,
        recommendedCount: groups.filter(group => !joinedGroupIds.has(group.id)).length,
        joinedGroupIds,
        checkedGroupIds
    };
}
