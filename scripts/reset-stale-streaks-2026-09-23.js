// 낡아 버린 `users/{uid}.currentStreak` 을 0 으로 되돌린다.
//
//   node scripts/reset-stale-streaks-2026-09-23.js <서비스계정키> [--apply]
//
// **이것은 고치는 일이 아니라 치우는 일이다.**
//
// 값이 낡는 원인은 기록을 쓰는 순간에만 갱신되기 때문이고, 그건 읽는 자리에서
// `lastLogDate` 와 함께 환산하는 것으로 고쳤다(functions/streak-freshness.js).
// 이 스크립트는 그 환산이 없던 시절에 쌓인 값을 한 번 정리할 뿐이다. 내일 또
// 누군가 쉬면 그 사람 값은 다시 낡는다 — 그래도 읽는 쪽이 환산하므로 화면은
// 맞다. **이 스크립트를 주기적으로 돌리는 것으로 문제를 덮지 않는다.**
//
// 그래도 한 번은 돌린다. 저장된 값이 사실처럼 남아 있는 한, 새로 생긴 읽기는
// 같은 실수를 처음부터 다시 한다.
//
// 건드리지 않는 것:
//   - `lastLogDate` 가 비어 있는 회원. js/auth-login-helpers.js 의
//     hasStartedRecording 이 "기록한 적 있음" 표식으로 currentStreak > 0 을 본다.
//     0 으로 만들면 그 회원에게 온보딩 모달이 다시 뜬다.
//   - 마지막 기록이 어제·오늘인 회원. 연속이 살아 있다.
//   - 이미 0 인 회원.
//
// --apply 없이 돌리면 확인만 한다.

const path = require("path");
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const keyPath = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!keyPath) {
    console.error("사용법: node scripts/reset-stale-streaks-2026-09-23.js <서비스계정키> [--apply]");
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();

const { resolveStoredStreak } = require(path.join(__dirname, "..", "functions", "streak-freshness"));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BATCH_SIZE = 400;
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const gapDays = (from, to) =>
    Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000);

async function main() {
    const today = kstToday();
    const usersSnap = await db.collection("users")
        .select("currentStreak", "lastLogDate")
        .get();

    const targets = [];
    let skippedAlive = 0;
    let skippedNoDate = 0;

    usersSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const stored = Math.max(0, Number(data.currentStreak) || 0);
        if (stored === 0) return;

        const lastLogDate = String(data.lastLogDate || "").trim();
        if (!DATE.test(lastLogDate)) { skippedNoDate += 1; return; }

        // 지우는 근거를 앱·서버가 읽을 때 쓰는 함수 그대로 쓴다.
        // 여기서만 다르게 판정하면, 화면에 보이는 것과 다른 것을 지우게 된다.
        if (resolveStoredStreak(data, today) > 0) { skippedAlive += 1; return; }

        targets.push({ uid: docSnap.id, stored, lastLogDate, gap: gapDays(lastLogDate, today) });
    });

    targets.sort((a, b) => b.gap - a.gap);

    console.log(`오늘(KST): ${today}`);
    console.log(`0 으로 되돌릴 회원        : ${targets.length}명`);
    console.log(`연속이 살아 있어 건너뜀    : ${skippedAlive}명`);
    console.log(`lastLogDate 없어 건너뜀    : ${skippedNoDate}명`);
    if (targets.length) {
        console.log("");
        console.log("오래된 것부터 10명:");
        targets.slice(0, 10).forEach((t) => {
            console.log(`  ${t.uid.slice(0, 6)}… · 마지막 기록 ${t.lastLogDate} (${t.gap}일 전)`
                + ` · 저장된 연속 ${t.stored}일 → 0`);
        });
    }

    if (!APPLY) {
        console.log("");
        console.log("확인만 했다. 실제로 쓰려면 --apply 를 붙인다.");
        return;
    }
    if (targets.length === 0) return;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const chunk = targets.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        chunk.forEach((t) => {
            batch.set(db.doc(`users/${t.uid}`), { currentStreak: 0 }, { merge: true });
        });
        await batch.commit();
        console.log(`  ${i + chunk.length}/${targets.length} 완료`);
    }

    // 쓰기가 실제로 들어갔는지 눈으로 본다.
    //
    // firestore.rules 가 막으면 화면은 멀쩡한데 값이 안 들어간다 — 2026-08-15 에
    // 동의 기록이 나흘간 통째로 거부됐을 때가 정확히 그 모양이었다.
    // (관리자 SDK 는 규칙을 우회하지만, 확인은 그래도 한다.)
    const sample = targets.slice(0, 10);
    console.log("");
    console.log("확인:");
    for (const t of sample) {
        const after = await db.doc(`users/${t.uid}`).get();
        const now = Number((after.data() || {}).currentStreak) || 0;
        console.log(`  ${t.uid.slice(0, 6)}… → ${now} ${now === 0 ? "✅" : "❌ 들어가지 않았다"}`);
    }
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("실패:", error);
    process.exit(1);
});
