// 걸음수와 운동 기록을 합칠 것인가, 큰 쪽만 쓸 것인가 — 바꾸기 전에 재는 스크립트.
// 읽기만 한다. 쓰기 경로가 없다.
//
//   node scripts/measure-activity-overlap-2026-09-15.js <serviceAccountKey.json> [--days=90] [--out=경로]
//
// 왜 만들었나
//   js/le8-score.js 의 resolveDailyActivityMinutes 는 하루 활동분을
//   max(걸음수 환산분, 운동기록 환산분) 으로 잡는다. 같은 산책이 걸음수로도
//   사진으로도 잡히는 이중계상을 막으려는 것이고, 걷기·달리기에는 맞다.
//   그러나 근력·수영·자전거는 걸음을 만들지 않으므로 겹치지 않는다.
//   8,000보 걷고 헬스 1시간 한 사람은 100분을 움직였는데 60분만 세고 있다.
//
//   고치면 전 회원의 건강습관 점수가 움직인다. 그래서 먼저 잰다.
//   tasks/lessons.md 2026-08-21 — "설계를 바꾸자는 제안은 표본부터 잰다."
//
// 재는 것
//   1. 규칙을 바꾸면 주간 활동분이 몇 명에게, 얼마나 달라지는가
//   2. LE8 신체활동 점수(0~100)가 몇 명에게 몇 점 오르는가
//   3. 주 150분을 새로 넘기는 사람이 몇 명인가
//   4. 근력 영상이 max() 에 삼켜져 0분으로 사라지는 날이 실제로 얼마나 되는가
//
// 출력에는 집계만 담는다. uid·이름·이메일은 어디에도 적지 않는다.

const fs = require("fs");
const path = require("path");

// 이 저장소 루트에는 firebase-admin 이 없다. functions/ 쪽 설치본을 쓴다.
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
    : path.join(__dirname, "..", "tasks", "2026-09-15_activity_overlap_measurement.md");

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
        console.error("자격증명이 없다. 서비스 계정 키 경로를 넘기거나 ADC 를 설정할 것.\n");
        console.error("  node scripts/measure-activity-overlap-2026-09-15.js <serviceAccountKey.json> [--days=90]");
        process.exit(1);
    }
}
const db = admin.firestore();

// ── js/le8-score.js 와 같은 값이어야 한다 ───────────────────────────
// 여기에 옮겨 적는 이유: 이 스크립트는 '지금 규칙'과 '바꿀 규칙'을 나란히
// 돌려 봐야 해서, 어차피 두 벌이 필요하다. 상수가 어긋나면 숫자가 거짓이 된다.
const WEEKLY_TARGET = 150;
const INTENSITY_WEIGHTS = { "저강도": 0.5, "중강도": 1, "고강도": 2, "초고강도": 3 };
const MAX_MEDIA_MINUTES_PER_DAY = 120;
const DEFAULT_MEDIA_MINUTES_PER_UNIT = 30;
const STEP_BASELINE = 4000;
const STEPS_PER_MINUTE = 100;
const MAX_STEP_MINUTES = 120;

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

function stepMinutesOf(log) {
    const steps = (log && log.steps) || {};
    const active = num(steps.active_minutes);
    if (active !== null) return active;
    const count = num(steps.count);
    if (count === null) return 0;
    return Math.min(MAX_STEP_MINUTES, Math.max(0, (count - STEP_BASELINE) / STEPS_PER_MINUTE));
}

// 걸음수가 이미 세어 주는 운동인가. 모르면 '겹친다'로 본다 —
// 부풀리는 쪽으로 틀리지 않기 위해서다.
const STEP_OVERLAPPING_KEYWORDS = [
    "걷기", "걷", "산책", "달리기", "달리", "조깅", "러닝", "등산", "트레킹",
    "마라톤", "러닝머신", "트레드밀", "워킹", "하이킹", "계단"
];
function isStepOverlapping(item) {
    const type = String(item?.aiAnalysis?.exerciseType || "").trim();
    if (!type) return true;
    return STEP_OVERLAPPING_KEYWORDS.some(k => type.includes(k));
}

// 지금 규칙
function currentDailyMinutes(log) {
    const ex = (log && log.exercise) || {};
    const items = [].concat(ex.cardioList || [], ex.strengthList || []);
    const media = Math.min(MAX_MEDIA_MINUTES_PER_DAY, items.reduce((s, i) => s + itemMinutes(i), 0));
    return Math.max(stepMinutesOf(log), media);
}

// 제안 규칙: 걸음수가 세어 주는 운동만 겹친다고 보고, 나머지는 더한다.
// 근력 영상(strengthList)은 걸음을 만들지 않으므로 언제나 더한다.
function proposedDailyMinutes(log) {
    const ex = (log && log.exercise) || {};
    const cardio = ex.cardioList || [];
    const strength = ex.strengthList || [];

    let overlapping = 0;
    let separate = 0;
    cardio.forEach((item) => {
        const m = itemMinutes(item);
        if (isStepOverlapping(item)) overlapping += m; else separate += m;
    });
    strength.forEach((item) => { separate += itemMinutes(item); });

    overlapping = Math.min(MAX_MEDIA_MINUTES_PER_DAY, overlapping);
    separate = Math.min(MAX_MEDIA_MINUTES_PER_DAY, separate);
    return Math.max(stepMinutesOf(log), overlapping) + separate;
}

function activityScore(weeklyMinutes) {
    if (weeklyMinutes >= 150) return 100;
    if (weeklyMinutes >= 120) return 90;
    if (weeklyMinutes >= 90) return 80;
    if (weeklyMinutes >= 60) return 60;
    if (weeklyMinutes >= 30) return 40;
    if (weeklyMinutes >= 1) return 20;
    return 0;
}

function weekKeyOf(dateStr) {
    const noon = new Date(`${dateStr}T12:00:00Z`);
    const dow = noon.getUTCDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    return new Date(noon.getTime() + diffToMon * 86400000).toISOString().slice(0, 10);
}

function pct(a, b) { return b === 0 ? "0.0%" : ((a / b) * 100).toFixed(1) + "%"; }

(async () => {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
    console.log(`daily_logs 조회: date >= ${since} (${WINDOW_DAYS}일)`);

    const snap = await db.collection("daily_logs").where("date", ">=", since).get();
    console.log(`문서 ${snap.size}건`);

    // (uid, 주) 단위로 모은다
    const weeks = new Map();       // `${uid}|${week}` -> { cur, prop }
    let daysWithStrength = 0;
    let daysStrengthSwallowed = 0;
    let swallowedMinutes = 0;
    let daysWithBoth = 0;          // 걸음수도 있고 운동기록도 있는 날
    let daysWithTypedCardio = 0;   // AI 가 종류를 읽어 둔 유산소가 있는 날
    let daysTypedNonStep = 0;      // 그중 걸음수와 안 겹치는 종류

    snap.forEach((doc) => {
        const log = doc.data();
        const uid = log.userId;
        const date = log.date;
        if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return;

        const cur = currentDailyMinutes(log);
        const prop = proposedDailyMinutes(log);

        const ex = log.exercise || {};
        const strength = ex.strengthList || [];
        const cardio = ex.cardioList || [];
        const sm = stepMinutesOf(log);

        if (strength.length) {
            daysWithStrength++;
            // 어림잡지 않는다. 규칙을 바꿨을 때 그날 실제로 늘어나는 분이 곧 잃고 있던 분이다.
            const lost = prop - cur;
            if (lost > 0) {
                daysStrengthSwallowed++;
                swallowedMinutes += lost;
            }
        }
        if (sm > 0 && (strength.length || cardio.length)) daysWithBoth++;
        cardio.forEach((item) => {
            const type = String(item?.aiAnalysis?.exerciseType || "").trim();
            if (!type) return;
            daysWithTypedCardio++;
            if (!isStepOverlapping(item)) daysTypedNonStep++;
        });

        const key = `${uid}|${weekKeyOf(date)}`;
        const acc = weeks.get(key) || { cur: 0, prop: 0 };
        acc.cur += cur;
        acc.prop += prop;
        weeks.set(key, acc);
    });

    // 주 단위 변화
    let weeksTotal = 0, weeksChanged = 0, weeksCrossTarget = 0;
    let scoreUp = 0, scoreSame = 0, scoreTotalDelta = 0;
    const deltaBuckets = { "0": 0, "1-15": 0, "16-30": 0, "31-60": 0, "61+": 0 };
    const changedUsers = new Set();

    for (const [key, v] of weeks) {
        weeksTotal++;
        const cur = Math.round(v.cur);
        const prop = Math.round(v.prop);
        const delta = prop - cur;
        if (delta > 0) {
            weeksChanged++;
            changedUsers.add(key.split("|")[0]);
            if (delta <= 15) deltaBuckets["1-15"]++;
            else if (delta <= 30) deltaBuckets["16-30"]++;
            else if (delta <= 60) deltaBuckets["31-60"]++;
            else deltaBuckets["61+"]++;
        } else {
            deltaBuckets["0"]++;
        }
        if (cur < WEEKLY_TARGET && prop >= WEEKLY_TARGET) weeksCrossTarget++;
        const sc = activityScore(cur), sp = activityScore(prop);
        if (sp > sc) { scoreUp++; scoreTotalDelta += (sp - sc); } else scoreSame++;
    }

    const uniqueUsers = new Set([...weeks.keys()].map(k => k.split("|")[0])).size;

    const lines = [];
    lines.push(`# 걸음수 · 운동기록 합산 규칙 변경 영향 측정`);
    lines.push("");
    lines.push(`- 측정 시각: ${new Date().toISOString()}`);
    lines.push(`- 대상: \`daily_logs\` date >= ${since} (${WINDOW_DAYS}일), 문서 ${snap.size}건`);
    lines.push(`- 회원 ${uniqueUsers}명 · 회원×주 ${weeksTotal}건`);
    lines.push("");
    lines.push(`## 1. 규칙을 바꾸면 주간 활동분이 얼마나 달라지나`);
    lines.push("");
    lines.push(`| 항목 | 값 |`);
    lines.push(`|---|---|`);
    lines.push(`| 숫자가 달라지는 주 | ${weeksChanged} / ${weeksTotal} (${pct(weeksChanged, weeksTotal)}) |`);
    lines.push(`| 숫자가 달라지는 회원 | ${changedUsers.size} / ${uniqueUsers} (${pct(changedUsers.size, uniqueUsers)}) |`);
    lines.push(`| 주 150분을 **새로** 넘기는 주 | ${weeksCrossTarget} (${pct(weeksCrossTarget, weeksTotal)}) |`);
    lines.push("");
    lines.push(`증가폭 분포 (주 단위)`);
    lines.push("");
    lines.push(`| 증가 | 주 |`);
    lines.push(`|---|---|`);
    Object.entries(deltaBuckets).forEach(([k, v]) => lines.push(`| ${k}분 | ${v} (${pct(v, weeksTotal)}) |`));
    lines.push("");
    lines.push(`## 2. 건강습관 점수(신체활동 0~100)`);
    lines.push("");
    lines.push(`| 항목 | 값 |`);
    lines.push(`|---|---|`);
    lines.push(`| 점수가 오르는 주 | ${scoreUp} / ${weeksTotal} (${pct(scoreUp, weeksTotal)}) |`);
    lines.push(`| 그대로인 주 | ${scoreSame} (${pct(scoreSame, weeksTotal)}) |`);
    lines.push(`| 오를 때 평균 상승폭 | ${scoreUp ? (scoreTotalDelta / scoreUp).toFixed(1) : "0"}점 |`);
    lines.push(`| 내려가는 주 | 0 (제안 규칙은 더하기만 한다) |`);
    lines.push("");
    lines.push(`## 3. 근력 영상이 지금 얼마나 사라지고 있나`);
    lines.push("");
    lines.push(`| 항목 | 값 |`);
    lines.push(`|---|---|`);
    lines.push(`| 근력 영상이 있는 날 | ${daysWithStrength} |`);
    lines.push(`| 그중 지금 규칙이 **덜 세고 있는** 날 | ${daysStrengthSwallowed} (${pct(daysStrengthSwallowed, daysWithStrength)}) |`);
    lines.push(`| 그렇게 잃고 있는 분 합계 | ${Math.round(swallowedMinutes)}분 |`);
    lines.push(`| 그런 날 평균 손실 | ${daysStrengthSwallowed ? Math.round(swallowedMinutes / daysStrengthSwallowed) : 0}분 |`);
    lines.push(`| 걸음수와 운동기록이 함께 있는 날 | ${daysWithBoth} |`);
    lines.push("");
    lines.push(`## 4. AI 가 종류를 읽은 유산소`);
    lines.push("");
    lines.push(`| 항목 | 값 |`);
    lines.push(`|---|---|`);
    lines.push(`| 종류가 적힌 유산소 기록 | ${daysWithTypedCardio} |`);
    lines.push(`| 그중 걸음수와 **안 겹치는** 종류(자전거·수영 등) | ${daysTypedNonStep} (${pct(daysTypedNonStep, daysWithTypedCardio)}) |`);
    lines.push("");
    lines.push(`> 종류가 비어 있으면 '겹친다'로 본다. 그래서 분석 이전 기록은 숫자가 그대로다.`);
    lines.push(`> 이 표가 작을수록 변경의 영향은 근력 쪽에 몰려 있다는 뜻이다.`);
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
