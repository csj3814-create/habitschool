export const HABIT_GROUP_TYPES = Object.freeze(['exercise']);
export const MAX_HABIT_GROUP_MEMBERSHIPS = 2;
export const EXERCISE_GROUP_ENTRY_FEE_POINTS = 200;
export const EXERCISE_GROUP_REWARD_TARGET = 100;
export const EXERCISE_GROUP_REWARD_POINTS = 3000;
export const EXERCISE_GROUP_REWARD_WINDOW_DAYS = 120;

export const DEFAULT_HABIT_GROUPS = Object.freeze([
    {
        id: 'exercise-walking-10000',
        type: 'exercise',
        emoji: '🚶',
        title: '만보 걷기',
        description: '하루 10,000보를 같이 채우는 걷기 소모임이에요.',
        tags: ['만보', '걷기'],
        requirement: Object.freeze({ kind: 'steps', minSteps: 10000 }),
        memberCountEstimate: 22
    },
    {
        id: 'exercise-home-training',
        type: 'exercise',
        emoji: '🏠',
        title: '홈트 인증방',
        description: '집에서 한 운동을 사진이나 영상으로 가볍게 인증해요.',
        tags: ['홈트', '근력'],
        requirement: Object.freeze({ kind: 'exercise_record' }),
        memberCountEstimate: 16
    },
    {
        id: 'exercise-gym-checkin',
        type: 'exercise',
        emoji: '🏋️',
        title: '헬스장 출석',
        description: '헬스장 운동 루틴과 출석 흐름을 같이 이어가요.',
        tags: ['헬스장', '근력'],
        requirement: Object.freeze({ kind: 'exercise_record' }),
        memberCountEstimate: 12
    },
    {
        id: 'exercise-running-club',
        type: 'exercise',
        emoji: '🏃',
        title: '러닝 클럽',
        description: '러닝과 유산소 운동 기록을 함께 쌓아가요.',
        tags: ['러닝', '유산소'],
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
    return String(type || '').trim() === 'exercise' ? '운동' : '소모임';
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

export function getHabitGroupRecordStatus(groupOrType = '', dailyLog = {}) {
    const group = typeof groupOrType === 'object' ? groupOrType : getHabitGroupById(groupOrType);
    const type = group?.type || (String(groupOrType || '').trim() === 'exercise' ? 'exercise' : '');
    if (type !== 'exercise') {
        return { type, complete: false, source: '', recordTab: 'exercise' };
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
    return DEFAULT_HABIT_GROUPS
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

export function summarizeHabitGroupProgress(progress = {}) {
    const submittedDates = normalizeDateArray(progress.submittedDates);
    const approvedDates = normalizeDateArray(progress.approvedDates);
    const pendingDates = normalizeDateArray(progress.pendingDates);
    const rejectedDates = normalizeDateArray(progress.rejectedDates);
    const submittedCount = Array.isArray(progress.submittedDates) ? submittedDates.length : Number(progress.submittedCount || 0) || 0;
    const approvedCount = Array.isArray(progress.approvedDates) ? approvedDates.length : Number(progress.approvedCount || 0) || 0;
    const pendingCount = Array.isArray(progress.pendingDates) ? pendingDates.length : Number(progress.pendingCount || 0) || 0;
    const remainingCount = Math.max(0, EXERCISE_GROUP_REWARD_TARGET - submittedCount);

    return {
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
        rewardPoints: Number(progress.rewardPoints || EXERCISE_GROUP_REWARD_POINTS) || EXERCISE_GROUP_REWARD_POINTS,
        entryFeePoints: Number(progress.entryFeePoints || EXERCISE_GROUP_ENTRY_FEE_POINTS) || EXERCISE_GROUP_ENTRY_FEE_POINTS,
        complete: submittedCount >= EXERCISE_GROUP_REWARD_TARGET
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
            : summary.submittedCount >= EXERCISE_GROUP_REWARD_TARGET
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
