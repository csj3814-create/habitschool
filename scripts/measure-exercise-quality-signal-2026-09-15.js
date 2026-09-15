// 대사 점수가 운동을 '기록한 날 수'로만 세고 있다. 시간·강도를 쓰면 무엇이
// 달라지는지, 그리고 주간 추이 그래프에 운동 분을 넣을 만한 데이터가 쌓여 있는지
// 바꾸기 전에 잰다. 읽기만 한다 — 쓰기 경로가 없다.
//
//   node scripts/measure-exercise-quality-signal-2026-09-15.js <serviceAccountKey.json> [--days=90]
//
// 왜 만들었나
//   js/metabolic-score.js 는 운동을 이렇게 센다:
//       if (cardioCount > 0 || strengthCount > 0) exerciseDays++;
//       exerciseScore = (exerciseDays / total) * 6;  (+ 유산소·근력 둘 다면 2점)
//   10분 스트레칭과 90분 헬스가 같은 점수다. 같은 파일에서 식단은 grade 로 질을
//   보는데 운동만 개수를 센다. 이제 durationMinutes 와 intensity 가 있으니 쓸 수
//   있지만, 고치면 전 회원 대사 점수가 움직인다.
//   tasks/lessons.md 2026-08-21 — "설계를 바꾸자는 제안은 표본부터 잰다."
//
// 재는 것
//   1. 질 신호(시간·강도)가 실제로 얼마나 쌓여 있나 — 없으면 논의 자체가 이르다
//   2. 운동한 날들의 활동분 분포 — '날짜 수'가 지우고 있는 차이의 크기
//   3. 대사 점수를 시간 기반으로 바꾸면 몇 명이 몇 점 움직이나
//   4. 주간 추이에 운동 분을 넣으면 점이 몇 개나 찍히나 (빈 그래프가 되지 않을지)
//
// 출력에는 집계만 담는다. uid·이름·이메일은 어디에도 적지 않는다.
//
// 배포 확인용이 아니다. 두 계산을 자기 안에 들고 데이터에 대해 비교한다.
// (2026-09-15 에 measure-activity-overlap 으로 그 착각을 한 번 했다.)

const fs = require("fs");
const path = require("path");

let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const args = process.argv.slice(2);
const keyPath = args.find(a => !a.startsWith("--"));
const daysArg = args.find(a => a.startsWith("--days="));
const outArg = args.find(a => a.startsWith("--out="));

const WINDOW_DAYS = daysArg ? Number(daysArg.split("=")[1]) : 90;
const OUT_PATH = outArg
    ? outArg.split("=").slice(1).join("=")
    : path.join(__dirname, "..", "tasks", "2026-09-15_exercise_quality_signal.md");

const resolvedKey = keyPath || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
if (resolvedKey) {
    const abs = path.resolve(resolvedKey);
    if (!fs.existsSync(abs)) {
        console.error("서비스 계정 키를 찾을 수 없다: " + abs);
        process.exit(1);
    }
    const sa = require(abs);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    console.log("자격증명: 서비스 계정 키 · 프로젝트 " + (sa.project_id || "(미상)"));
} else {
    try {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
        console.log("자격증명: application default (ADC)");
    } catch (e) {
        console.error("자격증명이 없다. 서비스 계정 키 경로를 넘길 것.");
        process.exit(1);
    }
}
const db = admin.firestore();

// ── js/le8-score.js 와 같은 값이어야 한다 ───────────────────────────
const INTENSITY_WEIGHTS = { "저강도": 0.5, "중강도": 1, "고강도": 2, "초고강도": 3 };
const MAX_MEDIA_MINUTES_PER_DAY = 120;
const DEFAULT_MEDIA_MINUTES_PER_UNIT = 30;
const STEP_OVERLAPPING_KEYWORDS = [
    "걷기", "걷", "산책", "달리기", "달리", "조깅", "러닝", "등산", "트레킹",
    "마라톤", "러닝머신", "트레드밀", "워킹", "하이킹", "계단"
];

const num = (v) => {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
};

function itemMinutes(item) {
    const entered = num(item && item.durationMinutes);
    if (entered !== null && entered > 0) {
        const weight = INTENSITY_WEIGHTS[item?.aiAnalysis?.intensity] || 1;
        return Math.min(MAX_MEDIA_MINUTES_PER_DAY, entered * weight);
    }
    const weighted = num(item && item.aiAnalysis && item.aiAnalysis.weightedMinutes);
    if (weighted !== null && weighted > 0) return Math.min(MAX_MEDIA_MINUTES_PER_DAY, weighted);
    return DEFAULT_MEDIA_MINUTES_PER_UNIT;
}

function isStepOverlapping(item) {
    const type = String(item?.aiAnalysis?.exerciseType || "").trim();
    if (!type) return true;
    return STEP_OVERLAPPING_KEYWORDS.some(k => type.includes(k));
}

function stepMinutesOf(log) {
    const steps = (log && log.steps) || {};
    const active = num(steps.active_minutes);
    if (active !== null) return active;
    const count = num(steps.count);
    if (count === null) return 0;
    return Math.min(120, Math.max(0, (count - 4000) / 100));
}

// 지금 배포된 규칙 (2026-09-15, beb620b)
function dailyMinutes(log) {
    const ex = (log && log.exercise) || {};
    const cardio = ex.cardioList || [];
    const strength = ex.strengthList || [];
    let overlapping = 0;
    let separate = 0;
    cardio.forEach((i) => {
        const m = itemMinutes(i);
        if (isStepOverlapping(i)) overlapping += m; else separate += m;
    });
    strength.forEach((i) => {
        const m = itemMinutes(i);
        const known = String(i?.aiAnalysis?.exerciseType || "").trim();
        if (known && isStepOverlapping(i)) overlapping += m; else separate += m;
    });
    overlapping = Math.min(MAX_MEDIA_MINUTES_PER_DAY, overlapping);
    separate = Math.min(MAX_MEDIA_MINUTES_PER_DAY, separate);
    return Math.max(stepMinutesOf(log), overlapping) + separate;
}

// ── 대사 점수의 운동 항목 (js/metabolic-score.js 와 같아야 한다) ──────
// 지금: 기록한 날 수. 10분과 90분이 같다.
function currentExerciseScore(logs) {
    const total = logs.length || 1;
    let exerciseDays = 0, hasCardio = false, hasStrength = false;
    logs.forEach((log) => {
        const ex = log.exercise || {};
        const c = (ex.cardioList || []).length;
        const s = (ex.strengthList || []).length;
        if (c > 0 || s > 0) exerciseDays++;
        if (c > 0) hasCardio = true;
        if (s > 0) hasStrength = true;
    });
    let score = (exerciseDays / total) * 6;
    if (hasCardio && hasStrength) score += 2;
    return Math.min(10, score);
}

// 제안: 주 150분에 얼마나 닿았나로 본다. 빈도(6점)는 그대로 두고 질(2점)을
// 'AI 로 종류·강도가 읽힌 비율'이 아니라 '활동분 달성률'로 준다.
function proposedExerciseScore(logs) {
    const total = logs.length || 1;
    let exerciseDays = 0;
    let minutesSum = 0;
    logs.forEach((log) => {
        const ex = log.exercise || {};
        const c = (ex.cardioList || []).length;
        const s = (ex.strengthList || []).length;
        if (c > 0 || s > 0) exerciseDays++;
        minutesSum += dailyMinutes(log);
    });
    const frequency = (exerciseDays / total) * 6;
    // 최근 창을 주로 환산해 150분 기준 달성률 → 최대 4점
    const weeks = Math.max(1, total / 7);
    const weeklyMinutes = minutesSum / weeks;
    const quality = Math.min(4, (weeklyMinutes / 150) * 4);
    return Math.min(10, frequency + quality);
}

function pct(a, b) { return b === 0 ? "0.0%" : ((a / b) * 100).toFixed(1) + "%"; }
function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

(async () => {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
    console.log(`daily_logs 조회: date >= ${since} (${WINDOW_DAYS}일)`);
    const snap = await db.collection("daily_logs").where("date", ">=", since).get();
    console.log(`문서 ${snap.size}건`);

    const byUser = new Map();
    let itemsTotal = 0, itemsWithDuration = 0, itemsWithIntensity = 0, itemsWithType = 0;
    const exerciseDayMinutes = [];
    let daysWithAnyExercise = 0;
    const weeksWithMinutes = new Set();

    snap.forEach((doc) => {
        const log = doc.data();
        const uid = log.userId;
        if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(String(log.date || ""))) return;

        const ex = log.exercise || {};
        const items = [].concat(ex.cardioList || [], ex.strengthList || []);
        items.forEach((item) => {
            itemsTotal++;
            if (num(item?.durationMinutes) !== null && num(item.durationMinutes) > 0) itemsWithDuration++;
            if (item?.aiAnalysis?.intensity) itemsWithIntensity++;
            if (String(item?.aiAnalysis?.exerciseType || "").trim()) itemsWithType++;
        });

        if (items.length > 0) {
            daysWithAnyExercise++;
            exerciseDayMinutes.push(Math.round(dailyMinutes(log)));
        }
        if (dailyMinutes(log) > 0) weeksWithMinutes.add(`${uid}|${String(log.date).slice(0, 7)}`);

        if (!byUser.has(uid)) byUser.set(uid, []);
        byUser.get(uid).push(log);
    });

    let usersScored = 0, scoreUp = 0, scoreDown = 0, scoreSame = 0;
    let upSum = 0, downSum = 0, maxUp = 0, maxDown = 0;
    const deltaBuckets = { "-2 이하": 0, "-2~-0.5": 0, "±0.5": 0, "0.5~2": 0, "2 이상": 0 };

    for (const [, logs] of byUser) {
        if (!logs.length) continue;
        usersScored++;
        const cur = currentExerciseScore(logs);
        const prop = proposedExerciseScore(logs);
        const d = prop - cur;
        if (d > 0.5) { scoreUp++; upSum += d; maxUp = Math.max(maxUp, d); }
        else if (d < -0.5) { scoreDown++; downSum += -d; maxDown = Math.max(maxDown, -d); }
        else scoreSame++;
        if (d <= -2) deltaBuckets["-2 이하"]++;
        else if (d < -0.5) deltaBuckets["-2~-0.5"]++;
        else if (d <= 0.5) deltaBuckets["±0.5"]++;
        else if (d < 2) deltaBuckets["0.5~2"]++;
        else deltaBuckets["2 이상"]++;
    }

    const lines = [];
    lines.push(`# 운동의 '질' 신호를 쓸 수 있는가 — 측정`);
    lines.push("");
    lines.push(`- 측정 시각: ${new Date().toISOString()}`);
    lines.push(`- 대상: \`daily_logs\` date >= ${since} (${WINDOW_DAYS}일), 문서 ${snap.size}건, 회원 ${byUser.size}명`);
    lines.push("");
    lines.push(`## 1. 질 신호가 실제로 쌓여 있나`);
    lines.push("");
    lines.push(`운동 기록(사진·영상) 한 건 단위로 센다. 이 값이 낮으면 논의 자체가 이르다 —`);
    lines.push(`시간 입력칸과 AI 분석이 9/14~9/15 에 나갔으므로 대부분은 아직 비어 있을 것이다.`);
    lines.push("");
    lines.push(`| 항목 | 값 |`);
    lines.push(`|---|---|`);
    lines.push(`| 운동 기록 건수 | ${itemsTotal} |`);
    lines.push(`| 사용자가 **시간을 적은** 건 | ${itemsWithDuration} (${pct(itemsWithDuration, itemsTotal)}) |`);
    lines.push(`| AI 가 **강도를 읽은** 건 | ${itemsWithIntensity} (${pct(itemsWithIntensity, itemsTotal)}) |`);
    lines.push(`| AI 가 **종류를 읽은** 건 | ${itemsWithType} (${pct(itemsWithType, itemsTotal)}) |`);
    lines.push("");
    lines.push(`## 2. '날짜 수'가 지우고 있는 차이`);
    lines.push("");
    lines.push(`운동 기록이 있는 날의 활동분 분포다. 지금 대사 점수는 이 날들을 전부 똑같이 센다.`);
    lines.push("");
    lines.push(`| 항목 | 값 |`);
    lines.push(`|---|---|`);
    lines.push(`| 운동 기록이 있는 날 | ${daysWithAnyExercise} |`);
    lines.push(`| 활동분 중앙값 | ${median(exerciseDayMinutes)}분 |`);
    lines.push(`| 최소 ~ 최대 | ${exerciseDayMinutes.length ? Math.min(...exerciseDayMinutes) : 0} ~ ${exerciseDayMinutes.length ? Math.max(...exerciseDayMinutes) : 0}분 |`);
    const p25 = exerciseDayMinutes.length ? [...exerciseDayMinutes].sort((a, b) => a - b)[Math.floor(exerciseDayMinutes.length * 0.25)] : 0;
    const p75 = exerciseDayMinutes.length ? [...exerciseDayMinutes].sort((a, b) => a - b)[Math.floor(exerciseDayMinutes.length * 0.75)] : 0;
    lines.push(`| 하위 25% / 상위 25% | ${p25}분 / ${p75}분 |`);
    lines.push("");
    lines.push(`## 3. 대사 점수를 시간 기반으로 바꾸면`);
    lines.push("");
    lines.push(`운동 항목 10점 만점. 지금은 빈도 6점 + 유산소·근력 둘 다 2점.`);
    lines.push(`제안은 빈도 6점 + 주 150분 달성률 4점.`);
    lines.push("");
    lines.push(`| 항목 | 값 |`);
    lines.push(`|---|---|`);
    lines.push(`| 점수를 낸 회원 | ${usersScored} |`);
    lines.push(`| 오르는 회원 | ${scoreUp} (${pct(scoreUp, usersScored)}) · 평균 +${scoreUp ? (upSum / scoreUp).toFixed(1) : 0}점 · 최대 +${maxUp.toFixed(1)} |`);
    lines.push(`| **내려가는 회원** | ${scoreDown} (${pct(scoreDown, usersScored)}) · 평균 -${scoreDown ? (downSum / scoreDown).toFixed(1) : 0}점 · 최대 -${maxDown.toFixed(1)} |`);
    lines.push(`| 그대로(±0.5) | ${scoreSame} (${pct(scoreSame, usersScored)}) |`);
    lines.push("");
    lines.push(`변화 분포`);
    lines.push("");
    lines.push(`| 변화 | 회원 |`);
    lines.push(`|---|---|`);
    Object.entries(deltaBuckets).forEach(([k, v]) => lines.push(`| ${k}점 | ${v} (${pct(v, usersScored)}) |`));
    lines.push("");
    lines.push(`> 내려가는 회원이 있다는 점이 근력 합산 건과 다르다. 그때는 더하기만 해서 0명이었다.`);
    lines.push(`> 유산소·근력을 둘 다 올려 2점을 받던 사람이 활동분은 적으면 점수가 내려간다.`);
    lines.push("");
    lines.push(`## 4. 주간 추이에 운동 분을 넣으면`);
    lines.push("");
    lines.push(`| 항목 | 값 |`);
    lines.push(`|---|---|`);
    lines.push(`| 활동분이 0보다 큰 (회원 × 월) | ${weeksWithMinutes.size} |`);
    lines.push(`| 회원당 평균 | ${byUser.size ? (weeksWithMinutes.size / byUser.size).toFixed(1) : 0} |`);
    lines.push("");
    lines.push(`> 추이 그래프는 점이 몇 개는 찍혀야 읽을 값이 된다. 걸음수가 있는 날은 활동분도`);
    lines.push(`> 있으므로, 이 숫자는 걸음수 기록 밀도와 비슷하게 나올 것이다.`);
    lines.push("");

    const out = lines.join("\n");
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, out, "utf8");
    console.log("\n" + out);
    console.log(`\n기록: ${OUT_PATH}`);
    process.exit(0);
})().catch((e) => {
    console.error("측정 실패:", e);
    process.exit(1);
});
