// 썸네일이 "만들어지지 않은" 것인지, "만들어졌는데 기록되지 않은" 것인지 가른다.
// 원본과 비슷한 시각에 _thumbnails 아래 파일이 있으면 생성은 성공한 것이고,
// 그렇다면 실패한 쪽은 Firestore 쓰기다. 읽기만 한다.
//
//   node scripts/diagnose-thumb-write-loss.js <serviceAccountKey.json> [표본수]

const path = require('path');
let admin;
try {
    admin = require('firebase-admin');
} catch (_) {
    admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
}

const keyPath = process.argv[2];
const SAMPLE = Number(process.argv[3] || 60);
if (!keyPath) {
    console.error('사용법: node scripts/diagnose-thumb-write-loss.js <serviceAccountKey.json> [표본수]');
    process.exit(1);
}

const key = require(keyPath);
admin.initializeApp({ credential: admin.credential.cert(key), storageBucket: `${key.project_id}.firebasestorage.app` });
const db = admin.firestore();
const bucket = admin.storage().bucket();

const has = (v) => typeof v === 'string' && v.trim().length > 0;
const storagePathFromUrl = (url) => {
    const m = /\/o\/([^?]+)/.exec(String(url || ''));
    return m ? decodeURIComponent(m[1]) : '';
};

// 사용자별 썸네일 폴더 목록을 한 번만 읽어 재사용한다.
const thumbCache = new Map();
async function thumbTimes(folder, uid) {
    const cacheKey = `${folder}/${uid}`;
    if (thumbCache.has(cacheKey)) return thumbCache.get(cacheKey);
    let times = [];
    try {
        const [files] = await bucket.getFiles({ prefix: `${folder}_thumbnails/${uid}/` });
        times = files.map(f => new Date(f.metadata.timeCreated).getTime()).sort((a, b) => a - b);
    } catch (_) {}
    thumbCache.set(cacheKey, times);
    return times;
}

(async () => {
    const missing = [];
    const byUser = new Map();

    let last = null;
    for (;;) {
        let q = db.collection('daily_logs').orderBy('__name__').limit(500);
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty) break;
        for (const doc of snap.docs) {
            const ex = doc.get('exercise');
            if (!ex || typeof ex !== 'object') continue;
            const uid = doc.get('userId') || doc.id.split('_')[0];
            for (const it of Array.isArray(ex.cardioList) ? ex.cardioList : []) {
                if (has(it?.imageUrl) && !has(it?.imageThumbUrl)) {
                    missing.push({ uid, folder: 'exercise_images', url: it.imageUrl });
                    byUser.set(uid, (byUser.get(uid) || 0) + 1);
                }
            }
            for (const it of Array.isArray(ex.strengthList) ? ex.strengthList : []) {
                if (has(it?.videoUrl) && !has(it?.videoThumbUrl)) {
                    missing.push({ uid, folder: 'exercise_videos', url: it.videoUrl });
                    byUser.set(uid, (byUser.get(uid) || 0) + 1);
                }
            }
        }
        last = snap.docs[snap.docs.length - 1];
    }

    console.log(`썸네일 없는 항목 ${missing.length}건 · 회원 ${byUser.size}명\n`);
    console.log('회원별 상위 10명 (쏠려 있으면 기기·환경 문제다):');
    [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        .forEach(([u, n]) => console.log(`  ${String(n).padStart(4)}건  ${u.slice(0, 10)}…`));

    const spread = (arr, n) => arr.length <= n ? arr
        : Array.from({ length: n }, (_, i) => arr[Math.floor(i * (arr.length / n))]);
    const sample = spread(missing, SAMPLE);

    let found = 0, notFound = 0, noOriginal = 0;
    const WINDOW_MS = 5 * 60 * 1000;   // 업로드 전후 5분

    for (const item of sample) {
        const p = storagePathFromUrl(item.url);
        if (!p) { noOriginal++; continue; }
        let origTime;
        try {
            const [md] = await bucket.file(p).getMetadata();
            origTime = new Date(md.timeCreated).getTime();
        } catch (_) { noOriginal++; continue; }

        const times = await thumbTimes(item.folder, item.uid);
        const near = times.some(t => Math.abs(t - origTime) <= WINDOW_MS);
        if (near) found++; else notFound++;
        process.stderr.write(`\r  대조 ${found + notFound + noOriginal}/${sample.length}`);
    }
    process.stderr.write('\r' + ' '.repeat(30) + '\r');

    console.log(`\n표본 ${sample.length}건 중 — 업로드 시각 ±5분 안에 썸네일 파일이`);
    console.log(`  있음   ${found}건   → 생성은 성공. Firestore 기록이 유실된 것`);
    console.log(`  없음   ${notFound}건   → 생성 자체가 실패한 것`);
    if (noOriginal) console.log(`  원본 조회 불가 ${noOriginal}건`);

    await admin.app().delete();
})().catch((e) => { console.error(e); process.exit(1); });
