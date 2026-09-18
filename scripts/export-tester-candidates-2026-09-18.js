// 테스터 명단에 올릴 후보와 메일 대상자를 뽑는다. 읽기만 한다.
//
//   node scripts/export-tester-candidates-2026-09-18.js <서비스계정키> <내보낼폴더> [일수]
//
//   예) node scripts/export-tester-candidates-2026-09-18.js \
//         C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json C:/temp 30
//
// 회원은 구글로 로그인하므로 users.email 이 곧 구글 계정 주소다. Play 비공개
// 테스트 명단은 그 주소로 만들면 되고, 따로 물어볼 필요가 없다.
//
// **이 스크립트는 개인정보(메일 주소)를 파일로 내보낸다.** 저장소 안에 쓰지 말고,
// 쓰고 나면 필요 없을 때 지운다. 화면에는 집계만 찍는다.

const fs = require("fs");
const path = require("path");
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const [keyPath, outDir, daysArg] = process.argv.slice(2);
if (!keyPath || !outDir) {
    console.error("사용법: node scripts/export-tester-candidates-2026-09-18.js <서비스계정키> <내보낼폴더> [일수]");
    process.exit(1);
}
const WINDOW_DAYS = Number(daysArg) || 30;

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();

const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const shift = (dateStr, days) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
};

async function main() {
    const today = kstToday();
    const since = shift(today, WINDOW_DAYS);

    const [usersSnap, logsSnap] = await Promise.all([
        db.collection("users").select("email", "customDisplayName", "displayName", "settings").get(),
        db.collection("daily_logs").where("date", ">=", since).select("userId", "date").get(),
    ]);

    const lastLogByUid = new Map();
    logsSnap.forEach((d) => {
        const row = d.data() || {};
        if (!row.userId || !row.date) return;
        const prev = lastLogByUid.get(row.userId);
        if (!prev || row.date > prev) lastLogByUid.set(row.userId, row.date);
    });

    const onApp = [];
    const webOnly = [];
    let noEmail = 0;
    let nonGoogle = 0;

    usersSnap.forEach((docSnap) => {
        const uid = docSnap.id;
        const lastLog = lastLogByUid.get(uid);
        if (!lastLog) return;

        const data = docSnap.data() || {};
        const email = String(data.email || "").trim().toLowerCase();
        if (!email) { noEmail += 1; return; }
        // Play 테스터 명단은 구글 계정이어야 열린다. gmail 이 아닌 주소도 구글
        // 계정일 수 있으므로 버리지 않고 따로 센다.
        if (!/@(gmail\.com|googlemail\.com)$/.test(email)) nonGoogle += 1;

        const name = String(data.customDisplayName || data.displayName || "").trim();
        const opened = String((data.settings || {}).lastAppOpenDate || "");
        const row = { email, name, lastLog, opened };
        if (opened && opened >= shift(today, 14)) onApp.push(row);
        else webOnly.push(row);
    });

    const byRecent = (a, b) => (a.lastLog < b.lastLog ? 1 : -1);
    webOnly.sort(byRecent);
    onApp.sort(byRecent);

    fs.mkdirSync(outDir, { recursive: true });

    // Play Console 테스터 명단 업로드용 — 주소만, 한 줄에 하나.
    const allEmails = [...webOnly, ...onApp].map((r) => r.email);
    const uniqueEmails = [...new Set(allEmails)];
    const listPath = path.join(outDir, "play-tester-emails.csv");
    fs.writeFileSync(listPath, uniqueEmails.join("\n") + "\n", "utf8");

    // 메일 대상자 — 웹으로만 쓰는 사람. 이름은 인사말에 쓴다.
    const mailPath = path.join(outDir, "mail-targets-web-only.csv");
    fs.writeFileSync(
        mailPath,
        "email,name,lastLog\n" + webOnly.map((r) => `${r.email},${r.name},${r.lastLog}`).join("\n") + "\n",
        "utf8"
    );

    console.log(`최근 ${WINDOW_DAYS}일 안에 기록을 남긴 회원 중`);
    console.log("  앱으로 쓰는 사람:", onApp.length, "명");
    console.log("  웹으로만 쓰는 사람:", webOnly.length, "명  ← 메일 대상");
    console.log("  메일 주소가 없는 사람:", noEmail, "명");
    console.log("  gmail 이 아닌 주소:", nonGoogle, "명 (구글 계정이면 그대로 쓸 수 있다)");
    console.log("");
    console.log("테스터 명단 업로드용:", listPath, `(${uniqueEmails.length}개)`);
    console.log("메일 대상자:", mailPath, `(${webOnly.length}명)`);
    console.log("");
    console.log("※ 두 파일 모두 개인정보다. 저장소에 넣지 말고, 다 쓰면 지운다.");
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("실패:", error);
    process.exit(1);
});
