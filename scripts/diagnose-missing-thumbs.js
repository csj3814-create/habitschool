// 썸네일이 왜 안 만들어졌는지 원본 파일의 성질에서 찾는다. 읽기만 한다.
//
//   node scripts/diagnose-missing-thumbs.js <serviceAccountKey.json> [표본수]
//
// 썸네일 없는 항목과 있는 항목을 같은 방식으로 조사해 무엇이 다른지 비교한다.
// 대조군 없이 "실패한 것들은 HEIC였다"만 보면, 성공한 것도 HEIC였을 때 속는다.

const path = require('path');
let admin;
try {
    admin = require('firebase-admin');
} catch (_) {
    admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
}

const keyPath = process.argv[2];
const SAMPLE = Number(process.argv[3] || 200);
if (!keyPath) {
    console.error('사용법: node scripts/diagnose-missing-thumbs.js <serviceAccountKey.json> [표본수]');
    process.exit(1);
}

const key = require(keyPath);
admin.initializeApp({ credential: admin.credential.cert(key), storageBucket: `${key.project_id}.firebasestorage.app` });
const db = admin.firestore();
const bucket = admin.storage().bucket();

const has = (v) => typeof v === 'string' && v.trim().length > 0;

// https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded path>?alt=media&token=...
function storagePathFromUrl(url) {
    const m = /\/o\/([^?]+)/.exec(String(url || ''));
    return m ? decodeURIComponent(m[1]) : '';
}

async function describe(url) {
    const p = storagePathFromUrl(url);
    if (!p) return { path: '', error: 'URL 파싱 실패' };
    try {
        const [md] = await bucket.file(p).getMetadata();
        return {
            path: p,
            contentType: md.contentType || '(없음)',
            sizeMB: Number(md.size || 0) / (1024 * 1024),
            created: String(md.timeCreated || '').slice(0, 10)
        };
    } catch (e) {
        return { path: p, error: e.code === 404 ? '파일 없음(404)' : `조회 실패(${e.code || e.message})` };
    }
}

(async () => {
    const missing = [];
    const present = [];

    let last = null;
    for (;;) {
        let q = db.collection('daily_logs').orderBy('__name__').limit(500);
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty) break;

        for (const doc of snap.docs) {
            const ex = doc.get('exercise');
            if (!ex || typeof ex !== 'object') continue;
            const date = String(doc.get('date') || '');
            const push = (arr, kind, url) => arr.push({ kind, url, date, docId: doc.id });

            for (const it of Array.isArray(ex.cardioList) ? ex.cardioList : []) {
                if (!has(it?.imageUrl)) continue;
                push(has(it?.imageThumbUrl) ? present : missing, '유산소사진', it.imageUrl);
            }
            for (const it of Array.isArray(ex.strengthList) ? ex.strengthList : []) {
                if (!has(it?.videoUrl)) continue;
                push(has(it?.videoThumbUrl) ? present : missing, '근력영상', it.videoUrl);
            }
        }
        last = snap.docs[snap.docs.length - 1];
    }

    // 표본을 고르게 흩는다. 앞쪽만 보면 특정 시기에 쏠린다.
    const spread = (arr, n) => {
        if (arr.length <= n) return arr;
        const step = arr.length / n;
        return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
    };

    for (const [label, list] of [['썸네일 없음', spread(missing, SAMPLE)], ['썸네일 있음(대조군)', spread(present, SAMPLE)]]) {
        console.log(`\n${'='.repeat(60)}\n${label} — 표본 ${list.length}건\n${'='.repeat(60)}`);
        const byType = new Map();
        const byError = new Map();
        const sizes = [];
        const bump = (map, k) => map.set(k, (map.get(k) || 0) + 1);

        for (let i = 0; i < list.length; i += 20) {
            const chunk = list.slice(i, i + 20);
            const results = await Promise.all(chunk.map(item => describe(item.url)));
            results.forEach((r, j) => {
                if (r.error) { bump(byError, r.error); return; }
                bump(byType, `${chunk[j].kind} · ${r.contentType}`);
                sizes.push(r.sizeMB);
            });
            process.stderr.write(`\r  조회 ${Math.min(i + 20, list.length)}/${list.length}`);
        }
        process.stderr.write('\r' + ' '.repeat(30) + '\r');

        console.log('\ncontentType 분포:');
        [...byType.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
        if (byError.size) {
            console.log('\n원본 조회 실패:');
            [...byError.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
        }
        if (sizes.length) {
            sizes.sort((a, b) => a - b);
            const at = (q) => sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * q))].toFixed(1);
            console.log(`\n원본 크기(MB)  중앙값 ${at(0.5)} · 상위10% ${at(0.9)} · 최대 ${sizes[sizes.length - 1].toFixed(1)}`);
            console.log(`  10MB 초과 ${sizes.filter(s => s > 10).length}건 · 20MB 초과 ${sizes.filter(s => s > 20).length}건`);
        }
    }

    console.log(`\n전체 — 썸네일 없음 ${missing.length}건 / 있음 ${present.length}건`);
    await admin.app().delete();
})().catch((e) => { console.error(e); process.exit(1); });
