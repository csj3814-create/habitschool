// 낡은 `users/{uid}.currentStreak` 이 몇 개인지 본다. **읽기만 한다.**
//
//   node scripts/check-stale-streaks-2026-09-23.js <서비스계정키>
//
// 그 필드는 기록을 저장할 때만 쓰인다. 그만둔 사람에게는 쓰는 순간이 오지 않으므로
// 값이 마지막 기록일에 멈춘 채 남는다. 저장된 값의 뜻은 "오늘의 연속" 이 아니라
// "lastLogDate 시점의 연속" 이다.
//
// 판정은 회원 문서만으로 한다(currentStreak + lastLogDate). daily_logs 를 다시 읽어
// 세지 않는 이유는, **앱과 서버가 실제로 쓰는 판정과 같은 것을 재야 하기 때문이다** —
// 여기서만 더 정확하게 세면 화면에 무엇이 보이는지를 못 재게 된다.
//
// 다만 lastLogDate 자체가 틀렸을 가능성은 표본으로 확인한다(--verify).
//
// 출력에는 집계와 uid 앞 6자리만 적는다. 이름·이메일은 적지 않는다.

const path = require("path");
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const keyPath = process.argv[2];
const VERIFY = process.argv.includes("--verify");
if (!keyPath) {
    console.error("사용법: node scripts/check-stale-streaks-2026-09-23.js <서비스계정키> [--verify]");
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();

const { resolveStoredStreak } = require(path.join(__dirname, "..", "functions", "streak-freshness"));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const shift = (d, n) => {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
};
const gapDays = (from, to) =>
    Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000);

// 서버가 연속을 셀 때 쓰는 기준과 같다. 점수를 받은 날만 '기록한 날' 이다.
const awardedTotal = (log) => {
    const a = (log || {}).awardedPoints || {};
    return (Number(a.dietPoints) || 0) + (Number(a.exercisePoints) || 0) + (Number(a.mindPoints) || 0);
};

async function main() {
    const today = kstToday();
    const yesterday = shift(today, -1);

    const usersSnap = await db.collection("users")
        .select("currentStreak", "lastLogDate")
        .get();

    const alive = [];
    const stale = [];
    const noLastLogDate = [];

    usersSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const stored = Math.max(0, Number(data.currentStreak) || 0);
        if (stored === 0) return;

        const lastLogDate = String(data.lastLogDate || "").trim();
        const row = { uid: docSnap.id, stored, lastLogDate };

        if (!DATE.test(lastLogDate)) {
            // 2026-09-01 백필 뒤에도 비어 있다면 기록이 아예 없다는 뜻이다.
            // 백필은 이런 회원을 건드리지 않는다 — hasStartedRecording 이 이 값을 본다.
            noLastLogDate.push(row);
            return;
        }
        if (lastLogDate === today || lastLogDate === yesterday) alive.push(row);
        else stale.push({ ...row, gap: gapDays(lastLogDate, today) });
    });

    stale.sort((a, b) => b.gap - a.gap);

    console.log(`오늘(KST): ${today}`);
    console.log("");
    console.log(`currentStreak > 0 인 회원        : ${alive.length + stale.length + noLastLogDate.length}명`);
    console.log(`  연속이 실제로 살아 있음 (어제·오늘): ${alive.length}명`);
    console.log(`  낡음 (마지막 기록이 그 전)        : ${stale.length}명`);
    console.log(`  lastLogDate 없음 (손대지 않음)     : ${noLastLogDate.length}명`);

    if (stale.length) {
        const buckets = [
            ["2~6일 전", (g) => g >= 2 && g <= 6],
            ["7~29일 전", (g) => g >= 7 && g <= 29],
            ["30~45일 전", (g) => g >= 30 && g <= 45],
            ["46일 이상", (g) => g >= 46],
        ];
        console.log("");
        console.log("낡은 값의 간격 분포:");
        buckets.forEach(([label, pick]) => {
            const rows = stale.filter((r) => pick(r.gap));
            if (rows.length) console.log(`  ${label.padEnd(12)} ${String(rows.length).padStart(4)}명`);
        });

        const worst = stale[0];
        console.log("");
        console.log(`가장 오래된 것: ${worst.uid.slice(0, 6)}… · 마지막 기록 ${worst.lastLogDate}`
            + ` (${worst.gap}일 전) · 저장된 연속 ${worst.stored}일`);
        console.log(`지워질 연속 일수 합계: ${stale.reduce((s, r) => s + r.stored, 0)}일`);
    }

    if (!VERIFY) {
        console.log("");
        console.log("lastLogDate 가 정말 맞는지 표본으로 확인하려면 --verify 를 붙인다.");
        return;
    }

    // lastLogDate 를 믿고 지우는 것이므로, 그 값이 맞는지 한 번은 본다.
    // 간격이 큰 쪽 10명만 실제 daily_logs 로 대조한다 — 전체를 읽을 일은 아니다.
    const sample = stale.slice(0, 10);
    console.log("");
    console.log("표본 대조 (lastLogDate vs daily_logs 최신 기록일):");
    for (const row of sample) {
        const snap = await db.collection("daily_logs")
            .where("userId", "==", row.uid)
            .orderBy("date", "desc")
            .limit(20)
            .get();
        const actual = snap.docs
            .map((d) => d.data() || {})
            .filter((log) => awardedTotal(log) > 0)
            .map((log) => String(log.date || ""))
            .sort()
            .pop() || "(없음)";
        const agrees = actual === row.lastLogDate;
        console.log(`  ${row.uid.slice(0, 6)}… · 문서 ${row.lastLogDate} · 기록 ${actual}`
            + ` ${agrees ? "✅" : "❌ 어긋남 — 백필 전에 살펴볼 것"}`);
    }

    // 환산 함수가 이 표본에서 실제로 0 을 돌려주는지도 본다.
    // 스크립트와 앱이 서로 다른 판정을 쓰고 있으면 여기서 드러난다.
    const mismatched = sample.filter((row) => resolveStoredStreak(row, today) !== 0);
    console.log("");
    console.log(mismatched.length === 0
        ? "환산 함수도 표본 전부를 0 으로 본다 ✅"
        : `❌ 환산 함수가 0 으로 보지 않는 표본 ${mismatched.length}건 — 판정이 갈렸다`);
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("실패:", error);
    process.exit(1);
});
