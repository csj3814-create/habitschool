// 운동 사진·영상 중 썸네일이 없는 것을 센다. 읽기만 한다 — 쓰기 경로가 없다.
//
//   node scripts/count-missing-exercise-thumbs.js <serviceAccountKey.json>
//
// 세는 대상:
//   exercise.cardioList[].imageUrl 있고 imageThumbUrl 없음
//   exercise.strengthList[].videoUrl 있고 videoThumbUrl 없음
//   레거시 단일 필드(cardioImageUrl / strengthVideoUrl)도 따로 센다.

const path = require('path');
// 이 저장소 루트에는 firebase-admin이 없다. functions/ 쪽 설치본을 쓴다.
let admin;
try {
    admin = require('firebase-admin');
} catch (_) {
    admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
}

const keyPath = process.argv[2];
if (!keyPath) {
    console.error('사용법: node scripts/count-missing-exercise-thumbs.js <serviceAccountKey.json>');
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

const has = (v) => typeof v === 'string' && v.trim().length > 0;

(async () => {
    const stats = {
        docs: 0,
        docsWithExercise: 0,
        cardioItems: 0, cardioMissing: 0,
        strengthItems: 0, strengthMissing: 0,
        legacyCardio: 0, legacyCardioMissing: 0,
        legacyStrength: 0, legacyStrengthMissing: 0
    };
    // 언제 만들어진 것들인지 알아야 "지금도 생기는 문제"인지 판단할 수 있다.
    const missingByMonth = new Map();
    const affectedUsers = new Set();

    let last = null;
    for (;;) {
        let q = db.collection('daily_logs').orderBy('__name__').limit(500);
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty) break;

        for (const doc of snap.docs) {
            stats.docs++;
            const ex = doc.get('exercise');
            if (!ex || typeof ex !== 'object') continue;
            stats.docsWithExercise++;

            const date = String(doc.get('date') || doc.id.slice(-10) || '');
            const month = /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : 'unknown';
            let docMissing = 0;

            for (const item of Array.isArray(ex.cardioList) ? ex.cardioList : []) {
                if (!has(item?.imageUrl)) continue;
                stats.cardioItems++;
                if (!has(item?.imageThumbUrl)) { stats.cardioMissing++; docMissing++; }
            }
            for (const item of Array.isArray(ex.strengthList) ? ex.strengthList : []) {
                if (!has(item?.videoUrl)) continue;
                stats.strengthItems++;
                if (!has(item?.videoThumbUrl)) { stats.strengthMissing++; docMissing++; }
            }
            if (has(ex.cardioImageUrl)) {
                stats.legacyCardio++;
                if (!has(ex.cardioImageThumbUrl)) { stats.legacyCardioMissing++; docMissing++; }
            }
            if (has(ex.strengthVideoUrl)) {
                stats.legacyStrength++;
                if (!has(ex.strengthVideoThumbUrl)) { stats.legacyStrengthMissing++; docMissing++; }
            }

            if (docMissing > 0) {
                missingByMonth.set(month, (missingByMonth.get(month) || 0) + docMissing);
                const uid = doc.get('userId') || doc.id.split('_')[0];
                if (uid) affectedUsers.add(uid);
            }
        }

        last = snap.docs[snap.docs.length - 1];
        process.stderr.write(`\r훑는 중: ${stats.docs}건`);
    }
    process.stderr.write('\n\n');

    const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
    console.log(`전체 daily_logs        ${stats.docs}건 (운동 기록 있음 ${stats.docsWithExercise}건)`);
    console.log('');
    console.log(`유산소 사진 (배열)     ${stats.cardioItems}장 중 썸네일 없음 ${stats.cardioMissing}장  ${pct(stats.cardioMissing, stats.cardioItems)}`);
    console.log(`근력 영상 (배열)       ${stats.strengthItems}개 중 썸네일 없음 ${stats.strengthMissing}개  ${pct(stats.strengthMissing, stats.strengthItems)}`);
    console.log(`유산소 사진 (레거시)   ${stats.legacyCardio}장 중 썸네일 없음 ${stats.legacyCardioMissing}장  ${pct(stats.legacyCardioMissing, stats.legacyCardio)}`);
    console.log(`근력 영상 (레거시)     ${stats.legacyStrength}개 중 썸네일 없음 ${stats.legacyStrengthMissing}개  ${pct(stats.legacyStrengthMissing, stats.legacyStrength)}`);
    console.log('');
    console.log(`영향받은 회원          ${affectedUsers.size}명`);
    console.log('');
    console.log('월별 (썸네일 없는 항목 수) — 최근 것이 있으면 지금도 생기는 문제다:');
    [...missingByMonth.entries()].sort().forEach(([m, n]) => console.log(`  ${m}  ${n}`));

    await admin.app().delete();
})().catch((e) => { console.error(e); process.exit(1); });
