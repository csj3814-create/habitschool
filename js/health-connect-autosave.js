/**
 * 앱을 열 때 Health Connect 에서 받은 걸음수·수면·운동을 그날 기록에 바로 쓴다.
 *
 * 2026-10-14 요청: "앱으로 처음 접속할 때 헬스 커넥트에서 정보 최대한 가져와서
 * 한번에 적용해 줘. 사용자가 직접 넣은 정보는 빼고." 예전에는 칸만 채우고 저장
 * 버튼을 기다렸다. 그 버튼을 누르지 않으면 기기가 다 재 둔 기록이 남지 않았다.
 *
 * 여기는 **무엇을 쓸지만** 정한다. 쓰기와 화면은 app-core.js 가 한다.
 *
 * 직접 넣은 값의 기준:
 *  - 걸음수: 저장된 걸음수의 source 가 'health_connect' 가 아니면(직접 입력·캡처) 둔다.
 *  - 수면: 저장된 시간이 있는데 저장된 sleepSync 의 시간과 다르면(직접 적음·캡처 분석) 둔다.
 *  - 운동: exercise.healthSessions 는 Health Connect 만 쓰는 칸이라 늘 새 목록으로 바꾼다.
 *    회원이 올린 운동 사진·영상(cardioList·strengthList)은 건드리지 않는다.
 *
 * 의존성이 없는 순수 모듈이다(테스트에서 그대로 불러온다).
 */
import {
    HEALTH_CONNECT_SOURCE,
    buildHealthConnectStepData,
    buildPersistableStepData
} from './health-connect-utils.js?v=560';
import { buildSleepSyncRecord } from './health-connect-activity.js?v=560';

const MAX_HEALTH_SESSIONS = 12;

function sessionsForStorage(sessions = []) {
    return (Array.isArray(sessions) ? sessions : [])
        .filter((item) => item && typeof item === 'object')
        .slice(0, MAX_HEALTH_SESSIONS)
        .map((item) => ({
            type: String(item.type || 'other'),
            label: String(item.label || '운동'),
            startEpochMillis: Number(item.startEpochMillis) || 0,
            endEpochMillis: Number(item.endEpochMillis) || 0,
            minutes: Number(item.minutes) || 0,
            kcal: Number.isFinite(Number(item.kcal)) && item.kcal !== null ? Number(item.kcal) : null,
            distanceKm: Number.isFinite(Number(item.distanceKm)) && item.distanceKm !== null ? Number(item.distanceKm) : null,
            stepCounted: item.stepCounted !== false,
            providerLabel: String(item.providerLabel || 'Health Connect')
        }));
}

function sameSessions(a = [], b = []) {
    const key = (list) => JSON.stringify(sessionsForStorage(list).map((item) => [item.type, item.startEpochMillis, item.endEpochMillis, item.minutes, item.kcal, item.distanceKm]));
    return key(a) === key(b);
}

/** 저장된 걸음수가 회원이 직접 넣은 것인가. */
export function isUserEnteredSteps(savedSteps) {
    const count = Number(savedSteps?.count) || 0;
    if (count <= 0) return false;
    return String(savedSteps?.source || '').trim() !== HEALTH_CONNECT_SOURCE;
}

/** 저장된 수면 시간이 회원이 직접 넣은 것인가. */
export function isUserEnteredSleep(savedSleepAndMind) {
    const hours = Number(savedSleepAndMind?.sleepHours);
    if (!(hours > 0)) return false;
    const sync = savedSleepAndMind?.sleepSync;
    return !(sync && typeof sync === 'object' && Number(sync.sleepHours) === hours);
}

/**
 * 그날 기록에 덧쓸 조각. 바꿀 것이 없으면 null.
 *
 * savedLog    서버에서 읽은 오늘 기록 (없으면 {})
 * stepImport  { stepCount, stepSource, stepProviderLabel, nativeSource, syncedAtEpochMillis }
 * activity    parseHealthConnectActivity 결과 ({ sleep, exercises, exercisePermitted, syncedAtEpochMillis })
 */
export function buildHealthConnectAutoSavePatch({ savedLog = {}, stepImport = null, activity = null, todayStr = '' } = {}) {
    if (!todayStr) return null;
    const log = savedLog && typeof savedLog === 'object' ? savedLog : {};
    if (log.date && log.date !== todayStr) return null;

    const patch = {};
    const applied = { steps: null, sleepHours: null, exercises: null };

    // 걸음수
    const stepCount = Math.max(0, Number.parseInt(stepImport?.stepCount, 10) || 0);
    if (stepCount > 0 && !isUserEnteredSteps(log.steps)) {
        const savedCount = Number(log.steps?.count) || 0;
        if (savedCount !== stepCount) {
            const steps = buildPersistableStepData(buildHealthConnectStepData({
                stepCount,
                stepSource: HEALTH_CONNECT_SOURCE,
                stepProviderLabel: stepImport?.stepProviderLabel,
                nativeSource: stepImport?.nativeSource,
                syncedAtEpochMillis: stepImport?.syncedAtEpochMillis
            }));
            if (steps) {
                patch.steps = steps;
                applied.steps = stepCount;
            }
        }
    }

    // 수면 — 깬 날짜가 오늘인 밤잠만 (parseHealthConnectActivity 가 이미 거른다)
    const night = activity?.sleep;
    const savedMind = log.sleepAndMind && typeof log.sleepAndMind === 'object' ? log.sleepAndMind : {};
    if (night && night.wakeDate === todayStr && !isUserEnteredSleep(savedMind)) {
        const sync = buildSleepSyncRecord(night, { syncedAtEpochMillis: activity?.syncedAtEpochMillis });
        const savedSync = savedMind.sleepSync;
        const unchanged = Number(savedMind.sleepHours) === sync.sleepHours
            && savedSync
            && Number(savedSync.startEpochMillis) === sync.startEpochMillis
            && Number(savedSync.endEpochMillis) === sync.endEpochMillis
            && Number(savedSync.asleepMinutes) === sync.asleepMinutes;
        if (!unchanged) {
            patch.sleepAndMind = { sleepHours: sync.sleepHours, sleepSync: sync };
            applied.sleepHours = sync.sleepHours;
        }
    }

    // 운동 — 권한이 있을 때만. 오늘 운동은 Health Connect 가 가진 것이 전부다.
    if (activity?.exercisePermitted) {
        const next = sessionsForStorage(activity.exercises);
        const saved = Array.isArray(log.exercise?.healthSessions) ? log.exercise.healthSessions : [];
        if (!sameSessions(next, saved)) {
            patch.exercise = { healthSessions: next };
            applied.exercises = next.length;
        }
    }

    if (!Object.keys(patch).length) return null;
    return { patch, applied };
}

/** 반영한 것을 한 줄로. */
export function describeHealthConnectAutoSave(applied = {}, { english = false } = {}) {
    const parts = [];
    if (english) {
        if (applied.steps) parts.push(`${Number(applied.steps).toLocaleString('en-US')} steps`);
        if (applied.sleepHours) parts.push(`${applied.sleepHours}h of sleep`);
        if (applied.exercises) parts.push(`${applied.exercises} workout${applied.exercises > 1 ? 's' : ''}`);
        if (!parts.length) return '';
        return `📲 Added ${parts.join(' · ')} from Health Connect to today's log.`;
    }
    if (applied.steps) parts.push(`걸음 ${Number(applied.steps).toLocaleString('ko-KR')}보`);
    if (applied.sleepHours) parts.push(`수면 ${applied.sleepHours}시간`);
    if (applied.exercises) parts.push(`운동 ${applied.exercises}건`);
    if (!parts.length) return '';
    return `📲 Health Connect ${parts.join(' · ')}을 오늘 기록에 반영했어요.`;
}
