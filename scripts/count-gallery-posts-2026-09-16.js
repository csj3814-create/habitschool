// 갤러리 피드가 "여기까지가 전체 기록이에요" 로 끝나는 것이 맞는지 확인한다.
// 읽기만 한다 — 쓰기 경로가 없다.
//
//   node scripts/count-gallery-posts-2026-09-16.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json
//
// 왜 만들었나
//   2026-09-16 제보: "여기까지가 전체기록이에요 라고 나와요" (v401, 갤러리 탭).
//
//   코드를 읽어 보면 그 문구는 Firestore 가 한 페이지(30건)보다 적게 돌려줬을
//   때만 나온다(js/app-core.js _loadMoreGalleryFromFirestore). 즉 코드 기준으로는
//   "정말 더 없다" 는 뜻이다. 900건 상한에 걸린 경우는 다른 문구가 나간다.
//
//   그래서 남는 질문은 하나다 — gallery_posts 에 실제로 몇 건이 있나?
//   40건뿐이면 문구가 맞고, 수백 건인데 피드가 40건에서 멈췄으면 버그다.
//   그 답은 코드가 아니라 데이터에 있다.
//
// 출력에는 집계와 날짜만 담는다. uid·이름·이메일·사진 URL 은 적지 않는다.

const path = require("path");
// 이 저장소 루트에는 firebase-admin 이 없다. functions/ 쪽 설치본을 쓴다.
// (다른 scripts/ 들과 같은 방식이다.)
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const keyPath = process.argv[2];
if (!keyPath) {
    console.error("사용법: node scripts/count-gallery-posts-2026-09-16.js C:/SJ/antigravity/habitchatbot/appServiceAccountKey.json");
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(require(path.resolve(keyPath))),
});
const db = admin.firestore();

// 클라이언트와 같은 숫자. 어긋나면 이 스크립트의 판정이 틀린다.
const FIRESTORE_PAGE_SIZE = 30;
const MAX_CACHE_SIZE = 900;

function toDateString(value) {
    if (!value) return "(없음)";
    if (typeof value.toDate === "function") return value.toDate().toISOString().slice(0, 10);
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "(읽을 수 없음)";
}

(async () => {
    // 피드와 같은 정렬로 읽는다. 상한보다 한 건 더 받아서 '더 있는지' 를 본다.
    const snap = await db.collection("gallery_posts")
        .orderBy("updatedAt", "desc")
        .limit(MAX_CACHE_SIZE + 1)
        .get();

    const dates = snap.docs.map((doc) => toDateString((doc.data() || {}).updatedAt));
    const total = snap.size;
    const moreThanCap = total > MAX_CACHE_SIZE;

    console.log("\n=== gallery_posts ===");
    console.log(`  읽은 건수      : ${Math.min(total, MAX_CACHE_SIZE)}${moreThanCap ? " (상한 도달 — 더 있음)" : ""}`);
    console.log(`  가장 최근      : ${dates[0] || "-"}`);
    console.log(`  가장 오래된    : ${dates[Math.min(total, MAX_CACHE_SIZE) - 1] || "-"}`);

    const byDate = new Map();
    for (const d of dates.slice(0, MAX_CACHE_SIZE)) byDate.set(d, (byDate.get(d) || 0) + 1);
    const recent = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 14);
    console.log("\n  최근 14일치 (날짜 · 건수)");
    for (const [date, count] of recent) console.log(`    ${date}  ${count}건`);

    console.log("\n=== 판정 ===");
    const shown = Math.min(total, MAX_CACHE_SIZE);
    if (moreThanCap) {
        console.log(`  ${MAX_CACHE_SIZE}건 상한을 넘는다. 피드는 "여기까지가 최근 기록이에요" 로 끝나야 하고,`);
        console.log(`  "전체 기록이에요" 가 나왔다면 galleryReachedCap 판정이 틀린 것이다.`);
    } else if (shown < FIRESTORE_PAGE_SIZE) {
        console.log(`  전체가 ${shown}건이라 첫 페이지(${FIRESTORE_PAGE_SIZE}건)로 끝난다.`);
        console.log(`  "여기까지가 전체 기록이에요" 는 사실이다 — 버그가 아니다.`);
    } else {
        console.log(`  전체 ${shown}건. 상한(${MAX_CACHE_SIZE}) 아래이므로 피드는 ${shown}건을 다 보여준 뒤`);
        console.log(`  "여기까지가 전체 기록이에요" 로 끝나는 것이 맞다.`);
        console.log(`  제보자가 그보다 훨씬 적게 보고 문구를 만났다면 그때가 버그다 —`);
        console.log(`  화면에 몇 건이 떴는지 함께 확인해야 한다.`);
    }
    console.log("");
    process.exit(0);
})().catch((error) => {
    console.error("실패:", error && error.message);
    process.exit(1);
});
