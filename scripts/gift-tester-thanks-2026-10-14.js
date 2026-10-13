// Play 비공개 테스트에 실제로 참여한 회원에게 감사 선물 2,000P (커피 한 잔).
//
//   node scripts/gift-tester-thanks-2026-10-14.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json
//   node scripts/gift-tester-thanks-2026-10-14.js <키> --apply
//
// 2026-10-14 요청: "테스터로 실제 참여한 15분 가량의 회원분들에겐 커피값 2000포인트 따로 선물".
// 1.0.9 가 10-07 Play 스토어에 공개됐다. 공개 전에 테스트 앱을 연 사람이 테스터다.
//
// 누가 테스터인가: 셸이 앱을 열 때마다 settings.appOpenDates 에 그날을 더한다(9/22부터,
// js/app-core.js recordNativeAppOpen). **공개 전(~10-06)에 하루라도 앱을 연 회원.**
// 운영자 본인은 뺀다.
//
// 기본은 미리보기다. --apply 를 붙여야 쓴다. 같은 회원에게 두 번 주지 않는다 —
// point_ledger/{uid}_bonuses/entries/tester_thanks_2026_10 를 create 로 만들고,
// 이미 있으면 건너뛴다. 복귀 보너스(functions/runtime.js)와 같은 장부 자리다.

const path = require("path");
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const keyPath = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!keyPath || keyPath.startsWith("--")) {
    console.error("사용법: node scripts/gift-tester-thanks-2026-10-14.js <서비스계정키.json> [--apply]");
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const GIFT_POINTS = 2000;           // 아메리카노 쿠폰 2,000P
const PUBLIC_RELEASE_DATE = "2026-10-07";
const LEDGER_ENTRY_ID = "tester_thanks_2026_10";
// 운영자 계정은 선물 대상이 아니다.
const EXCLUDED_NAMES = new Set(["최석재"]);

function testerOpenDays(settings = {}) {
    const dates = Array.isArray(settings.appOpenDates) ? settings.appOpenDates : [];
    return dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date)) && date < PUBLIC_RELEASE_DATE).length;
}

async function giftOne(target) {
    const userRef = db.doc(`users/${target.uid}`);
    const ledgerRoot = db.doc(`point_ledger/${target.uid}_bonuses`);
    const entry = ledgerRoot.collection("entries").doc(LEDGER_ENTRY_ID);
    return db.runTransaction(async (tx) => {
        const [entrySnap, userSnap] = await Promise.all([tx.get(entry), tx.get(userRef)]);
        if (!userSnap.exists) return "no_user";
        if (entrySnap.exists) return "already";
        tx.create(entry, {
            userId: target.uid,
            category: "tester_thanks",
            points: GIFT_POINTS,
            source: "play_closed_test_thanks",
            openDaysBeforeRelease: target.days,
            credited: true,
            createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(ledgerRoot, {
            userId: target.uid,
            type: "bonus",
            version: 2,
            lastSettledAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.set(userRef, { coins: FieldValue.increment(GIFT_POINTS) }, { merge: true });
        return "gifted";
    });
}

async function main() {
    const snap = await db.collection("users").select("settings", "displayName", "customDisplayName", "coins").get();
    const targets = [];
    snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const name = String(data.customDisplayName || data.displayName || "").trim();
        const days = testerOpenDays(data.settings || {});
        if (days < 1 || EXCLUDED_NAMES.has(name)) return;
        targets.push({ uid: docSnap.id, name, days, coins: Number(data.coins || 0) });
    });
    targets.sort((a, b) => b.days - a.days);

    console.log(`${APPLY ? "지급" : "미리보기"} — 대상 ${targets.length}명, 1인 ${GIFT_POINTS.toLocaleString()}P, 합계 ${(targets.length * GIFT_POINTS).toLocaleString()}P`);
    targets.forEach((t, i) => console.log(`${String(i + 1).padStart(2)}. ${t.name || "(이름 없음)"} · 공개 전 앱 연 날 ${t.days}일 · 현재 ${t.coins.toLocaleString()}P`));
    if (!APPLY) {
        console.log("\n쓰지 않았다. 확인 뒤 --apply 를 붙여 다시 실행한다.");
        return;
    }

    const tally = { gifted: 0, already: 0, no_user: 0, failed: 0 };
    for (const target of targets) {
        try {
            const result = await giftOne(target);
            tally[result] += 1;
            console.log(`  ${result === "gifted" ? "+" : "="} ${target.name}: ${result}`);
        } catch (error) {
            tally.failed += 1;
            console.error(`  ! ${target.name}: ${error?.message || error}`);
        }
    }
    console.log("\n결과:", JSON.stringify(tally));
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("실패:", error);
    process.exit(1);
});
