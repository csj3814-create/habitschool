// 동의 기록이 없는 521명이 '휴면' 인지 '저장이 안 되는' 인지 가른다. 읽기만 한다.
//
//   node scripts/check-consent-coverage-2026-09-18.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json
//
// check-consent-records 로 615명 중 521명이 consents 가 없는 것을 봤다. 두 가지가
// 가능하다.
//   (가) 동의 관문(2026-08-15)이 생긴 뒤로 들어온 적이 없는 사람들 → 정상
//   (나) 들어왔는데도 기록이 없다 → 관문이 뜨고 저장이 안 되고 있다
//
// 최근에 기록을 남긴 사람 중 몇 명이 동의 기록이 없는지 보면 갈린다. daily_logs
// 는 '그날 실제로 앱을 써서 저장까지 한 사람' 이라 lastLogin 보다 믿을 만하다.
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
    console.error("사용법: node scripts/check-consent-coverage-2026-09-18.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json");
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();

const TODAY = "2026-09-18";
const CONSENT_GATE_DATE = "2026-08-15";

const shift = (dateStr, days) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
};

const hasConsents = (data) => {
    const consents = data && data.consents;
    return !!consents && typeof consents === "object" && Object.keys(consents).length > 0;
};

async function main() {
    const usersSnap = await db.collection("users").select("consents").get();
    const consentByUid = new Map();
    usersSnap.forEach((d) => consentByUid.set(d.id, hasConsents(d.data() || {})));

    // 관문이 생긴 뒤로 기록을 남긴 사람들.
    const logsSnap = await db.collection("daily_logs")
        .where("date", ">=", CONSENT_GATE_DATE)
        .select("userId", "date")
        .get();

    const lastLogByUid = new Map();
    logsSnap.forEach((d) => {
        const row = d.data() || {};
        if (!row.userId || !row.date) return;
        const prev = lastLogByUid.get(row.userId);
        if (!prev || row.date > prev) lastLogByUid.set(row.userId, row.date);
    });

    const buckets = [
        { label: "최근 7일 안에 기록함", since: shift(TODAY, 7) },
        { label: "최근 14일 안에 기록함", since: shift(TODAY, 14) },
        { label: "동의 관문(08-15) 이후 한 번이라도 기록함", since: CONSENT_GATE_DATE },
    ];

    console.log("=== 동의 기록 유무 × 실제 사용 ===");
    console.log("회원 수:", usersSnap.size);
    console.log("동의 기록 있음:", [...consentByUid.values()].filter(Boolean).length);
    console.log("");

    for (const bucket of buckets) {
        let active = 0;
        let missing = 0;
        for (const [uid, lastDate] of lastLogByUid.entries()) {
            if (lastDate < bucket.since) continue;
            active += 1;
            if (consentByUid.get(uid) !== true) missing += 1;
        }
        const rate = active ? Math.round((missing / active) * 100) : 0;
        console.log(`${bucket.label}: ${active}명`);
        console.log(`  그중 동의 기록 없음: ${missing}명 (${rate}%)`);
    }

    console.log("");
    console.log("동의 관문 이후 한 번도 기록이 없는 회원:",
        usersSnap.size - lastLogByUid.size, "명 — 이들은 관문을 지날 일이 없었다");
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("실패:", error);
    process.exit(1);
});
