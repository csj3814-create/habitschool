/**
 * 혈액검사 분석 결과를 healthProfile 로 옮긴다 (1회성 백필).
 *
 * analyzeBloodTest 는 결과를 users/{uid}/bloodTests/{date} 에 제대로 저장했지만,
 * healthProfile 반영은 set() 에 점 표기를 써서 실패하고 있었다. set() 은 점을 경로로
 * 해석하지 않으므로 'healthProfile.hba1c' 라는 이름의 최상위 필드가 만들어졌고,
 * metabolic-score 가 읽는 healthProfile.hba1c(중첩)는 끝내 비어 있었다.
 *
 * 그래서 혈액검사를 올린 사람도 대사건강 점수의 인슐린 항목이 "건강 지표 기록 필요"
 * 로 남았다. 원본은 bloodTests 에 그대로 있으므로 복구할 수 있다.
 *
 * 하는 일
 *   1. bloodTests 하위 컬렉션이 있는 회원을 모두 찾는다
 *   2. 가장 최근 문서의 metrics 를 읽는다
 *   3. healthProfile 에 중첩 필드로 넣는다 (이미 값이 있으면 건드리지 않는다)
 *   4. 잘못 만들어진 점 든 최상위 필드를 지운다
 *
 * 사용법
 *   node scripts/backfill-bloodtest-health-profile-2026-08-14.js --project=habitschool-8497b --dry-run
 *   node scripts/backfill-bloodtest-health-profile-2026-08-14.js --project=habitschool-8497b --apply
 */

// firebase-admin 은 functions/ 아래에만 설치돼 있다. 루트에서 실행해도 찾도록 한다.
const path = require("path");
let admin;
try {
    admin = require("firebase-admin");
} catch (_) {
    admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
}

const args = process.argv.slice(2);
const projectId = (args.find((a) => a.startsWith("--project=")) || "").split("=")[1] || "";
const apply = args.includes("--apply");

if (!projectId) {
    console.error("사용법: --project=<projectId> 와 --dry-run 또는 --apply");
    process.exit(1);
}
if (!apply && !args.includes("--dry-run")) {
    console.error("--dry-run 또는 --apply 중 하나를 지정해야 한다. 실수로 쓰기를 막기 위해서다.");
    process.exit(1);
}

admin.initializeApp({ projectId });
const db = admin.firestore();

// 잘못 만들어졌을 수 있는 최상위 필드 이름과, 들어가야 할 중첩 위치.
const FIELD_MAP = [
    ["healthProfile.latestGlucose", "latestGlucose", (m) => m.glucose?.value],
    ["healthProfile.hba1c", "hba1c", (m) => (m.hba1c?.value != null ? String(m.hba1c.value) : undefined)],
    ["healthProfile.latestTriglyceride", "latestTriglyceride", (m) => m.triglyceride?.value],
];

async function main() {
    console.log(`[backfill] project=${projectId} mode=${apply ? "APPLY" : "DRY-RUN"}`);

    // bloodTests 는 하위 컬렉션이라 컬렉션 그룹으로 훑는다.
    const snap = await db.collectionGroup("bloodTests").get();
    console.log(`[backfill] bloodTests 문서 ${snap.size}건 발견`);

    /** uid -> { docId, metrics } (가장 최근 것만) */
    const latestByUid = new Map();
    snap.forEach((doc) => {
        const uid = doc.ref.parent.parent?.id;
        if (!uid) return;
        const prev = latestByUid.get(uid);
        // 문서 id 가 날짜(YYYY-MM-DD)라 문자열 비교로 최신을 고를 수 있다.
        if (!prev || doc.id > prev.docId) {
            latestByUid.set(uid, { docId: doc.id, metrics: doc.data()?.metrics || {} });
        }
    });

    console.log(`[backfill] 대상 회원 ${latestByUid.size}명`);

    let updated = 0;
    let skipped = 0;
    let strayCleared = 0;

    for (const [uid, { docId, metrics }] of latestByUid) {
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            console.warn(`  - ${uid}: 회원 문서 없음 (탈퇴 추정) — 건너뜀`);
            skipped += 1;
            continue;
        }
        const data = userSnap.data() || {};
        const profile = data.healthProfile || {};

        // 중첩 경로 'healthProfile.hba1c' 와, 지워야 할 리터럴 필드명 'healthProfile.hba1c'
        // 는 문자열로 완전히 같다. 하나의 객체에 담으면 뒤엣것이 앞엣것을 덮어써서,
        // 값을 넣으려던 자리를 그대로 지워 버린다(첫 dry-run 에서 이게 드러났다).
        // 리터럴 필드명은 한 조각짜리 FieldPath 로 지정해야 구분된다.
        const pairs = [];   // [경로(string|FieldPath), 값] 을 번갈아 넘긴다
        const preview = [];

        for (const [strayKey, nestedKey, read] of FIELD_MAP) {
            const value = read(metrics);
            // 이미 값이 있으면 덮지 않는다. 사용자가 직접 입력했을 수 있다.
            if (value !== undefined && profile[nestedKey] === undefined) {
                pairs.push(`healthProfile.${nestedKey}`, value);
                preview.push(`${nestedKey}=${JSON.stringify(value)}`);
            }
            // 점 든 최상위 필드가 실제로 만들어져 있으면 치운다.
            if (Object.prototype.hasOwnProperty.call(data, strayKey)) {
                pairs.push(new admin.firestore.FieldPath(strayKey), admin.firestore.FieldValue.delete());
                preview.push(`DELETE "${strayKey}"`);
                strayCleared += 1;
            }
        }

        if (pairs.length === 0) {
            console.log(`  - ${uid}: 고칠 것 없음 (최근 검사 ${docId})`);
            skipped += 1;
            continue;
        }

        console.log(`  - ${uid}: ${preview.join(", ")}  (최근 검사 ${docId})`);

        if (apply) {
            // update() 여야 점 표기가 경로로 해석된다. 이 백필이 존재하는 이유가 그것이다.
            await userRef.update(...pairs);
            updated += 1;
        }
    }

    console.log(`[backfill] 완료 — 수정 ${apply ? updated : "(dry-run)"}건, 건너뜀 ${skipped}건, 잘못된 필드 ${strayCleared}개 발견`);
    if (!apply) console.log("[backfill] 실제로 쓰려면 --apply 를 붙여 다시 실행한다.");
}

main().then(() => process.exit(0)).catch((error) => {
    console.error("[backfill] 실패:", error);
    process.exit(1);
});
