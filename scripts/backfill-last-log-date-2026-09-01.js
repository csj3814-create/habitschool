/**
 * users/{uid}.lastLogDate 백필 (1회성).
 *
 * 관제탑 회원 목록의 '최근 기록일' 은 daily_logs 를 최근 500건만 읽어 만들고 있었다.
 * 하루 기록이 20~30건이니 그 창은 최근 20~25일이고, 그보다 오래 쉰 회원은 목록에서
 * 날짜가 빈칸으로 보였다 — "기록이 한 번도 없는 사람" 과 "창 밖으로 밀려난 사람" 이
 * 화면에서 구분되지 않았다. 회원이 늘수록 이 창이 덮는 기간은 더 짧아진다.
 *
 * 이제 awardPoints 트리거가 기록이 들어올 때마다 users/{uid}.lastLogDate 를 적는다.
 * 앞으로 들어올 기록은 트리거가 맡고, 이미 쌓인 기록은 이 스크립트가 한 번 채운다.
 * 이걸 돌리기 전까지 오래 쉰 회원의 날짜는 계속 비어 있다.
 *
 * 하는 일
 *   1. daily_logs 를 전부 훑어 uid 별 가장 늦은 date 를 만든다 (질의 1회)
 *   2. users 문서의 lastLogDate 가 그보다 이르거나 없으면 채운다
 *   3. 이미 더 늦은 값이 있으면 건드리지 않는다 (트리거가 앞서 적었을 수 있다)
 *
 * 사용법
 *   node scripts/backfill-last-log-date-2026-09-01.js --project=habitschool-8497b --dry-run
 *   node scripts/backfill-last-log-date-2026-09-01.js --project=habitschool-8497b --apply
 */

const path = require("path");
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const args = process.argv.slice(2);
const projectArg = args.find((arg) => arg.startsWith("--project="));
const projectId = projectArg ? projectArg.split("=")[1] : "";
const apply = args.includes("--apply");
const dryRun = args.includes("--dry-run") || !apply;

if (!projectId) {
    console.error("--project=<projectId> 가 필요합니다.");
    process.exit(1);
}

admin.initializeApp({ projectId });
const db = admin.firestore();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function main() {
    console.log(`프로젝트: ${projectId} · 모드: ${dryRun ? "DRY-RUN" : "APPLY"}`);

    // 1) uid 별 가장 늦은 기록일
    const latestByUid = new Map();
    const logsSnap = await db.collection("daily_logs").select("userId", "date").get();
    logsSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const uid = data.userId;
        const date = String(data.date || "");
        if (!uid || !DATE_PATTERN.test(date)) return;
        const known = latestByUid.get(uid);
        if (!known || date > known) latestByUid.set(uid, date);
    });
    console.log(`daily_logs ${logsSnap.size}건 → 기록이 있는 회원 ${latestByUid.size}명`);

    // 2) users 와 대조
    const usersSnap = await db.collection("users").get();
    const targets = [];
    let alreadyCurrent = 0;
    let noLogs = 0;

    usersSnap.forEach((docSnap) => {
        const latest = latestByUid.get(docSnap.id);
        if (!latest) { noLogs += 1; return; }
        const known = String((docSnap.data() || {}).lastLogDate || "");
        if (known >= latest) { alreadyCurrent += 1; return; }
        targets.push({ uid: docSnap.id, from: known || "(없음)", to: latest });
    });

    console.log(`회원 ${usersSnap.size}명 · 채울 대상 ${targets.length}명 · 이미 최신 ${alreadyCurrent}명 · 기록 없음 ${noLogs}명`);
    targets.slice(0, 10).forEach((target) => {
        console.log(`  ${target.uid}: ${target.from} → ${target.to}`);
    });
    if (targets.length > 10) console.log(`  … 외 ${targets.length - 10}명`);

    if (dryRun) {
        console.log("DRY-RUN 이므로 쓰지 않았습니다. --apply 로 실행하세요.");
        return;
    }

    // 3) 쓰기 (배치 400건씩)
    let written = 0;
    for (let i = 0; i < targets.length; i += 400) {
        const chunk = targets.slice(i, i + 400);
        const batch = db.batch();
        chunk.forEach((target) => {
            batch.set(db.doc(`users/${target.uid}`), { lastLogDate: target.to }, { merge: true });
        });
        await batch.commit();
        written += chunk.length;
        console.log(`  ${written}/${targets.length} 완료`);
    }
    console.log(`✅ ${written}명 채웠습니다.`);
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("실패:", error);
    process.exit(1);
});
