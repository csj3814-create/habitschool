// 주간 마감이 배열째 덮어써서 사라진 배지를 돌려놓는다.
//
//   node scripts/restore-lost-mission-badges-2026-09-21.js <서비스계정키> [--apply]
//
// 마감(archiveWeeklyMission)은 매주 배지를 다시 계산해서 읽고-합치고-**배열째**
// 썼다. 읽기가 짧게 답한 주에는 답하지 않은 배지가 그대로 지워졌고, 마감이 다시
// 계산하지 않는 배지(firstMission, customMaster)는 영영 돌아오지 않았다.
//
// 되살릴 근거는 회원의 missionHistory 안에 있다. 없으면 손대지 않는다 —
// 받은 적 없는 배지를 주는 것은 고치는 것이 아니다.
//
// 쓰기는 arrayUnion 이라 있던 배지를 지우지 않는다. --apply 없이 돌리면 확인만 한다.

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
    console.error("사용법: node scripts/restore-lost-mission-badges-2026-09-21.js <서비스계정키> [--apply]");
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();

// 마감이 매주 다시 계산하는 배지. 이것들은 잃어도 다음 달성에 돌아온다.
const RECOMPUTED = ["weekComplete", "mStreak3", "mStreak5", "mStreak10", "hardMode", "allCategories"];

function earnedFirstMission(history) {
    // 미션이 들어 있는 주가 한 번이라도 있으면 미션을 저장한 것이다.
    return history.some((week) => (week?.missions || []).length > 0);
}

function earnedCustomMaster(history) {
    // 커스텀 미션을 80% 이상 달성한 주. archiveWeeklyMission 의 기준과 같다.
    return history.some((week) =>
        (week?.missions || []).some((m) => m?.isCustom) && Number(week?.completionRate || 0) >= 80);
}

async function main() {
    const snap = await db.collection("users").get();
    const plans = [];

    snap.forEach((doc) => {
        const data = doc.data() || {};
        const badges = Array.isArray(data.missionBadges) ? data.missionBadges : [];
        if (badges.length === 0) return;
        const history = Array.isArray(data.missionHistory) ? data.missionHistory : [];

        const missing = [];
        if (!badges.includes("firstMission") && earnedFirstMission(history)) missing.push("firstMission");
        if (!badges.includes("customMaster") && earnedCustomMaster(history)) missing.push("customMaster");
        if (missing.length === 0) return;

        plans.push({ id: doc.id, missing, badges, weeks: history.length });
    });

    console.log("배지를 가진 회원 중 되살릴 것이 있는 회원:", plans.length, "명");
    plans.forEach((p) => {
        const onlyRecomputed = p.badges.every((b) => RECOMPUTED.includes(b));
        console.log(
            `  ${p.id.slice(0, 6)}… · 현재 ${p.badges.length}개 · ${p.weeks}주 기록` +
            ` · 되살림: ${p.missing.join(", ")}` +
            (onlyRecomputed ? "  ← 남은 것이 전부 '매주 다시 계산되는 것'" : "")
        );
    });

    if (!APPLY) {
        console.log("");
        console.log("확인만 했다. 실제로 쓰려면 --apply 를 붙인다.");
        return;
    }

    for (const plan of plans) {
        await db.collection("users").doc(plan.id).update({
            missionBadges: admin.firestore.FieldValue.arrayUnion(...plan.missing),
        });
        console.log(`  ${plan.id.slice(0, 6)}… 되살림 완료`);
    }

    // 쓰기가 실제로 들어갔는지 눈으로 본다. 화면은 멀쩡한데 안 들어가는 일이 있었다.
    console.log("");
    console.log("확인:");
    for (const plan of plans) {
        const after = await db.collection("users").doc(plan.id).get();
        const now = after.data()?.missionBadges || [];
        const ok = plan.missing.every((b) => now.includes(b));
        console.log(`  ${plan.id.slice(0, 6)}… → ${now.length}개 ${ok ? "✅" : "❌ 들어가지 않았다"}`);
    }
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("실패:", error);
    process.exit(1);
});
