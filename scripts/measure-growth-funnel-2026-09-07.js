// 확산이 왜 안 일어나는지 재기 전에, 이미 쌓인 데이터로 어디서 끊기는지 본다.
// 읽기만 한다 — 쓰기 경로가 없다.
//
//   node scripts/measure-growth-funnel-2026-09-07.js <serviceAccountKey.json> [--limit=N] [--out=경로]
//
// 왜 만들었나
//   초대 기계(링크·양방향 보상·자동 친구연결·동적 OG·GA 계측)는 4~9월에 걸쳐
//   다 만들어져 있는데 8월 초대 성공이 0건이다. 무엇을 더 만들지 정하기 전에
//   "이미 만든 것이 어디서 끊기는가"를 표본으로 확인한다.
//   tasks/lessons.md 2026-08-21 — "설계를 바꾸자는 제안은 표본부터 잰다."
//
// 재는 것
//   1. 활성화  — 가입 코호트별 첫 기록 도달률, 평생 기록일수 분포
//   2. 잔존    — 가입 N일 이후에도 기록이 남아 있는 비율 (D1/D7/D30)
//   3. 초대    — referredBy / 3일·7일 마일스톤 / friendships.source
//   4. 공유    — share_cards 실발행 건수 (GA share_card_sent 와 대조할 하한)
//   5. 사회성  — 친구 보유율, 소모임 인원, 댓글·리액션을 남긴 고유 인원
//   6. 풀루틴  — 공유 유도 시트가 열릴 수 있는 날이 실제로 얼마나 나오는가
//
// 출력에는 집계만 담는다. uid·이름·이메일은 어디에도 적지 않는다
// (public_stats/guest_activity 의 버킷 원칙과 같은 기준).

const fs = require("fs");
const path = require("path");

// 이 저장소 루트에는 firebase-admin이 없다. functions/ 쪽 설치본을 쓴다.
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const args = process.argv.slice(2);
const keyPath = args.find(a => !a.startsWith("--"));
const limitArg = args.find(a => a.startsWith("--limit="));
const outArg = args.find(a => a.startsWith("--out="));

const SCAN_LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 0;
const OUT_PATH = outArg
    ? outArg.split("=").slice(1).join("=")
    : path.join(__dirname, "..", "tasks", "2026-09-07_growth_funnel_baseline.md");

// 키를 인자로 주는 것이 이 저장소의 관례지만(measure-mvp-score-distribution 과 같다),
// GOOGLE_APPLICATION_CREDENTIALS 나 gcloud ADC 로 이미 붙어 있으면 그대로 쓴다.
// 자격증명을 어디서 얻었는지는 반드시 찍는다 — 어느 프로젝트를 읽었는지 모르면
// 숫자를 믿을 수 없다.
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
        console.error("  node scripts/measure-growth-funnel-2026-09-07.js <serviceAccountKey.json> [--limit=N] [--out=경로]");
        process.exit(1);
    }
}
const db = admin.firestore();

// ---------- KST 날짜 ----------
// daily_logs.date 는 이미 KST 'YYYY-MM-DD' 문자열이다. createdAt 만 변환하면 된다.
const KST_FMT = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
});
const toKstDateKey = (value) => {
    if (!value) return "";
    const d = value && value.toDate ? value.toDate() : (value instanceof Date ? value : new Date(value));
    if (!d || Number.isNaN(d.getTime())) return "";
    return KST_FMT.format(d); // en-CA => YYYY-MM-DD
};
const dayOrdinal = (key) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return NaN;
    const parts = key.split("-").map(Number);
    return Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000;
};
const TODAY = toKstDateKey(new Date());
const TODAY_ORD = dayOrdinal(TODAY);
const monthOf = (key) => (/^\d{4}-\d{2}/.test(key) ? key.slice(0, 7) : "");
const THIS_MONTH = monthOf(TODAY);

// ---------- 스트리밍 스캔 ----------
// .get() 으로 수만 건을 한 번에 들지 않는다. 카운터만 들고 흘려보낸다.
async function scan(collection, fields, onDoc) {
    let query = db.collection(collection);
    if (fields && fields.length) query = query.select.apply(query, fields);
    if (SCAN_LIMIT > 0) query = query.limit(SCAN_LIMIT);
    let n = 0;
    await new Promise((resolve, reject) => {
        query.stream()
            .on("data", (docSnap) => { n += 1; onDoc(docSnap); })
            .on("end", resolve)
            .on("error", reject);
    });
    return n;
}

const pct = (num, den) => (den > 0 ? ((num / den) * 100).toFixed(1) + "%" : "—");

// 맵이든 배열이든 "실제로 뭔가 들어 있나". {} 와 [] 는 없는 것으로 본다 —
// 필드가 있다는 사실만으로 그 단계를 밟았다고 세면 안 된다.
const hasContent = (v) => {
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
};

async function main() {
    if (SCAN_LIMIT > 0) console.log("⚠️  --limit=" + SCAN_LIMIT + " 소표본 모드. 비율을 신뢰하지 말 것.\n");

    // ===== 1. users =====
    // 가입 직후 단계 표식도 같이 읽는다. 기록이 0인 사람이 "어디까지 갔다가
    // 멈췄는지" 는 daily_logs 로는 안 보이고 users 문서에만 남는다.
    const users = new Map();
    const usersRead = await scan("users",
        ["createdAt", "referredBy", "referralDay3BonusGiven", "referralDay7BonusGiven",
            "consents", "referralCode", "welcomeBonusGiven", "settings",
            "weeklyMissionData", "selectedMissions", "healthProfile", "onboardingComplete"],
        (s) => {
            const d = s.data() || {};
            const settings = d.settings || {};
            users.set(s.id, {
                createdKey: toKstDateKey(d.createdAt),
                referredBy: String(d.referredBy || "").trim(),
                day3: d.referralDay3BonusGiven === true,
                day7: d.referralDay7BonusGiven === true,
                // --- 단계 표식 ---
                consents: hasContent(d.consents),
                referralCode: !!String(d.referralCode || "").trim(),
                welcome: d.welcomeBonusGiven === true,
                // settings.primaryHabit 은 온보딩 모달에서 습관을 실제로 고른
                // 사람에게만 찍힌다 (js/app-core.js:24244). 이것이 진짜 신호다.
                primaryHabit: !!String(settings.primaryHabit || "").trim(),
                // onboardingComplete 는 모달을 못 본 기존 회원에게도 자동으로
                // 찍힌다 (js/app-core.js:24407). 단계로 쓰면 안 되고, 위와의
                // 차이를 보기 위해서만 센다.
                onboardingFlag: d.onboardingComplete === true,
                mission: hasContent(d.weeklyMissionData) || hasContent(d.selectedMissions),
                healthProfile: hasContent(d.healthProfile),
            });
        });
    console.log("users               " + usersRead + "건 읽음");

    // ===== 2. daily_logs =====
    // uid 별 기록일 집합과 포인트 획득일 집합을 따로 둔다.
    // "문서는 있는데 포인트가 0" 과 "진짜 기록" 은 다른 상태다.
    const logDays = new Map();     // uid -> Set(dateKey)
    let fullRoutineDays30 = 0;     // 최근 30일 중 65P 이상인 기록일 수
    const fullRoutineUsers30 = new Set();
    let logsWithPoints = 0;

    const logsRead = await scan("daily_logs", ["userId", "date", "awardedPoints"], (s) => {
        const d = s.data() || {};
        const uid = String(d.userId || "").trim();
        const date = String(d.date || "").trim();
        if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

        if (!logDays.has(uid)) logDays.set(uid, new Set());
        logDays.get(uid).add(date);

        const ap = d.awardedPoints || {};
        const total = (Number(ap.dietPoints) || 0) + (Number(ap.exercisePoints) || 0) + (Number(ap.mindPoints) || 0);
        if (total > 0) logsWithPoints += 1;

        // 공유 유도 시트의 한쪽 조건: 풀 루틴 65P (DASHBOARD_DAILY_POINT_GOAL)
        const age = TODAY_ORD - dayOrdinal(date);
        if (age >= 0 && age < 30 && total >= 65) {
            fullRoutineDays30 += 1;
            fullRoutineUsers30.add(uid);
        }
    });
    console.log("daily_logs          " + logsRead + "건 읽음");

    // ===== 3. friendships =====
    const friendSources = new Map();
    const hasFriend = new Set();
    const fsRead = await scan("friendships", ["users", "status", "source"], (s) => {
        const d = s.data() || {};
        const src = String(d.source || "").trim() || "(없음)";
        friendSources.set(src, (friendSources.get(src) || 0) + 1);
        if (d.status === "active" && Array.isArray(d.users)) {
            d.users.forEach(u => { if (u) hasFriend.add(u); });
        }
    });
    console.log("friendships         " + fsRead + "건 읽음");

    // ===== 4. share_cards =====
    // 30일 TTL 이라 최근 30일치만 남아 있다. 플랫폼 모달(카카오·인스타·페북·X·블로그)
    // 경로는 문서를 만들지 않으므로 이 값은 실제 공유 건수의 하한이다.
    const sharers = new Set();
    const shareByMonth = new Map();
    const scRead = await scan("share_cards", ["userId", "createdAt"], (s) => {
        const d = s.data() || {};
        if (d.userId) sharers.add(d.userId);
        const m = monthOf(toKstDateKey(d.createdAt));
        if (m) shareByMonth.set(m, (shareByMonth.get(m) || 0) + 1);
    });
    console.log("share_cards         " + scRead + "건 읽음");

    // ===== 5. habit_group_members =====
    const groupCounts = new Map();
    const inAnyGroup = new Set();
    const hgRead = await scan("habit_group_members", ["groupId", "uid", "active"], (s) => {
        const d = s.data() || {};
        if (d.active === false) return;
        const g = String(d.groupId || "").trim() || "(미상)";
        groupCounts.set(g, (groupCounts.get(g) || 0) + 1);
        if (d.uid) inAnyGroup.add(d.uid);
    });
    console.log("habit_group_members " + hgRead + "건 읽음");

    // ===== 6. gallery_posts — 이번 달 댓글·리액션을 "남긴" 고유 인원 =====
    // functions/mvp-score.js 가 경고하는 대로 daily_logs 가 아니라 gallery_posts 를 읽는다.
    // 문서 id 가 {uid}_{YYYY-MM-DD} 라 날짜는 id 에서 뽑는다(hideDate 면 date 필드가 없다).
    const commenters = new Set();
    const reactors = new Set();
    let commentCount = 0;
    let reactionCount = 0;
    const gpRead = await scan("gallery_posts", ["comments", "reactions"], (s) => {
        const m = s.id.match(/_(\d{4}-\d{2}-\d{2})$/);
        if (!m || monthOf(m[1]) !== THIS_MONTH) return;
        const d = s.data() || {};
        (Array.isArray(d.comments) ? d.comments : []).forEach(c => {
            if (c && c.userId) { commenters.add(c.userId); commentCount += 1; }
        });
        const r = d.reactions || {};
        ["heart", "fire", "clap"].forEach(t => {
            (Array.isArray(r[t]) ? r[t] : []).forEach(uid => {
                if (uid) { reactors.add(uid); reactionCount += 1; }
            });
        });
    });
    console.log("gallery_posts       " + gpRead + "건 읽음");

    // ===== 교차 검증용 =====
    let communityStats = null;
    try {
        const snap = await db.doc("meta/communityStats").get();
        if (snap.exists) communityStats = snap.data() || null;
    } catch (e) {
        console.warn("meta/communityStats 읽기 실패:", (e && e.message) || e);
    }

    // ================= 집계 =================
    const daysOf = (uid) => {
        const set = logDays.get(uid);
        return set ? set.size : 0;
    };
    const activeIn = (uid, windowDays) => {
        const set = logDays.get(uid);
        if (!set) return false;
        for (const d of set) {
            const age = TODAY_ORD - dayOrdinal(d);
            if (age >= 0 && age < windowDays) return true;
        }
        return false;
    };
    // 잔존 = 가입 N일 이후에도 기록이 한 번이라도 있는가 (생존 정의).
    // 가입 후 N일이 아직 안 지난 사람은 분모에서 뺀다.
    const survivedTo = (uid, createdKey, n) => {
        const set = logDays.get(uid);
        if (!set) return false;
        const c = dayOrdinal(createdKey);
        for (const d of set) if (dayOrdinal(d) - c >= n) return true;
        return false;
    };

    // --- 코호트 ---
    const cohorts = new Map(); // 'YYYY-MM' -> rows
    for (const entry of users) {
        const uid = entry[0];
        const u = entry[1];
        const m = monthOf(u.createdKey);
        if (!m) continue;
        if (!cohorts.has(m)) cohorts.set(m, {
            n: 0, everLogged: 0, threePlus: 0, active30: 0,
            d1n: 0, d1: 0, d7n: 0, d7: 0, d30n: 0, d30: 0, referred: 0
        });
        const c = cohorts.get(m);
        c.n += 1;
        const days = daysOf(uid);
        if (days >= 1) c.everLogged += 1;
        if (days >= 3) c.threePlus += 1;
        if (activeIn(uid, 30)) c.active30 += 1;
        if (u.referredBy) c.referred += 1;

        const age = TODAY_ORD - dayOrdinal(u.createdKey);
        [[1, "d1"], [7, "d7"], [30, "d30"]].forEach(pair => {
            const n = pair[0], k = pair[1];
            if (age >= n) {
                c[k + "n"] += 1;
                if (survivedTo(uid, u.createdKey, n)) c[k] += 1;
            }
        });
    }

    // --- 평생 기록일수 분포 ---
    const buckets = { "0일": 0, "1일": 0, "2일": 0, "3-6일": 0, "7-29일": 0, "30일+": 0 };
    for (const uid of users.keys()) {
        const d = daysOf(uid);
        if (d === 0) buckets["0일"] += 1;
        else if (d === 1) buckets["1일"] += 1;
        else if (d === 2) buckets["2일"] += 1;
        else if (d <= 6) buckets["3-6일"] += 1;
        else if (d <= 29) buckets["7-29일"] += 1;
        else buckets["30일+"] += 1;
    }

    // --- 초대 ---
    let referredTotal = 0, day3Total = 0, day7Total = 0;
    const referredByMonth = new Map();
    for (const u of users.values()) {
        if (u.referredBy) {
            referredTotal += 1;
            const m = monthOf(u.createdKey);
            if (m) referredByMonth.set(m, (referredByMonth.get(m) || 0) + 1);
        }
        if (u.day3) day3Total += 1;
        if (u.day7) day7Total += 1;
    }

    // --- 활성 코어 ---
    const active30 = Array.from(users.keys()).filter(uid => activeIn(uid, 30));
    const activeWithFriend = active30.filter(uid => hasFriend.has(uid)).length;
    const activeInGroup = active30.filter(uid => inAnyGroup.has(uid)).length;

    // ================= 출력 =================
    const L = [];
    const w = (s) => L.push(s === undefined ? "" : s);

    w("# 확산 퍼널 기준선 (" + TODAY + " 측정)");
    w();
    w("`scripts/measure-growth-funnel-2026-09-07.js` 출력. 읽기 전용.");
    w("판정 규칙은 `tasks/2026-09-07_확산진단_계획.md` 의 C 표를 따른다 — 숫자를 보고 해석을 고르지 않는다.");
    w("해석은 `tasks/2026-09-07_확산진단_판정.md` 에 따로 적는다.");
    w("**이 파일은 스크립트가 통째로 덮어쓴다.** 손으로 쓴 내용을 여기 두지 말 것.");
    if (SCAN_LIMIT > 0) {
        w();
        w("> ⚠️ `--limit=" + SCAN_LIMIT + "` 소표본. 비율은 신뢰하지 말 것.");
    }
    w();
    w("읽은 문서: users " + usersRead + " · daily_logs " + logsRead + " · friendships " + fsRead
        + " · share_cards " + scRead + " · habit_group_members " + hgRead + " · gallery_posts " + gpRead);
    w();

    w("## 1. 활성화 — 가입 코호트별");
    w();
    w("| 가입월 | 가입 | 기록 1회+ | 3일+ | 최근 30일 활성 | 초대 유입 |");
    w("|---|---:|---:|---:|---:|---:|");
    Array.from(cohorts.keys()).sort().forEach(m => {
        const c = cohorts.get(m);
        w("| " + m + " | " + c.n
            + " | " + c.everLogged + " (" + pct(c.everLogged, c.n) + ")"
            + " | " + c.threePlus + " (" + pct(c.threePlus, c.n) + ")"
            + " | " + c.active30 + " (" + pct(c.active30, c.n) + ")"
            + " | " + c.referred + " |");
    });
    const totN = users.size;
    const totEver = Array.from(users.keys()).filter(u => daysOf(u) >= 1).length;
    const tot3 = Array.from(users.keys()).filter(u => daysOf(u) >= 3).length;
    w("| **전체** | **" + totN + "**"
        + " | **" + totEver + " (" + pct(totEver, totN) + ")**"
        + " | **" + tot3 + " (" + pct(tot3, totN) + ")**"
        + " | **" + active30.length + " (" + pct(active30.length, totN) + ")**"
        + " | **" + referredTotal + "** |");
    w();
    w("### 평생 기록일수 분포");
    w();
    w("| 기록일수 | 인원 | 비중 |");
    w("|---|---:|---:|");
    Object.keys(buckets).forEach(k => w("| " + k + " | " + buckets[k] + " | " + pct(buckets[k], totN) + " |"));
    w();
    w("> 0–1일이 과반이면 병목은 잔존이 아니라 **첫 기록**이다.");
    w();
    w("포인트를 실제로 받은 기록: " + logsWithPoints + " / " + logsRead + "건");
    w();

    // ---- 1-B. 기록이 0인 사람은 어디까지 갔다가 멈췄나 ----
    const never = [];
    const ever = [];
    for (const uid of users.keys()) (daysOf(uid) === 0 ? never : ever).push(uid);

    const flagRow = (label, key, note) => {
        const n = never.filter(u => users.get(u)[key]).length;
        const e = ever.filter(u => users.get(u)[key]).length;
        w("| " + label + " | " + n + " (" + pct(n, never.length) + ")"
            + " | " + e + " (" + pct(e, ever.length) + ") | " + (note || "") + " |");
    };

    w("## 1-B. 기록이 0인 " + never.length + "명은 어디까지 갔나");
    w();
    w("`daily_logs` 에는 아무것도 없으므로 `users` 문서의 단계 표식으로 가른다.");
    w();
    w("| 단계 표식 | 기록 0명 (" + never.length + ") | 기록 있는 사람 (" + ever.length + ") | 비고 |");
    w("|---|---:|---:|---|");
    flagRow("`referralCode` 발급", "referralCode", "로그인 직후 서버가 자동 발급");
    flagRow("웰컴 200P 지급", "welcome", "자동");
    flagRow("**온보딩 습관 선택** (`settings.primaryHabit`)", "primaryHabit", "**모달에서 실제로 고름**");
    flagRow("`onboardingComplete` 플래그", "onboardingFlag", "자동 표시 포함 — 단계로 쓰지 말 것");
    flagRow("주간 미션 선택", "mission", "");
    flagRow("기본 정보 입력 (`healthProfile`)", "healthProfile", "");
    w();
    w("> `onboardingComplete` 와 `settings.primaryHabit` 의 차이가 곧 **모달을 보지 못한 채**");
    w("> 완료로 찍힌 인원이다 (`js/app-core.js:24407` 이 자동으로 찍는다). 온보딩을 실제로");
    w("> 통과한 사람은 `primaryHabit` 쪽이다.");
    w();

    // 가장 멀리 간 단계. 표식이 완전히 중첩되지는 않으므로 "가장 높은 단계"로 센다.
    const LADDER = [
        ["아무 표식 없음 — 가입 직후 이탈", null],
        ["로그인 부트스트랩만 (`referralCode`/웰컴)", "boot"],
        ["온보딩에서 습관 선택", "primaryHabit"],
        ["주간 미션 선택", "mission"],
        ["기본 정보 입력", "healthProfile"],
    ];
    const furthest = new Array(LADDER.length).fill(0);
    never.forEach(uid => {
        const u = users.get(uid);
        let idx = 0;
        if (u.referralCode || u.welcome) idx = 1;
        if (u.primaryHabit) idx = 2;
        if (u.mission) idx = 3;
        if (u.healthProfile) idx = 4;
        furthest[idx] += 1;
    });
    w("### 가장 멀리 간 단계 (기록 0인 " + never.length + "명)");
    w();
    w("| 여기까지 가고 멈춤 | 인원 | 비중 |");
    w("|---|---:|---:|");
    LADDER.forEach((row, i) => w("| " + row[0] + " | " + furthest[i] + " | " + pct(furthest[i], never.length) + " |"));
    w();

    // consents 는 단계로 쓰지 않는다 — 인프라 사고로 오염된 구간이 있다.
    const consentNever = never.filter(u => users.get(u).consents).length;
    const consentEver = ever.filter(u => users.get(u).consents).length;
    w("동의 기록(`consents`) 보유: 기록 0명 " + consentNever + " (" + pct(consentNever, never.length) + ")"
        + " · 기록 있는 사람 " + consentEver + " (" + pct(consentEver, ever.length) + ")");
    w();
    w("> **`consents` 는 단계로 읽지 말 것.** `firestore.rules` 화이트리스트에서 빠진 채");
    w("> 배포돼 2026-08-11~15 사이 모든 동의 기록 쓰기가 `permission-denied` 로 거부됐다");
    w("> (CLAUDE.md 에 기록됨). 그 이전 가입자의 공백은 사용자 행동이 아니라 인프라 사고다.");
    w();

    w("## 2. 잔존 — 가입 N일 이후에도 기록이 있는 비율");
    w();
    w("분모는 가입 후 N일이 지난 사람만. \"그날 접속\"이 아니라 \"그 이후 기록이 한 번이라도 있음\"(생존).");
    w();
    w("| 가입월 | D1 | D7 | D30 |");
    w("|---|---:|---:|---:|");
    Array.from(cohorts.keys()).sort().forEach(m => {
        const c = cohorts.get(m);
        w("| " + m
            + " | " + c.d1 + "/" + c.d1n + " (" + pct(c.d1, c.d1n) + ")"
            + " | " + c.d7 + "/" + c.d7n + " (" + pct(c.d7, c.d7n) + ")"
            + " | " + c.d30 + "/" + c.d30n + " (" + pct(c.d30, c.d30n) + ")" + " |");
    });
    w();

    w("## 3. 초대 퍼널 (Firestore 쪽 진실)");
    w();
    w("| 항목 | 값 |");
    w("|---|---:|");
    w("| `referredBy` 보유 회원 | " + referredTotal + " / " + totN + " (" + pct(referredTotal, totN) + ") |");
    w("| 3일 마일스톤 달성 (`referralDay3BonusGiven`) | " + day3Total + " |");
    w("| 7일 마일스톤 달성 (`referralDay7BonusGiven`) | " + day7Total + " |");
    w();
    w("초대 유입 — 가입월별: "
        + (Array.from(referredByMonth.keys()).sort().map(m => m + " " + referredByMonth.get(m) + "명").join(" · ") || "없음"));
    w();
    w("### friendships.source 별");
    w();
    w("| source | 건수 |");
    w("|---|---:|");
    Array.from(friendSources.entries()).sort((a, b) => b[1] - a[1])
        .forEach(e => w("| `" + e[0] + "` | " + e[1] + " |"));
    w();

    w("## 4. 실제로 나간 공유 (하한)");
    w();
    w("| 항목 | 값 |");
    w("|---|---:|");
    w("| `share_cards` 문서 (30일 TTL) | " + scRead + " |");
    w("| 카드를 내보낸 고유 회원 | " + sharers.size + " |");
    w();
    w("월별: " + (Array.from(shareByMonth.keys()).sort().map(m => m + " " + shareByMonth.get(m) + "건").join(" · ") || "없음"));
    w();
    w("> **이 값은 하한이다.** `shareFileToAppsOrFallback()` (카카오·인스타·페북·X·블로그)");
    w("> 는 `publishShareCardForPreview()` 를 부르지 않는다. GA 의 `share_card_sent`");
    w("> 총건수에서 이 값을 빼면 **초대 코드가 빠진 채 나간 공유 건수**가 된다.");
    w();

    w("## 5. 혼자 하는 구조인가");
    w();
    w("| 항목 | 값 |");
    w("|---|---:|");
    w("| 최근 30일 활성 회원 | " + active30.length + " |");
    w("| 그중 활성 친구 1명 이상 | " + activeWithFriend + " (" + pct(activeWithFriend, active30.length) + ") |");
    w("| 그중 소모임 참여 | " + activeInGroup + " (" + pct(activeInGroup, active30.length) + ") |");
    w("| " + THIS_MONTH + " 댓글을 남긴 고유 인원 | " + commenters.size + " (댓글 " + commentCount + "개) |");
    w("| " + THIS_MONTH + " 리액션을 남긴 고유 인원 | " + reactors.size + " (리액션 " + reactionCount + "개) |");
    w();
    w("### 소모임별 인원");
    w();
    w("| 소모임 | 인원 |");
    w("|---|---:|");
    Array.from(groupCounts.entries()).sort((a, b) => b[1] - a[1])
        .forEach(e => w("| `" + e[0] + "` | " + e[1] + " |"));
    w();

    w("## 6. 공유 유도 시트가 열릴 수 있는 날 (최근 30일)");
    w();
    w("`maybeShowShareAfterSave` 는 **풀 루틴 65P** 이거나 **20시 이후** 저장일 때만 열린다.");
    w("시각은 Firestore 에 없으므로 65P 쪽만 잰다 — 아래는 하한이다.");
    w();
    w("| 항목 | 값 |");
    w("|---|---:|");
    w("| 65P 이상인 기록일 | " + fullRoutineDays30 + " |");
    w("| 그런 날이 하루라도 있는 회원 | " + fullRoutineUsers30.size + " |");
    w();

    w("## 7. 교차 검증 — `meta/communityStats`");
    w();
    if (communityStats) {
        w("| 항목 | communityStats | 이 스크립트 |");
        w("|---|---:|---:|");
        w("| 월 | " + (communityStats.month || "—") + " | " + THIS_MONTH + " |");
        w("| 활성 회원 | " + (communityStats.totalUsers != null ? communityStats.totalUsers : "—") + " | " + active30.length + " (최근 30일) |");
        w("| 댓글 | " + (communityStats.totalComments != null ? communityStats.totalComments : "—") + " | " + commentCount + " |");
        w("| 리액션 | " + (communityStats.totalReactions != null ? communityStats.totalReactions : "—") + " | " + reactionCount + " |");
        w();
        w("> 창이 다르다(달력 월 vs 최근 30일). 크게 어긋나면 스크립트가 아니라");
        w("> **어느 쪽이 맞는지부터** 본다 — lessons.md: \"0은 값이 없다가 아니라 읽는 곳이 틀렸다의 신호일 수 있다.\"");
    } else {
        w("`meta/communityStats` 를 읽지 못했다.");
    }
    w();

    w("## 8. GA4 에서 채울 칸 (Firestore 가 못 보는 구간)");
    w();
    w("속성 `G-ZS22SSRLY6` → 보고서 → 참여도 → 이벤트, 기간 2026-08-01 ~ " + TODAY + ".");
    w();
    w("| 이벤트 | 건수 | 무엇을 말하는가 |");
    w("|---|---:|---|");
    w("| `guest_demo_start` |  | 데모를 시작한다 |");
    w("| `guest_demo_signup_click` |  | 데모가 가입으로 이어지나 |");
    w("| `auth_result` |  | 로그인까지 온다 |");
    w("| `first_record_start` |  | 첫 기록을 시작한다 |");
    w("| `record_saved` |  | 실제로 저장한다 |");
    w("| **`share_prompt_shown`** |  | 공유를 권할 순간이 오기는 하나 |");
    w("| **`share_card_sent`** |  | 권했을 때 실제로 내보내나 |");
    w("| ↳ `share_method=platform_modal` |  | **초대 코드가 빠지는 경로** |");
    w("| ↳ `share_method=download` |  | **초대 코드가 빠지는 경로** |");
    w("| ↳ `share_method=web_share_files` |  | 코드가 붙는 경로 |");
    w("| ↳ `share_method=clipboard` |  | 코드가 붙는 경로 |");
    w("| **`invite_link_landing`** |  | 받은 사람이 누르나 |");
    w("| `day3_activated` |  | 3일 안에 2일 이상 |");
    w("| `week2_return` |  | 2주차 복귀 |");
    w();

    const out = L.join("\n") + "\n";
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, out, "utf8");
    console.log("\n" + out);
    console.log("\n→ " + OUT_PATH);
}

main().then(() => process.exit(0)).catch(err => {
    // ADC 는 initializeApp 에서 안 터지고 첫 조회에서 터진다. 그 스택만 보면
    // "자격증명이 없다" 가 "프로젝트 ID 를 못 찾는다" 로 보인다. 번역해 준다.
    const msg = String((err && err.message) || err);
    if (/Unable to detect a Project Id|Could not load the default credentials|UNAUTHENTICATED|PERMISSION_DENIED/i.test(msg)) {
        console.error("\n자격증명이 없거나 권한이 없다. 서비스 계정 키 경로를 넘길 것:\n");
        console.error("  node scripts/measure-growth-funnel-2026-09-07.js <serviceAccountKey.json>\n");
        console.error("원본 오류: " + msg);
        process.exit(1);
    }
    console.error(err);
    process.exit(1);
});
