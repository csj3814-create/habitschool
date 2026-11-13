/**
 * 혈액검사·건강검진 결과에서 건강 정보(healthProfile)로 옮길 값을 고른다.
 *
 * 예전에는 혈당·당화혈색소·중성지방만 옮겼다. 콜레스테롤 카드에는 "결과지를 올리면
 * 자동으로 채워집니다" 라고 써 놓고 채우지 않았고, 검진 결과통보서에 함께 찍혀 나오는
 * 키·체중·허리둘레도 버렸다 (2026-11-13 제보).
 *
 * 규칙
 * - 검사일이 없거나 1년을 넘은 결과지는 '최신 수치'로 쓰지 않는다.
 * - 이미 더 최근 검사가 반영돼 있으면 덮지 않는다 (옛 결과지를 나중에 올리는 일이 있다).
 * - 키·허리둘레는 사람이 그 뒤에 직접 고친 값이 있으면 덮지 않는다.
 * - 체중은 더 최근에 잰 체중이 있으면 덮지 않는다.
 * - 범위를 벗어난 숫자는 판독 실수로 보고 버린다. 범위는 프로필 입력칸과 같다.
 */

const RANGES = Object.freeze({
    glucose: [20, 600],
    hba1c: [3, 20],
    triglyceride: [10, 5000],
    totalCholesterol: [50, 500],
    hdl: [10, 150],
    height: [100, 250],
    weight: [20, 300],
    waist: [40, 200]
});

function readMetric(metrics, key) {
    const value = Number(metrics?.[key]?.value);
    const [min, max] = RANGES[key];
    return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function isDateString(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

/**
 * @returns {{ patch: Object<string, *>, applied: Object<string, *> }}
 *   patch 는 update() 에 넘길 점 표기 경로, applied 는 화면이 입력칸을 채울 때 쓰는 같은 값.
 */
function buildBloodTestProfilePatch({ metrics, testDate, profile, ageDays, freshDays }) {
    const empty = { patch: {}, applied: {} };
    const date = String(testDate || "").trim();
    if (!isDateString(date)) return empty;
    if (ageDays === null || ageDays === undefined || ageDays < 0 || ageDays > freshDays) return empty;

    const current = profile || {};
    const applied = {};

    const lastLabDate = String(current.latestBloodTestDate || "");
    const labIsNewer = !isDateString(lastLabDate) || date >= lastLabDate;
    if (labIsNewer) {
        const glucose = readMetric(metrics, "glucose");
        const hba1c = readMetric(metrics, "hba1c");
        const triglyceride = readMetric(metrics, "triglyceride");
        const totalCholesterol = readMetric(metrics, "totalCholesterol");
        const hdl = readMetric(metrics, "hdl");
        if (glucose !== null) applied.latestGlucose = glucose;
        if (hba1c !== null) applied.hba1c = String(hba1c);
        if (triglyceride !== null) applied.latestTriglyceride = triglyceride;
        if (totalCholesterol !== null) applied.totalCholesterol = totalCholesterol;
        if (hdl !== null) applied.hdl = hdl;
    }

    // 프로필을 마지막으로 손본 날. 그 뒤의 검사만 사람이 넣은 키·허리둘레를 바꾼다.
    const editedDate = String(current.updatedAt || "").slice(0, 10);
    const afterLastEdit = !isDateString(editedDate) || date >= editedDate;
    const height = readMetric(metrics, "height");
    const waist = readMetric(metrics, "waist");
    if (height !== null && (!current.heightCm || afterLastEdit)) applied.heightCm = height;
    if (waist !== null && (!current.waistCm || afterLastEdit)) applied.waistCm = waist;

    const weight = readMetric(metrics, "weight");
    const weightDate = String(current.weightDate || "");
    if (weight !== null && (!isDateString(weightDate) || date > weightDate)) {
        applied.weight = weight;
        applied.weightDate = date;
    }

    if (Object.keys(applied).length === 0) return empty;
    if (labIsNewer) applied.latestBloodTestDate = date;

    const patch = {};
    for (const [key, value] of Object.entries(applied)) patch[`healthProfile.${key}`] = value;
    return { patch, applied };
}

module.exports = { buildBloodTestProfilePatch, BLOOD_TEST_PROFILE_RANGES: RANGES };
