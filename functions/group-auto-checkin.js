// 소모임 인증 자동 승인 판정 (러닝 클럽·만보 걷기·홈트 인증방·헬스장 출석).
//
// 2026-11-08 대표: 소모임을 4주 안에 14번으로 바꾸면서 승인도 서버가 한다. 만보 걷기와 헬스장 출석에는
// 모임장이 없어 사람이 하나하나 승인해 왔고, 4주는 승인이 늦으면 채울 수 없다.
//
// 앱은 지금처럼 그날 인증을 "대기"로 쓴다. 서버는 그날 기록이 아래를 넘으면 "승인"으로 바꾼다.
// 넘지 못하면 대기로 둔다 — 사람이 보고 승인하거나 거절한다. 서버는 거절하지 않는다.
//
// - 만보 걷기: 그날 걸음이 10,000보 이상이고, 걸음이 헬스 커넥트나 걸음 캡처로 들어왔다.
//   손으로 적은 숫자는 확인할 근거가 없어 사람에게 남긴다 (최근 28일 만보 날 80일 중 40일이 손 입력).
// - 그 밖의 모임: AI 가 운동으로 판단한(isExercise) 사진·영상이 하나 이상 있다.
//   장소(헬스장인지 집인지)는 AI 가 판단하지 않는다. 모임 이름은 모임의 성격이고 기준은 같다.

function stepCountOf(log = {}) {
    const steps = log?.steps || {};
    return Number(steps.count || steps.steps || steps.active_steps || 0) || 0;
}

function hasTrustedStepSource(log = {}) {
    const steps = log?.steps || {};
    const source = String(steps.source || "").trim();
    if (steps.screenshotUrl) return true;
    return !!source && source !== "manual";
}

function hasMedia(item = {}) {
    return !!(item?.imageUrl || item?.imageThumbUrl || item?.videoUrl || item?.videoThumbUrl);
}

function evaluateAutoGroupRecord(log = {}, requirement = {}) {
    const kind = String(requirement?.kind || "").trim();
    if (kind === "steps") {
        const minSteps = Number(requirement.minSteps) || 10000;
        const count = stepCountOf(log);
        if (count < minSteps) return { qualified: false, reason: "short_steps" };
        if (!hasTrustedStepSource(log)) return { qualified: false, reason: "manual_steps" };
        return { qualified: true, reason: "", summary: `${count.toLocaleString("ko-KR")}보` };
    }
    if (kind === "exercise_record") {
        const exercise = log?.exercise || {};
        const items = [
            ...(Array.isArray(exercise.cardioList) ? exercise.cardioList : []),
            ...(Array.isArray(exercise.strengthList) ? exercise.strengthList : []),
        ].filter(hasMedia);
        if (items.length === 0) return { qualified: false, reason: "no_media" };
        const judged = items.find((item) => item?.aiAnalysis?.isExercise === true);
        if (!judged) {
            const waiting = items.some((item) => !item?.aiAnalysis);
            return { qualified: false, reason: waiting ? "no_analysis" : "not_exercise" };
        }
        return { qualified: true, reason: "", summary: String(judged.aiAnalysis.exerciseType || "운동").slice(0, 40) };
    }
    return { qualified: false, reason: "not_auto" };
}

function isAutoApprovedGroup(group = {}) {
    const kind = String(group?.requirement?.kind || "").trim();
    return kind === "steps" || kind === "exercise_record";
}

module.exports = { evaluateAutoGroupRecord, isAutoApprovedGroup, hasTrustedStepSource };
