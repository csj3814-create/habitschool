// 갤러리 운동 영상에 '분석 확인' 버튼이 왜 안 뜨는지 본다. 읽기만 한다.
//
//   node scripts/check-gallery-exercise-analysis-2026-09-16.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json
//
// 2026-09-16 제보: "갤러리 운동 영상도 분석보기 버튼이 나와야지."
//
// 코드는 이미 영상 오버레이를 지원한다(js/app-core.js addVid). 서버 투영도
// aiAnalysis 를 싣는다(functions/gallery-posts.js normalizeExerciseAnalysisEntry).
// 그러면 남는 가능성은 둘이다.
//   (가) 원본 daily_logs 의 그 영상에 aiAnalysis 가 아예 없다
//        → 분석을 안 돌렸거나 돌렸는데 실패했다(오늘 OOM 건)
//   (나) 있는데 투영에서 떨어졌다 → 그러면 투영 규칙이 문제다
//
// 둘을 가르려면 원본과 투영을 나란히 봐야 한다. 그래서 둘 다 읽는다.
//
// 출력에는 집계와 있음/없음만 담는다. uid·이름·이메일·URL 은 적지 않는다.

const path = require("path");
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const keyPath = process.argv[2];
if (!keyPath) {
    console.error("사용법: node scripts/check-gallery-exercise-analysis-2026-09-16.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json");
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();

const DAYS = 14;

function countList(list) {
    const items = Array.isArray(list) ? list : [];
    let withAnalysis = 0;
    let notExercise = 0;
    for (const item of items) {
        const analysis = item && item.aiAnalysis;
        if (!analysis || typeof analysis !== "object") continue;
        if (analysis.isExercise === false) { notExercise += 1; continue; }
        withAnalysis += 1;
    }
    return { total: items.length, withAnalysis, notExercise };
}

(async () => {
    const cut = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);

    // 1) 원본 기록
    const logsSnap = await db.collection("daily_logs").where("date", ">=", cut).get();
    const raw = { cardio: { total: 0, withAnalysis: 0, notExercise: 0 }, strength: { total: 0, withAnalysis: 0, notExercise: 0 } };
    logsSnap.forEach((doc) => {
        const ex = (doc.data() || {}).exercise || {};
        for (const [key, list] of [["cardio", ex.cardioList], ["strength", ex.strengthList]]) {
            const c = countList(list);
            raw[key].total += c.total;
            raw[key].withAnalysis += c.withAnalysis;
            raw[key].notExercise += c.notExercise;
        }
    });

    // 2) 갤러리 투영
    const postsSnap = await db.collection("gallery_posts").where("date", ">=", cut).get();
    const projected = { cardio: { total: 0, withAnalysis: 0 }, strength: { total: 0, withAnalysis: 0 } };
    postsSnap.forEach((doc) => {
        const ex = (doc.data() || {}).exercise || {};
        for (const [key, list] of [["cardio", ex.cardioList], ["strength", ex.strengthList]]) {
            const items = Array.isArray(list) ? list : [];
            projected[key].total += items.length;
            projected[key].withAnalysis += items.filter((i) => i && i.aiAnalysis).length;
        }
    });

    const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "-");

    console.log(`\n=== 최근 ${DAYS}일 (${cut} 이후) ===`);
    console.log(`  daily_logs   : ${logsSnap.size}건`);
    console.log(`  gallery_posts: ${postsSnap.size}건`);

    console.log("\n=== 원본 daily_logs — 분석이 붙어 있나 ===");
    for (const key of ["cardio", "strength"]) {
        const r = raw[key];
        const label = key === "cardio" ? "유산소(사진)" : "근력(영상)";
        console.log(`  ${label.padEnd(14)} 항목 ${String(r.total).padStart(4)}개 · 분석 있음 ${String(r.withAnalysis).padStart(4)}개 (${pct(r.withAnalysis, r.total)}) · 운동 아님 판정 ${r.notExercise}개`);
    }

    console.log("\n=== 갤러리 투영 — 분석이 실려 나갔나 ===");
    for (const key of ["cardio", "strength"]) {
        const p = projected[key];
        const label = key === "cardio" ? "유산소(사진)" : "근력(영상)";
        console.log(`  ${label.padEnd(14)} 항목 ${String(p.total).padStart(4)}개 · 분석 있음 ${String(p.withAnalysis).padStart(4)}개 (${pct(p.withAnalysis, p.total)})`);
    }

    console.log("\n=== 판정 ===");
    const rawS = raw.strength, projS = projected.strength;
    if (rawS.total === 0) {
        console.log("  최근 영상 기록 자체가 없다. 더 볼 것이 없다.");
    } else if (rawS.withAnalysis === 0) {
        console.log("  원본에도 분석이 하나도 없다. 투영 문제가 아니라 분석이 안 돈 것이다.");
        console.log("  → 영상 분석은 회원이 'AI 분석' 을 눌러야 도는데, 누르지 않았거나 실패했다.");
        console.log("    (오늘 고친 메모리 초과가 그 실패의 원인 중 하나다.)");
    } else if (projS.withAnalysis === 0) {
        console.log("  원본에는 있는데 투영에는 없다. normalizeExerciseAnalysisEntry 가 떨어뜨리고 있다.");
    } else if (projS.withAnalysis < rawS.withAnalysis) {
        console.log(`  원본 ${rawS.withAnalysis}개 중 ${projS.withAnalysis}개만 투영됐다. 나머지가 왜 떨어지는지 봐야 한다.`);
        console.log("  (운동 아님 판정은 일부러 뺀다 — 남들에게 보이는 자리라서다.)");
    } else {
        console.log("  원본과 투영이 맞는다. 버튼이 안 보인 영상은 분석이 없는 영상이다.");
    }
    console.log("");
    process.exit(0);
})().catch((error) => {
    console.error("실패:", error && error.message);
    process.exit(1);
});
