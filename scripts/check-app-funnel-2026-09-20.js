// 앱으로 옮겨 가는 길의 세 단계를 한 번에 본다. 읽기만 한다.
//
//   node scripts/check-app-funnel-2026-09-20.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json
//
// 2026-09-19 에 세 가지가 함께 나갔다.
//   settings.lastWebPlatform      — 웹으로 연 기기(android/ios/desktop)
//   settings.lastAppInviteTapDate — 앱 권유 배너를 누른 날
//   settings.lastAppOpenDate      — 앱으로 연 날
//
// 이 셋이 있어야 "안 오른다" 를 셋으로 가를 수 있다.
//   안드로이드 웹인데 안 누름 → 문구가 약하다
//   눌렀는데 앱 실행이 없음   → 설치 단계에서 막힌다
//   아이폰이 대부분           → 12명은 애초에 닿을 수 없는 숫자다
//
// 출력에는 집계만 담는다. uid·이름·이메일은 적지 않는다.

const path = require("path");
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const keyPath = process.argv[2];
if (!keyPath) {
    console.error("사용법: node scripts/check-app-funnel-2026-09-20.js <서비스계정키>");
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();

const MIN_TESTERS = 12;
const WINDOW_DAYS = 14;
const REAPPLY_DATE = "2026-09-30";

const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const shift = (d, n) => {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() - n);
    return x.toISOString().slice(0, 10);
};

async function main() {
    const today = kstToday();
    const since14 = shift(today, WINDOW_DAYS);
    const since30 = shift(today, 30);

    const [usersSnap, logsSnap] = await Promise.all([
        db.collection("users").select("settings").get(),
        db.collection("daily_logs").where("date", ">=", since30).select("userId", "date").get(),
    ]);

    const active = new Set();
    logsSnap.forEach((d) => {
        const row = d.data() || {};
        if (row.userId) active.add(row.userId);
    });

    const platform = new Map();
    let appOpenEver = 0;
    let appOpenInWindow = 0;
    let tapped = 0;
    let tappedThenOpened = 0;
    let androidWeb = 0;
    let androidWebActive = 0;
    const openDates = new Map();
    const tapDates = new Map();

    usersSnap.forEach((docSnap) => {
        const s = (docSnap.data() || {}).settings || {};
        const isActive = active.has(docSnap.id);

        const web = String(s.lastWebPlatform || "");
        if (web) {
            platform.set(web, (platform.get(web) || 0) + 1);
            if (web === "android") {
                androidWeb += 1;
                if (isActive) androidWebActive += 1;
            }
        }

        const opened = String(s.lastAppOpenDate || "");
        if (opened) {
            appOpenEver += 1;
            openDates.set(opened, (openDates.get(opened) || 0) + 1);
            if (opened >= since14) appOpenInWindow += 1;
        }

        const tap = String(s.lastAppInviteTapDate || "");
        if (tap) {
            tapped += 1;
            tapDates.set(tap, (tapDates.get(tap) || 0) + 1);
            if (opened) tappedThenOpened += 1;
        }
    });

    console.log("오늘(KST):", today);
    console.log("");
    console.log("━━ 1. 앱 실행 (Play 기준) ━━");
    console.log("  최근 14일 안에 앱을 연 회원:", appOpenInWindow, "명 / 필요", MIN_TESTERS, "명");
    console.log("  한 번이라도 연 회원:", appOpenEver, "명");
    console.log("  날짜별(최근순):");
    [...openDates.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 8)
        .forEach(([d, n]) => console.log(`    ${d}: ${n}명`));

    console.log("");
    console.log("━━ 2. 웹으로 여는 기기 ━━");
    if (platform.size === 0) {
        console.log("  아직 기록 없음 — 어제 배포됐으니 하루 이틀 더 필요하다");
    } else {
        [...platform.entries()].sort((a, b) => b[1] - a[1])
            .forEach(([k, n]) => console.log(`  ${k}: ${n}명`));
        console.log("  그중 안드로이드 · 최근 30일 활동:", androidWebActive, "명  ← 배너가 보이는 사람");
    }

    console.log("");
    console.log("━━ 3. 배너 ━━");
    console.log("  누른 사람:", tapped, "명");
    console.log("  누르고 앱까지 연 사람:", tappedThenOpened, "명");
    if (tapDates.size) {
        [...tapDates.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .forEach(([d, n]) => console.log(`    ${d}: ${n}명`));
    }

    const daysLeft = Math.round(
        (new Date(`${REAPPLY_DATE}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000
    );
    console.log("");
    console.log("━━ 판단 ━━");
    const gap = MIN_TESTERS - appOpenInWindow;
    console.log(gap > 0 ? `  ${gap}명 부족 · 재신청까지 ${daysLeft}일` : `  기준 충족(+${-gap}) · 재신청까지 ${daysLeft}일`);
    if (androidWebActive > 0) {
        console.log(`  배너가 닿는 모수 ${androidWebActive}명 중 ${gap}명이면 ${Math.ceil((gap / androidWebActive) * 100)}%`);
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
