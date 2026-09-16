// 유산소 사진 분석이 갤러리 투영에서 4개 떨어진다. 왜인지 가른다. 읽기만 한다.
//
//   node scripts/diagnose-cardio-analysis-drop-2026-09-16.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json
//
// 2026-09-16 측정에서 나왔다 (check-gallery-exercise-analysis):
//   원본 daily_logs  유산소 128개 중 분석 있음 11개
//   갤러리 투영      유산소 128개 중 분석 있음  7개   ← 4개가 떨어진다
//   (근력 영상은 11 → 11 로 온전하다)
//
// 후보가 둘이다.
//   (가) normalizeExerciseAnalysisEntry 가 걸러낸다.
//        intensity 가 저강도/중강도/고강도/초고강도 중 하나가 아니면 통째로 null 이다.
//   (나) 투영이 낡았다. 사진을 올릴 때 게시물이 먼저 만들어지고, 나중에 분석이
//        붙었는데 투영이 다시 돌지 않았다면 항목은 있고 분석만 없다.
//
// 둘은 고치는 자리가 전혀 다르다 — (가)는 투영 규칙, (나)는 재투영 트리거다.
// 그래서 같은 항목(mediaId)을 원본과 투영에서 짝지어 본다.
//
// 출력에는 집계와 intensity 값만 담는다. uid·이름·이메일·URL 은 적지 않는다.

const path = require("path");
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const keyPath = process.argv[2];
if (!keyPath) {
    console.error("사용법: node scripts/diagnose-cardio-analysis-drop-2026-09-16.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json");
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();

const DAYS = 14;
// functions/gallery-posts.js 와 같은 목록. 어긋나면 이 진단이 틀린다.
const INTENSITY_WORDS = ["저강도", "중강도", "고강도", "초고강도"];

(async () => {
    const cut = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);

    // 원본: 분석이 붙은 유산소 항목을 (문서id + mediaId) 로 모은다.
    const logsSnap = await db.collection("daily_logs").where("date", ">=", cut).get();
    const rawByKey = new Map();
    const intensityCounts = new Map();
    logsSnap.forEach((doc) => {
        const items = ((doc.data() || {}).exercise || {}).cardioList;
        if (!Array.isArray(items)) return;
        items.forEach((item, index) => {
            const analysis = item && item.aiAnalysis;
            if (!analysis || typeof analysis !== "object") return;
            const mediaId = String(item.mediaId || `cardio-${index + 1}`);
            rawByKey.set(`${doc.id}::${mediaId}`, analysis);
            const raw = analysis.intensity;
            const label = raw === null ? "(null)"
                : raw === undefined ? "(없음)"
                    : String(raw).trim() === "" ? "(빈 문자열)"
                        : String(raw);
            intensityCounts.set(label, (intensityCounts.get(label) || 0) + 1);
        });
    });

    // 투영: 같은 키로 모은다. gallery_posts 문서 id 는 daily_logs 와 같은 규칙이다.
    const postsSnap = await db.collection("gallery_posts").where("date", ">=", cut).get();
    const projectedKeys = new Set();
    const projectedItemKeys = new Set();
    postsSnap.forEach((doc) => {
        const items = ((doc.data() || {}).exercise || {}).cardioList;
        if (!Array.isArray(items)) return;
        items.forEach((item, index) => {
            const mediaId = String((item && item.mediaId) || `cardio-${index + 1}`);
            const key = `${doc.id}::${mediaId}`;
            projectedItemKeys.add(key);
            if (item && item.aiAnalysis) projectedKeys.add(key);
        });
    });

    console.log(`\n=== 최근 ${DAYS}일 (${cut} 이후) ===`);
    console.log(`  원본에서 분석이 붙은 유산소 항목: ${rawByKey.size}개`);
    console.log(`  그중 투영에도 분석이 있는 것    : ${[...rawByKey.keys()].filter((k) => projectedKeys.has(k)).length}개`);

    console.log("\n=== 원본 intensity 값 분포 ===");
    for (const [label, count] of [...intensityCounts.entries()].sort((a, b) => b[1] - a[1])) {
        const ok = INTENSITY_WORDS.includes(label);
        console.log(`  ${label.padEnd(14)} ${String(count).padStart(3)}개  ${ok ? "통과" : "← 투영에서 걸러짐"}`);
    }

    console.log("\n=== 떨어진 항목 하나하나 ===");
    let byFilter = 0;
    let byStale = 0;
    let byMissingItem = 0;
    for (const [key, analysis] of rawByKey.entries()) {
        if (projectedKeys.has(key)) continue;
        const intensity = analysis.intensity;
        const valid = INTENSITY_WORDS.includes(String(intensity || "").trim());
        const notExercise = analysis.isExercise === false;
        if (!projectedItemKeys.has(key)) {
            byMissingItem += 1;
            console.log(`  항목 자체가 투영에 없음        (intensity=${JSON.stringify(intensity)})`);
        } else if (notExercise || !valid) {
            byFilter += 1;
            console.log(`  투영 규칙이 걸러냄             (intensity=${JSON.stringify(intensity)}${notExercise ? ", isExercise=false" : ""})`);
        } else {
            byStale += 1;
            console.log(`  규칙은 통과하는데 투영에 없음  (intensity=${JSON.stringify(intensity)}) ← 재투영이 안 돈 것`);
        }
    }

    console.log("\n=== 판정 ===");
    if (byFilter === 0 && byStale === 0 && byMissingItem === 0) {
        console.log("  떨어진 것이 없다. 앞선 측정과 다르면 기간이 달라진 것이다.");
    } else {
        if (byFilter > 0) console.log(`  ${byFilter}개: 투영 규칙(intensity 화이트리스트)이 걸러냈다 → gallery-posts.js 를 볼 자리다.`);
        if (byStale > 0) console.log(`  ${byStale}개: 규칙은 통과하는데 투영에 없다 → 분석이 나중에 붙었고 재투영이 안 돌았다.`);
        if (byMissingItem > 0) console.log(`  ${byMissingItem}개: 항목 자체가 투영에 없다 → 공유 설정이나 URL 검증에서 빠졌다.`);
    }
    console.log("");
    process.exit(0);
})().catch((error) => {
    console.error("실패:", error && error.message);
    process.exit(1);
});
