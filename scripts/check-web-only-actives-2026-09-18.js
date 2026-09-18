// 웹으로는 쓰는데 앱으로는 안 여는 회원을 센다. 읽기만 한다.
//
//   node scripts/check-web-only-actives-2026-09-18.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json
//
// 해빛스쿨 앱은 기존 웹 서비스의 TWA다. 테스터가 옵트인해도 평소 쓰던 웹을 계속
// 쓰면 Android 빌드에는 아무 활동도 남지 않는다(tasks/2026-08-31 메일에 적힌
// 진단). 그러면 부탁할 사람은 휴면 회원이 아니라 **이미 쓰고 있는데 웹으로만
// 쓰는 사람들**이다. 그 수가 몇인지에 따라 12명이 닿을 거리인지 아닌지가 갈린다.
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
    console.error("사용법: node scripts/check-web-only-actives-2026-09-18.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json");
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();

const MIN_TESTERS = 12;
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const shift = (dateStr, days) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
};

async function main() {
    const today = kstToday();

    const [usersSnap, logsSnap] = await Promise.all([
        db.collection("users").select("settings").get(),
        db.collection("daily_logs").where("date", ">=", shift(today, 30)).select("userId", "date").get(),
    ]);

    const appOpenByUid = new Map();
    usersSnap.forEach((d) => {
        const settings = (d.data() || {}).settings || {};
        if (settings.lastAppOpenDate) appOpenByUid.set(d.id, String(settings.lastAppOpenDate));
    });

    const lastLogByUid = new Map();
    logsSnap.forEach((d) => {
        const row = d.data() || {};
        if (!row.userId || !row.date) return;
        const prev = lastLogByUid.get(row.userId);
        if (!prev || row.date > prev) lastLogByUid.set(row.userId, row.date);
    });

    for (const windowDays of [7, 14, 30]) {
        const since = shift(today, windowDays);
        let active = 0;
        let onApp = 0;
        const webOnly = [];
        for (const [uid, lastDate] of lastLogByUid.entries()) {
            if (lastDate < since) continue;
            active += 1;
            const opened = appOpenByUid.get(uid);
            if (opened && opened >= since) onApp += 1;
            else webOnly.push(opened ? `앱 마지막 ${opened}` : "앱 기록 없음");
        }
        console.log(`── 최근 ${windowDays}일 안에 기록을 남긴 회원: ${active}명`);
        console.log(`   그중 앱으로도 여는 사람: ${onApp}명`);
        console.log(`   웹으로만 쓰는 사람: ${webOnly.length}명  ← 부탁할 대상`);
        const gap = MIN_TESTERS - onApp;
        if (gap > 0) {
            const rate = webOnly.length ? Math.ceil((gap / webOnly.length) * 100) : 0;
            console.log(`   12명까지 ${gap}명 부족 → 이 중 ${rate}% 가 앱으로 옮기면 채워진다`);
        } else {
            console.log("   12명 기준을 이미 넘었다");
        }
        console.log("");
    }

    // 앱을 한 번 열어 보고 돌아가지 않은 사람 — 가장 아까운 자리다.
    let openedOnce = 0;
    let openedRecently = 0;
    const since14 = shift(today, 14);
    for (const date of appOpenByUid.values()) {
        openedOnce += 1;
        if (date >= since14) openedRecently += 1;
    }
    console.log("앱을 한 번이라도 연 사람:", openedOnce, "명");
    console.log("그중 최근 14일 안에 연 사람:", openedRecently, "명");
    console.log("열었다가 14일 넘게 안 연 사람:", openedOnce - openedRecently, "명");
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("실패:", error);
    process.exit(1);
});
