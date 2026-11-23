"use strict";

/**
 * 한 달 코칭 — 포인트를 쓰는 곳 ①(2026-11-23 대표: 처음 300P, 두 번째부터 500P, 한 달에 한 번).
 *
 * 두 사람이 짚는다(같은 날 대표 결정):
 *  - 해빛코치(AI): 사는 즉시 숫자 분석·잘한 것 3·바꿀 것 3 편지.
 *  - 해빛닥터 최석재: 3일 안에 **본인이 직접** 한마디를 쓴다. AI 는 관제탑에만 보이는 초안을
 *    만들어 줄 뿐이고, 회원에게는 대표가 관제탑에서 보낸 글만 간다(sendCoachingDoctorNote).
 *    AI 글을 의사 이름으로 내보내지 않는다 — 그건 회원을 속이는 일이다.
 *
 * 최근 4주 기록(식단 등급·운동·걸음·수면·체중·혈당·혈압·마음)을 숫자로 줄여 Gemini 에 주고,
 * "잘한 것 3가지, 다음 4주에 바꿀 것 3가지" 편지를 받는다. 포인트는 사라진다(소각형) — 회사 돈이
 * 나가지 않는 사용처다. 계획: habitschool-private/2026-11-23_포인트_수급_조절_계획.md 3절.
 *
 * 순서가 중요하다:
 *  1) 이번 달 것을 이미 샀으면 그대로 돌려준다(돈을 다시 받지 않는다).
 *  2) 포인트·기록일이 모자라면 AI 를 부르기 전에 멈춘다.
 *  3) AI 가 편지를 쓴 **뒤에** 트랜잭션 안에서 포인트를 빼고 편지를 저장한다.
 *     AI 가 실패하면 포인트는 그대로다. 두 번 눌러 둘 다 AI 까지 가더라도 트랜잭션이
 *     먼저 저장된 편지를 보고 두 번째는 빼지 않는다.
 *
 * 편지는 users/{uid}/coachingReports/{YYYY-MM} 에 서버만 쓴다(firestore.rules: 본인 읽기만).
 * 닥터 대기열은 coaching_review_queue/{uid}_{YYYY-MM} — 회원이 읽지 못한다(규칙 기본 거부).
 * 원장은 blockchain_transactions/monthly_coaching_{uid}_{YYYY-MM} — 해빛 배지와 같은 자리라
 * 자산 탭 포인트 내역에 그대로 보인다.
 */

const { onCall: baseOnCall, HttpsError } = require("firebase-functions/v2/https");
const { localizedOnCall } = require("./error-messages");
const onCall = localizedOnCall(baseOnCall);
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { getMemberToday } = require("./member-time");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// 처음 한 번은 맛보기 값, 그 뒤로는 제값(2026-11-23 대표).
const MONTHLY_COACHING_FIRST_COST = 300;
const MONTHLY_COACHING_COST = 500;

/** 이번에 낼 값. 전에 산 편지가 하나라도 있으면 두 번째부터다. */
function coachingPriceFor(previousCount = 0) {
    return (Number(previousCount) || 0) > 0 ? MONTHLY_COACHING_COST : MONTHLY_COACHING_FIRST_COST;
}
const MONTHLY_COACHING_WINDOW_DAYS = 28;
// 기록이 이보다 적으면 AI 가 할 말이 없다. 값을 받고 빈 편지를 주지 않는다.
const MONTHLY_COACHING_MIN_RECORDED_DAYS = 7;

// 해빛닥터가 한마디를 쓰겠다고 약속하는 날 수.
const MONTHLY_COACHING_DOCTOR_DAYS = 3;
const DOCTOR_NOTE_MAX_CHARS = 1000;

const DIET_GRADE_POINTS = Object.freeze({ A: 4, B: 3, C: 2, D: 1, F: 0 });

function getDb() {
    if (!admin.apps.some((app) => app?.name === "[DEFAULT]")) admin.initializeApp();
    return admin.firestore();
}

function num(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function round(value, digits = 1) {
    if (value === null || !Number.isFinite(value)) return null;
    const f = Math.pow(10, digits);
    return Math.round(value * f) / f;
}

function average(values) {
    const list = values.filter((value) => Number.isFinite(value));
    if (list.length === 0) return null;
    return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function addDays(dateStr, days) {
    const stamp = Date.parse(`${dateStr}T12:00:00Z`);
    return new Date(stamp + days * 86400000).toISOString().slice(0, 10);
}

/** feature-badges.js 의 기준과 같다. 포인트를 받은 날만 기록한 날이다. */
function isActiveAward(awarded = {}) {
    return Number(awarded?.dietPoints || 0) > 0
        || Number(awarded?.exercisePoints || 0) > 0
        || Number(awarded?.mindPoints || 0) > 0
        || awarded?.diet === true
        || awarded?.exercise === true
        || awarded?.mind === true;
}

function coachingMonthKey(todayStr) {
    return String(todayStr || "").slice(0, 7);
}

function coachingLedgerId(uid, monthKey) {
    return `monthly_coaching_${uid}_${monthKey}`;
}

function exerciseMinutesOf(log) {
    const exercise = log?.exercise || {};
    const lists = [exercise.cardioList, exercise.strengthList].filter(Array.isArray);
    let sessions = 0;
    let minutes = 0;
    lists.forEach((list) => list.forEach((item) => {
        if (!item || typeof item !== "object") return;
        sessions += 1;
        const m = num(item.aiAnalysis?.durationMinutes) ?? num(item.durationMinutes);
        if (m !== null && m > 0 && m < 600) minutes += m;
    }));
    return { sessions, minutes };
}

function mindDoneOf(log) {
    const mind = log?.sleepAndMind || {};
    return !!String(mind.gratitude || "").trim() || !!mind.meditationDone || !!mind.analysis;
}

/**
 * 4주 기록 → AI 에 줄 요약. 사진·글은 넘기지 않고 숫자와 음식 이름만 넘긴다.
 * 주는 오래된 쪽이 1주차다. 기록이 없는 칸은 null 로 둔다(0 으로 채우면 나빠진 것처럼 읽힌다).
 */
function summarizeCoachingLogs(logs = [], { todayStr, windowDays = MONTHLY_COACHING_WINDOW_DAYS } = {}) {
    const start = addDays(todayStr, -(windowDays - 1));
    const inWindow = (Array.isArray(logs) ? logs : [])
        .filter((log) => /^\d{4}-\d{2}-\d{2}$/.test(String(log?.date || "")))
        .filter((log) => log.date >= start && log.date <= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date));

    const recordedDates = new Set(
        inWindow.filter((log) => isActiveAward(log.awardedPoints || log.awarded || {})).map((log) => log.date)
    );

    const weekCount = Math.ceil(windowDays / 7);
    const weeks = Array.from({ length: weekCount }, (_, index) => ({
        week: index + 1,
        from: addDays(start, index * 7),
        to: addDays(start, Math.min(index * 7 + 6, windowDays - 1)),
        _diet: [], _dietDays: 0, _exDays: 0, _exMinutes: 0, _steps: [], _sleep: [], _mindDays: 0,
        _weight: [], _glucose: [], _bpSys: [], _bpDia: [], _recorded: 0,
    }));
    const gradeCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    const foodCounts = new Map();
    const signals = { ultraprocessedMeals: 0, saltyMeals: 0, sweetMeals: 0, lowVegMeals: 0, meals: 0 };

    inWindow.forEach((log) => {
        const offset = Math.round((Date.parse(`${log.date}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000);
        const week = weeks[Math.min(weekCount - 1, Math.max(0, Math.floor(offset / 7)))];
        if (recordedDates.has(log.date)) week._recorded += 1;

        const analysis = log.dietAnalysis && typeof log.dietAnalysis === "object" ? log.dietAnalysis : {};
        const meals = Object.values(analysis).filter((entry) => entry && typeof entry === "object");
        if (meals.length) week._dietDays += 1;
        meals.forEach((entry) => {
            const point = DIET_GRADE_POINTS[entry.grade];
            if (Number.isFinite(point)) {
                week._diet.push(point);
                gradeCounts[entry.grade] += 1;
            }
            signals.meals += 1;
            const foods = Array.isArray(entry.foods) ? entry.foods : [];
            if (foods.some((food) => food?.category === "ultraprocessed")) signals.ultraprocessedMeals += 1;
            if (/high|많|짠/i.test(String(entry.sodium?.level || ""))) signals.saltyMeals += 1;
            if (/high|많|단/i.test(String(entry.sweetness || ""))) signals.sweetMeals += 1;
            if (/none|low|없|적/i.test(String(entry.vegetables || ""))) signals.lowVegMeals += 1;
            foods.forEach((food) => {
                const name = String(food?.name || "").trim().slice(0, 30);
                if (name) foodCounts.set(name, (foodCounts.get(name) || 0) + 1);
            });
        });

        const ex = exerciseMinutesOf(log);
        if (ex.sessions > 0) {
            week._exDays += 1;
            week._exMinutes += ex.minutes;
        }
        const steps = num(log.steps?.count);
        if (steps !== null && steps > 0) week._steps.push(steps);
        const sleep = num(log.sleepAndMind?.sleepHours);
        if (sleep !== null && sleep > 0 && sleep < 24) week._sleep.push(sleep);
        if (mindDoneOf(log)) week._mindDays += 1;

        const metrics = log.metrics || {};
        [["weight", "_weight"], ["glucose", "_glucose"], ["bpSystolic", "_bpSys"], ["bpDiastolic", "_bpDia"]]
            .forEach(([key, bucket]) => {
                const value = num(metrics[key]);
                if (value !== null && value > 0) week[bucket].push(value);
            });
    });

    const weekly = weeks.map((week) => ({
        week: week.week,
        from: week.from,
        to: week.to,
        recordedDays: week._recorded,
        dietDays: week._dietDays,
        dietGradeAvg: round(average(week._diet), 2),
        exerciseDays: week._exDays,
        exerciseMinutes: week._exMinutes,
        stepsAvg: week._steps.length ? Math.round(average(week._steps)) : null,
        sleepHoursAvg: round(average(week._sleep), 1),
        mindDays: week._mindDays,
        weightAvg: round(average(week._weight), 1),
        glucoseAvg: round(average(week._glucose), 0),
        bpAvg: week._bpSys.length && week._bpDia.length
            ? `${Math.round(average(week._bpSys))}/${Math.round(average(week._bpDia))}`
            : null,
    }));

    const topFoods = [...foodCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([name, count]) => ({ name, count }));

    return {
        from: start,
        to: todayStr,
        recordedDays: recordedDates.size,
        weekly,
        dietGradeCounts: gradeCounts,
        dietSignals: signals,
        topFoods,
    };
}

function decideCoachingPurchase({ existing = false, coins = 0, recordedDays = 0, price = MONTHLY_COACHING_FIRST_COST } = {}) {
    if (existing) return { ok: false, reason: "already_bought" };
    if ((Number(coins) || 0) < price) return { ok: false, reason: "not_enough_points", price };
    if ((Number(recordedDays) || 0) < MONTHLY_COACHING_MIN_RECORDED_DAYS) return { ok: false, reason: "not_enough_days" };
    return { ok: true, reason: "ok" };
}

const COACHING_RESPONSE_SCHEMA = Object.freeze({
    type: "OBJECT",
    properties: {
        headline: { type: "STRING" },
        summary: { type: "STRING" },
        wins: { type: "ARRAY", items: { type: "STRING" } },
        nextSteps: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: { title: { type: "STRING" }, how: { type: "STRING" } },
                required: ["title", "how"],
            },
        },
        caution: { type: "STRING", nullable: true },
        doctorDraft: { type: "STRING" },
    },
    required: ["headline", "summary", "wins", "nextSteps"],
});

function buildCoachingPrompt(summary, locale = "ko") {
    const data = JSON.stringify(summary);
    if (locale === "en") {
        return `You are a warm, practical health-habit coach at Habit School (a lifestyle app run by an emergency physician).
Below is one member's last 4 weeks of records, summarized as numbers. Week 1 is the oldest. null means "not recorded" — never treat it as zero or as getting worse.
dietGradeAvg is the average meal grade (A=4 … F=0). dietSignals count meals with ultra-processed food, salty, sweet, or few vegetables.

Write a short monthly coaching letter:
- headline: one sentence naming the biggest thing this month (max 40 characters).
- summary: 2–3 sentences on how the 4 weeks went, quoting real numbers from the data.
- wins: exactly 3 specific things they did well, each one sentence with a number from the data.
- nextSteps: exactly 3 changes for the next 4 weeks. title = the change (short), how = one concrete, doable action (when, what, how much). Base them on the weakest areas in the data. Mention specific foods from topFoods if useful.
- caution: if glucose average ≥ 126, blood pressure average ≥ 140/90, or sleep average < 5 hours, one sentence suggesting they talk to a doctor. Otherwise null.
- doctorDraft: a 2–3 sentence DRAFT for Dr. Choi (the emergency physician who runs the app) to edit and send himself. Write it in his first-person voice, picking the one thing a doctor would care most about in this data. The member never sees this draft as-is.
Do not diagnose or mention medication. Do not invent records that are not in the data. Plain, kind English.

Data:
${data}`;
    }
    return `당신은 해빛스쿨(응급의학과 전문의가 만든 생활습관 앱)의 따뜻하고 실용적인 건강 습관 코치입니다.
아래는 회원 한 명의 최근 4주 기록을 숫자로 줄인 것입니다. 1주차가 가장 오래된 주입니다. null 은 "기록 안 함"입니다 — 0 이나 나빠진 것으로 읽지 마세요.
dietGradeAvg 는 끼니 등급 평균(A=4 … F=0)입니다. dietSignals 는 초가공식품·짠 음식·단 음식·채소 적은 끼니 수입니다.

한 달 코칭 편지를 짧게 써 주세요:
- headline: 이번 달 가장 큰 한 가지를 한 문장으로(40자 이내).
- summary: 4주가 어땠는지 2~3문장. 데이터의 실제 숫자를 넣어서.
- wins: 잘한 것 정확히 3가지. 각각 한 문장, 데이터의 숫자를 넣어서.
- nextSteps: 다음 4주에 바꿀 것 정확히 3가지. title 은 바꿀 것(짧게), how 는 바로 할 수 있는 행동 하나(언제·무엇을·얼마나). 데이터에서 가장 약한 부분을 고르세요. topFoods 의 음식 이름을 써도 좋습니다.
- caution: 혈당 평균 126 이상, 혈압 평균 140/90 이상, 수면 평균 5시간 미만 중 하나라도 있으면 병원 상담을 권하는 한 문장. 없으면 null.
- doctorDraft: 앱을 만든 응급의학과 전문의 최석재(해빛닥터)가 고쳐서 직접 보낼 **초안** 2~3문장. 그의 1인칭 목소리로, 이 데이터에서 의사가 가장 마음 쓸 한 가지를 짚어 주세요. 회원은 이 초안을 그대로 보지 않습니다.
진단하거나 약 이야기를 하지 마세요. 데이터에 없는 기록을 지어내지 마세요. 쉬운 존댓말로.

데이터:
${data}`;
}

function cleanText(value, max = 400) {
    return String(value || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** 모델 답을 화면에 그릴 모양으로 다듬는다. 모자라면 null — 그때는 돈을 받지 않는다. */
function normalizeCoachingReport(raw) {
    const data = raw && typeof raw === "object" ? raw : null;
    if (!data) return null;
    const wins = (Array.isArray(data.wins) ? data.wins : []).map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 3);
    const nextSteps = (Array.isArray(data.nextSteps) ? data.nextSteps : [])
        .map((item) => ({ title: cleanText(item?.title, 60), how: cleanText(item?.how, 240) }))
        .filter((item) => item.title && item.how)
        .slice(0, 3);
    const headline = cleanText(data.headline, 80);
    const summary = cleanText(data.summary, 500);
    if (!headline || !summary || wins.length < 1 || nextSteps.length < 1) return null;
    const caution = cleanText(data.caution, 200);
    const doctorDraft = String(data.doctorDraft || "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, 600);
    return { headline, summary, wins, nextSteps, caution: caution || null, doctorDraft };
}

const PURCHASE_ERRORS = {
    not_enough_points: ["failed-precondition", "포인트가 모자라요."],
    not_enough_days: ["failed-precondition", `최근 4주에 ${MONTHLY_COACHING_MIN_RECORDED_DAYS}일 이상 기록하면 받을 수 있어요.`],
};

async function writeCoachingLetter(summary, locale) {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: COACHING_RESPONSE_SCHEMA,
            maxOutputTokens: 4096,
            temperature: 0.6,
            thinkingConfig: { thinkingBudget: 0 },
        },
    });
    const result = await model.generateContent(buildCoachingPrompt(summary, locale));
    const text = result?.response?.text?.() || "";
    let parsed = null;
    try {
        parsed = JSON.parse(text);
    } catch (_) {
        parsed = null;
    }
    return normalizeCoachingReport(parsed);
}

exports.buyMonthlyCoaching = onCall(
    { secrets: [GEMINI_API_KEY], region: "asia-northeast3", maxInstances: 10, timeoutSeconds: 90 },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        const locale = String(request.data?.locale || "ko").toLowerCase().startsWith("en") ? "en" : "ko";

        const db = getDb();
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();
        if (!userSnap.exists) throw new HttpsError("not-found", "회원 정보를 찾지 못했어요.");
        const userData = userSnap.data() || {};
        const todayStr = getMemberToday(userData);
        const monthKey = coachingMonthKey(todayStr);
        const reportRef = db.doc(`users/${uid}/coachingReports/${monthKey}`);
        const ledgerRef = db.doc(`blockchain_transactions/${coachingLedgerId(uid, monthKey)}`);
        const queueRef = db.doc(`coaching_review_queue/${uid}_${monthKey}`);

        const existingSnap = await reportRef.get();
        if (existingSnap.exists) {
            return { month: monthKey, alreadyBought: true, cost: 0, coins: Number(userData.coins) || 0, report: existingSnap.data() };
        }

        const logsSnap = await db.collection("daily_logs")
            .where("userId", "==", uid)
            .where("date", ">=", addDays(todayStr, -(MONTHLY_COACHING_WINDOW_DAYS - 1)))
            .get();
        const summary = summarizeCoachingLogs(logsSnap.docs.map((docSnap) => docSnap.data() || {}), { todayStr });

        const reportsRef = db.collection(`users/${uid}/coachingReports`);
        const previousSnap = await reportsRef.limit(1).get();
        const precheck = decideCoachingPurchase({
            coins: userData.coins,
            recordedDays: summary.recordedDays,
            price: coachingPriceFor(previousSnap.size),
        });
        if (!precheck.ok) {
            const [code, message] = PURCHASE_ERRORS[precheck.reason];
            throw new HttpsError(code, message, { reason: precheck.reason, recordedDays: summary.recordedDays, price: precheck.price });
        }

        let letter = null;
        try {
            letter = await writeCoachingLetter(summary, locale);
        } catch (error) {
            console.error(`[monthly coaching] AI 실패 ${uid}:`, error?.message || error);
        }
        if (!letter) {
            throw new HttpsError("unavailable", "코칭 편지를 쓰지 못했어요. 포인트는 빠지지 않았어요. 잠시 뒤 다시 눌러 주세요.", { reason: "ai_failed" });
        }

        const result = await db.runTransaction(async (tx) => {
            const [freshUser, freshReport, ledgerSnap, previous] = await Promise.all([
                tx.get(userRef), tx.get(reportRef), tx.get(ledgerRef), tx.get(reportsRef.limit(1)),
            ]);
            const coins = Number(freshUser.data()?.coins) || 0;
            if (freshReport.exists) {
                return { alreadyBought: true, cost: 0, coins, report: freshReport.data() };
            }
            const price = coachingPriceFor(previous.size);
            const decision = decideCoachingPurchase({ existing: ledgerSnap.exists, coins, recordedDays: summary.recordedDays, price });
            if (!decision.ok) {
                const [code, message] = PURCHASE_ERRORS[decision.reason] || ["failed-precondition", "코칭을 받을 수 없어요."];
                throw new HttpsError(code, message, { reason: decision.reason });
            }
            const now = admin.firestore.FieldValue.serverTimestamp();
            const { doctorDraft, ...coachLetter } = letter;
            const doctorDueBy = addDays(todayStr, MONTHLY_COACHING_DOCTOR_DAYS);
            const report = {
                month: monthKey,
                locale,
                ...coachLetter,
                doctor: { status: "pending", dueBy: doctorDueBy },
                stats: {
                    from: summary.from,
                    to: summary.to,
                    recordedDays: summary.recordedDays,
                    weekly: summary.weekly,
                },
                cost: price,
                createdAt: now,
            };
            tx.set(reportRef, report);
            tx.set(queueRef, {
                uid,
                month: monthKey,
                locale,
                memberName: cleanText(freshUser.data()?.customDisplayName || freshUser.data()?.displayName || "", 40),
                status: "pending",
                dueBy: doctorDueBy,
                doctorDraft: doctorDraft || "",
                createdAt: now,
            });
            tx.set(ledgerRef, {
                userId: uid,
                uid,
                type: "monthly_coaching",
                month: monthKey,
                pointsUsed: price,
                date: todayStr,
                timestamp: now,
                status: "success",
            });
            tx.set(userRef, { coins: admin.firestore.FieldValue.increment(-price) }, { merge: true });
            return { alreadyBought: false, cost: price, coins: coins - price, report: { ...report, createdAt: null } };
        });

        console.log(`monthly coaching: ${uid} ${monthKey} cost=${result.cost} days=${summary.recordedDays} already=${result.alreadyBought}`);
        return { month: monthKey, ...result };
    }
);

async function assertAdmin(request) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");
    const adminSnap = await getDb().doc(`admins/${uid}`).get();
    if (!adminSnap.exists) throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    return uid;
}

function toMillis(value) {
    return typeof value?.toMillis === "function" ? value.toMillis() : null;
}

/** 관제탑: 해빛닥터 한마디를 기다리는 코칭. 오래된 것부터. 코치 편지와 4주 숫자를 함께 준다. */
exports.getCoachingReviewQueue = onCall(
    { region: "asia-northeast3", timeoutSeconds: 30 },
    async (request) => {
        await assertAdmin(request);
        const db = getDb();
        const snap = await db.collection("coaching_review_queue").where("status", "==", "pending").limit(100).get();
        const items = await Promise.all(snap.docs.map(async (docSnap) => {
            const item = docSnap.data() || {};
            const reportSnap = await db.doc(`users/${item.uid}/coachingReports/${item.month}`).get();
            const report = reportSnap.exists ? reportSnap.data() : {};
            return {
                id: docSnap.id,
                uid: item.uid,
                month: item.month,
                locale: item.locale || "ko",
                memberName: item.memberName || "",
                dueBy: item.dueBy || "",
                doctorDraft: item.doctorDraft || "",
                createdAtMs: toMillis(item.createdAt),
                coach: {
                    headline: report.headline || "",
                    summary: report.summary || "",
                    wins: report.wins || [],
                    nextSteps: report.nextSteps || [],
                    caution: report.caution || null,
                },
                stats: report.stats || null,
            };
        }));
        items.sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
        return { items, doctorDays: MONTHLY_COACHING_DOCTOR_DAYS };
    }
);

/**
 * 관제탑: 대표가 쓴 한마디를 회원의 코칭 편지에 붙인다. 대시보드의 해빛닥터 칸(adminFeedback)에도
 * 같은 글을 올려 회원이 앱을 열자마자 본다 — submitAdminFeedback 과 같은 자리·같은 기록이다.
 */
exports.sendCoachingDoctorNote = onCall(
    { region: "asia-northeast3", timeoutSeconds: 30 },
    async (request) => {
        const adminUid = await assertAdmin(request);
        const uid = String(request.data?.uid || "").trim();
        const month = String(request.data?.month || "").trim();
        const note = String(request.data?.note || "").trim();
        if (!uid || !/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "회원과 달을 골라 주세요.");
        if (!note) throw new HttpsError("invalid-argument", "한마디를 적어 주세요.");
        if (note.length > DOCTOR_NOTE_MAX_CHARS) throw new HttpsError("invalid-argument", `${DOCTOR_NOTE_MAX_CHARS}자 이내로 적어 주세요.`);

        const db = getDb();
        const reportRef = db.doc(`users/${uid}/coachingReports/${month}`);
        const queueRef = db.doc(`coaching_review_queue/${uid}_${month}`);
        const userRef = db.doc(`users/${uid}`);
        const feedbackRef = db.collection("admin_feedback").doc();

        const sent = await db.runTransaction(async (tx) => {
            const [reportSnap, userSnap] = await Promise.all([tx.get(reportRef), tx.get(userRef)]);
            if (!reportSnap.exists) throw new HttpsError("not-found", "코칭 편지를 찾지 못했어요.");
            const report = reportSnap.data() || {};
            const feedbackDate = getMemberToday(userSnap.data() || {});
            const now = admin.firestore.FieldValue.serverTimestamp();
            const locale = report.locale === "en" ? "en" : "ko";
            const summary = locale === "en" ? "Dr. Choi's note on your Haebit Coaching" : "해빛 코칭에 해빛닥터 최석재의 한마디";
            tx.set(reportRef, {
                doctor: { ...(report.doctor || {}), status: "sent", note, sentAt: now, adminUid },
            }, { merge: true });
            tx.set(queueRef, { status: "sent", sentAt: now, note, adminUid }, { merge: true });
            tx.set(userRef, { adminFeedback: note, adminFeedbackSummary: summary, feedbackDate }, { merge: true });
            tx.set(feedbackRef, {
                targetUserId: uid,
                message: note,
                summary,
                feedbackDate,
                draftKey: "monthly_coaching",
                coachingMonth: month,
                adminUid,
                createdAt: now,
            });
            return { feedbackDate };
        });
        console.log(`monthly coaching doctor note: ${uid} ${month} by ${adminUid}`);
        return { success: true, ...sent };
    }
);

exports._test = {
    MONTHLY_COACHING_COST,
    MONTHLY_COACHING_FIRST_COST,
    MONTHLY_COACHING_DOCTOR_DAYS,
    coachingPriceFor,
    MONTHLY_COACHING_MIN_RECORDED_DAYS,
    MONTHLY_COACHING_WINDOW_DAYS,
    buildCoachingPrompt,
    coachingLedgerId,
    coachingMonthKey,
    decideCoachingPurchase,
    normalizeCoachingReport,
    summarizeCoachingLogs,
};
