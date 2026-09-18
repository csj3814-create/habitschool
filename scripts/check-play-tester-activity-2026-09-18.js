// Play 비공개 테스트 참여도를 센다. 읽기만 한다.
//
//   node scripts/check-play-tester-activity-2026-09-18.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json
//
// 2026-08-29 프로덕션 액세스 반려 사유 두 가지 중 하나가 '테스터 미참여' 였다.
// Google 기준은 **연속 14일 동안 12명 이상**이 비공개 테스트에 참여하는 것이다.
//
// 앱(안드로이드 셸)으로 열면 settings.lastAppOpenDate 에 그날 날짜가 남는다
// (js/app-core.js recordNativeAppOpen, 하루 한 번). 그 값으로 센다.
//
// 이 숫자가 12에 못 미치면 9/30 재신청은 하지 않는 편이 낫다. 세 번째 반려는
// 다음 신청을 더 어렵게 만든다.
//
// 출력에는 집계와 날짜별 인원만 담는다. uid·이름·이메일은 적지 않는다.

const path = require("path");
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const keyPath = process.argv[2];
if (!keyPath) {
    console.error("사용법: node scripts/check-play-tester-activity-2026-09-18.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json");
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();

// functions/runtime.js 와 같은 값이어야 한다.
const MIN_TESTERS = 12;
const WINDOW_DAYS = 14;
const REAPPLY_DATE = "2026-09-30";

const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const shift = (dateStr, days) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
};

async function main() {
    const today = kstToday();
    const since = shift(today, WINDOW_DAYS);

    const snap = await db.collection("users")
        .select("settings")
        .get();

    const byDate = new Map();
    const bySource = new Map();
    let everOpened = 0;
    let inWindow = 0;

    snap.forEach((docSnap) => {
        const settings = (docSnap.data() || {}).settings || {};
        const date = String(settings.lastAppOpenDate || "");
        if (!date) return;
        everOpened += 1;
        if (date < since) return;
        inWindow += 1;
        byDate.set(date, (byDate.get(date) || 0) + 1);
        const source = String(settings.lastAppOpenSource || "(모름)");
        bySource.set(source, (bySource.get(source) || 0) + 1);
    });

    console.log("오늘(KST):", today, "· 창:", since, "~", today, `(${WINDOW_DAYS}일)`);
    console.log("");
    console.log("앱으로 연 적이 한 번이라도 있는 회원:", everOpened, "명");
    console.log(`최근 ${WINDOW_DAYS}일 안에 앱을 연 회원:`, inWindow, "명");
    console.log("필요한 인원:", MIN_TESTERS, "명");
    console.log(inWindow >= MIN_TESTERS
        ? `→ 기준을 넘었다 (+${inWindow - MIN_TESTERS})`
        : `→ ${MIN_TESTERS - inWindow}명 모자란다`);

    console.log("");
    console.log("마지막으로 연 날짜 분포 (최근순):");
    [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).forEach(([date, count]) => {
        console.log(`  ${date}: ${count}명`);
    });

    if (bySource.size) {
        console.log("");
        console.log("진입 경로:");
        [...bySource.entries()].sort((a, b) => b[1] - a[1]).forEach(([source, count]) => {
            console.log(`  ${source}: ${count}명`);
        });
    }

    const daysLeft = Math.round(
        (new Date(`${REAPPLY_DATE}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000
    );
    console.log("");
    console.log(`재신청 예정일(${REAPPLY_DATE})까지 ${daysLeft}일 남음`);
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("실패:", error);
    process.exit(1);
});
