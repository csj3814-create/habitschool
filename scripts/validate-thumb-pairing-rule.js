// 썸네일을 원본에 이어 붙이려면 짝짓는 규칙이 필요한데, 경로에 공유 토큰이 없다.
//   원본:   exercise_images/{uid}/{시각}_{일련번호}_{이름}
//   썸네일: exercise_images_thumbnails/{uid}/{시각}_{일련번호}_thumb.jpg
//
// 그래서 규칙을 짐작하는 대신, 이미 양쪽이 다 적힌 기록(정답지)으로 검증한다.
// 정확도가 충분하지 않으면 백필하지 않는다 — 엉뚱한 사진의 썸네일을 붙이는 것은
// 썸네일이 없는 것보다 나쁘다. 읽기만 한다.
//
//   node scripts/validate-thumb-pairing-rule.js <serviceAccountKey.json>

const path = require('path');
let admin;
try {
    admin = require('firebase-admin');
} catch (_) {
    admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
}

const keyPath = process.argv[2];
if (!keyPath) {
    console.error('사용법: node scripts/validate-thumb-pairing-rule.js <serviceAccountKey.json>');
    process.exit(1);
}

const key = require(keyPath);
admin.initializeApp({ credential: admin.credential.cert(key), storageBucket: `${key.project_id}.firebasestorage.app` });
const db = admin.firestore();

const has = (v) => typeof v === 'string' && v.trim().length > 0;
const storagePath = (url) => {
    const m = /\/o\/([^?]+)/.exec(String(url || ''));
    return m ? decodeURIComponent(m[1]) : '';
};
// {시각}_{일련번호}_{이름}
const parseName = (p) => {
    const base = p.split('/').pop() || '';
    const m = /^(\d+)_(\d+)_/.exec(base);
    return m ? { ms: Number(m[1]), seq: Number(m[2]) } : null;
};

(async () => {
    const pairs = [];   // 정답지: 원본과 썸네일이 모두 적힌 것

    let last = null;
    for (;;) {
        let q = db.collection('daily_logs').orderBy('__name__').limit(500);
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty) break;
        for (const doc of snap.docs) {
            const ex = doc.get('exercise');
            if (!ex || typeof ex !== 'object') continue;
            for (const it of Array.isArray(ex.cardioList) ? ex.cardioList : []) {
                if (has(it?.imageUrl) && has(it?.imageThumbUrl)) {
                    pairs.push({ kind: '유산소', o: storagePath(it.imageUrl), t: storagePath(it.imageThumbUrl) });
                }
            }
            for (const it of Array.isArray(ex.strengthList) ? ex.strengthList : []) {
                if (has(it?.videoUrl) && has(it?.videoThumbUrl)) {
                    pairs.push({ kind: '근력', o: storagePath(it.videoUrl), t: storagePath(it.videoThumbUrl) });
                }
            }
        }
        last = snap.docs[snap.docs.length - 1];
    }

    console.log(`정답지 ${pairs.length}쌍\n`);

    const dtList = [];
    const dseqList = [];
    let unparsed = 0;
    for (const p of pairs) {
        const a = parseName(p.o);
        const b = parseName(p.t);
        if (!a || !b) { unparsed++; continue; }
        dtList.push(b.ms - a.ms);
        dseqList.push(b.seq - a.seq);
    }

    const summarize = (label, arr, unit) => {
        if (!arr.length) return;
        const sorted = [...arr].sort((x, y) => x - y);
        const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
        console.log(`${label}  최소 ${at(0)} · 25% ${at(0.25)} · 중앙 ${at(0.5)} · 75% ${at(0.75)} · 95% ${at(0.95)} · 최대 ${at(1)} ${unit}`);
    };
    summarize('썸네일 - 원본 시각차 ', dtList, 'ms');
    summarize('썸네일 - 원본 일련번호차', dseqList, '');
    if (unparsed) console.log(`\n이름 형식이 달라 못 읽음 ${unparsed}쌍`);

    const seqCount = new Map();
    dseqList.forEach(d => seqCount.set(d, (seqCount.get(d) || 0) + 1));
    console.log('\n일련번호차 분포 (상위 8):');
    [...seqCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
        .forEach(([d, n]) => console.log(`  차이 ${String(d).padStart(4)}  ${String(n).padStart(5)}쌍  ${((n / dseqList.length) * 100).toFixed(1)}%`));

    const within = (ms) => dtList.filter(d => d >= 0 && d <= ms).length;
    console.log('\n시각차가 이 안에 드는 비율:');
    [2000, 5000, 15000, 60000].forEach(ms =>
        console.log(`  ${String(ms / 1000).padStart(3)}초 이내  ${((within(ms) / dtList.length) * 100).toFixed(1)}%`));

    console.log('\n판단: 일련번호차가 한 값에 강하게 몰리고 시각차가 좁으면 규칙으로 쓸 수 있다.');
    console.log('      흩어져 있으면 짝짓기를 포기하고 원본에서 새로 만드는 편이 안전하다.');

    await admin.app().delete();
})().catch((e) => { console.error(e); process.exit(1); });
