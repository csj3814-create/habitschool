// MVP 순위 기준을 "기록 일수"에서 "활동 포인트"로 바꾸기 전에, 실제 분포를 잰다.
// 읽기만 한다 — 쓰기 경로가 없다.
//
//   node scripts/measure-mvp-score-distribution-2026-08-21.js <serviceAccountKey.json> [YYYY-MM]
//
// 재는 것:
//   1. days 포화도 — 상위권이 실제로 같은 일수에 몰려 있나, 동점이 몇 명이나 되나
//   2. 활동 포인트(dietPoints+exercisePoints+mindPoints)가 그 포화 구간을 실제로 가르나
//   3. 현재 식에서 사회적 항(댓글·리액션)이 차지하는 비중 — 새 식에서 이걸 보존할 배수 산출
//   4. 옛 식 vs 새 식 상위 순위가 얼마나 바뀌나
//   5. 주간(gallery_posts)도 같은 항목 + hidePoints/hideX로 포인트가 0이 되는 비율
//
// 주의: 월간과 주간은 댓글·리액션의 의미가 다르다.
//   월간(daily_logs)   = 내가 "남긴" 댓글·리액션 (참여)
//   주간(gallery_posts) = 내 글이 "받은" 댓글·리액션 (인기)
// 이 스크립트는 각각의 현행 의미를 그대로 재현한다. 섞지 않는다.

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
    console.error('사용법: node scripts/measure-mvp-score-distribution-2026-08-21.js <serviceAccountKey.json> [YYYY-MM]');
    process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

// ---- functions/runtime.js 와 같은 집계 규칙 ----
const uniqueReactionUserIds = (log = {}) => {
    const s = new Set();
    const r = log?.reactions || {};
    ['heart', 'fire', 'clap'].forEach(t => {
        (Array.isArray(r[t]) ? r[t] : []).forEach(uid => { if (uid) s.add(uid); });
    });
    return [...s];
};
const uniqueCommentUserIds = (log = {}) => {
    const s = new Set();
    (Array.isArray(log?.comments) ? log.comments : []).forEach(c => { if (c?.userId) s.add(c.userId); });
    return [...s];
};
const activityPoints = (log = {}) => {
    const ap = log?.awardedPoints || {};
    return (Number(ap.dietPoints) || 0) + (Number(ap.exercisePoints) || 0) + (Number(ap.mindPoints) || 0);
};

const pct = (n, d) => d ? `${(n / d * 100).toFixed(1)}%` : '-';
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const median = (xs) => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// 동점 때문에 순위가 흔들리는 정도. 상위 N 경계에 걸친 동점자 수를 센다.
function tieReport(sortedDesc, scoreKey, topN) {
    const scores = sortedDesc.map(u => u[scoreKey]);
    const cutoff = scores[topN - 1];
    if (cutoff === undefined) return { cutoff: null, tiedAtCutoff: 0, distinctInTop: scores.length };
    return {
        cutoff,
        tiedAtCutoff: scores.filter(s => s === cutoff).length,
        distinctInTop: new Set(scores.slice(0, topN)).size
    };
}

function spearman(rankA, rankB) {
    const ids = [...rankA.keys()].filter(id => rankB.has(id));
    const n = ids.length;
    if (n < 2) return null;
    const d2 = ids.reduce((sum, id) => sum + Math.pow(rankA.get(id) - rankB.get(id), 2), 0);
    return 1 - (6 * d2) / (n * (n * n - 1));
}
const rankMap = (list, key) => {
    const sorted = [...list].sort((a, b) => b[key] - a[key]);
    return new Map(sorted.map((u, i) => [u.userId, i + 1]));
};

function printTop(label, list, key, extra) {
    console.log(`\n  ${label}`);
    [...list].sort((a, b) => b[key] - a[key]).slice(0, 10).forEach((u, i) => {
        const name = String(u.name).slice(0, 10).padEnd(12);
        console.log(`    ${String(i + 1).padStart(2)}. ${name} ${String(Math.round(u[key])).padStart(6)}점  ${extra(u)}`);
    });
}

// ================================ 월간 ================================
async function measureMonthly(month) {
    const [year, mm] = month.split('-');
    const snap = await db.collection('daily_logs')
        .where('date', '>=', `${year}-${mm}-01`)
        .where('date', '<=', `${year}-${mm}-31`)
        .get();

    const stats = {};
    const touch = (uid, name) => {
        if (!stats[uid]) {
            stats[uid] = { userId: uid, name: name || '익명', days: 0, points: 0, comments: 0, reactions: 0, dayPoints: [] };
        }
        return stats[uid];
    };

    let zeroPointDays = 0;
    snap.forEach(d => {
        const log = d.data();
        if (log.userId) {
            const u = touch(log.userId, log.userName);
            if (log.userName) u.name = log.userName;
            u.days++;
            const p = activityPoints(log);
            u.points += p;
            u.dayPoints.push(p);
            if (p === 0) zeroPointDays++;
        }
        uniqueCommentUserIds(log).forEach(uid => touch(uid, '익명').comments++);
        uniqueReactionUserIds(log).forEach(uid => touch(uid, '회원').reactions++);
    });

    const users = Object.values(stats).filter(u => u.days > 0);
    if (users.length === 0) { console.log(`\n${month}: 기록 없음`); return null; }

    users.forEach(u => {
        u.recordOld = u.days * 10;
        u.socialRaw = u.comments * 3 + u.reactions * 1;
        u.oldScore = u.recordOld + u.socialRaw;
        u.pointsOnly = u.points;
    });

    console.log(`\n${'='.repeat(74)}`);
    console.log(`월간 MVP - ${month}   daily_logs ${snap.size}건 · 기록자 ${users.length}명`);
    console.log('='.repeat(74));

    // 1. days 포화
    const daysList = users.map(u => u.days).sort((a, b) => b - a);
    const maxDays = daysList[0];
    console.log(`\n[1] days 포화도`);
    console.log(`    최대 ${maxDays}일 · 중앙값 ${median(daysList)}일 · 평균 ${mean(daysList).toFixed(1)}일`);
    [1, 0.9, 0.8].forEach(f => {
        const t = Math.floor(maxDays * f);
        const n = users.filter(u => u.days >= t).length;
        console.log(`    ${t}일 이상: ${n}명 (${pct(n, users.length)})`);
    });
    const daysHist = {};
    users.forEach(u => { daysHist[u.days] = (daysHist[u.days] || 0) + 1; });
    console.log('    상위 일수 분포: ' + Object.entries(daysHist)
        .sort((a, b) => Number(b[0]) - Number(a[0])).slice(0, 6)
        .map(([d, n]) => `${d}일x${n}명`).join('  '));

    const oldSorted = [...users].sort((a, b) => b.oldScore - a.oldScore);
    const oldTie = tieReport(oldSorted, 'oldScore', 3);
    console.log(`    현행 식 3위 커트라인 ${oldTie.cutoff}점 · 그 점수 동점자 ${oldTie.tiedAtCutoff}명`);

    // 2. 활동 포인트가 포화 구간을 가르나
    const satThreshold = Math.max(1, Math.floor(maxDays * 0.8));
    const cohort = users.filter(u => u.days >= satThreshold);
    const cohortPts = cohort.map(u => u.points);
    console.log(`\n[2] 활동 포인트가 포화 구간(${satThreshold}일 이상 ${cohort.length}명)을 가르는가`);
    if (cohort.length >= 2) {
        const mn = Math.min(...cohortPts), mx = Math.max(...cohortPts), av = mean(cohortPts);
        const sd = Math.sqrt(mean(cohortPts.map(p => (p - av) ** 2)));
        console.log(`    포인트 최소 ${mn} · 중앙 ${median(cohortPts)} · 최대 ${mx} · 평균 ${av.toFixed(0)} · 표준편차 ${sd.toFixed(0)}`);
        console.log(`    변동계수 ${(sd / av).toFixed(3)}   (0.15 이상이면 변별력 있다고 본다)`);
        console.log(`    최대/최소 ${mn > 0 ? (mx / mn).toFixed(2) + '배' : '최소가 0'}`);
        console.log(`    이 구간 내 서로 다른 포인트 값 ${new Set(cohortPts).size}개 / ${cohort.length}명`);
    } else {
        console.log('    표본 부족');
    }
    const allDayPoints = users.flatMap(u => u.dayPoints);
    console.log(`    하루치 포인트(전체 ${allDayPoints.length}일): 평균 ${mean(allDayPoints).toFixed(1)} · 중앙 ${median(allDayPoints)} · 0점 ${zeroPointDays}일 (${pct(zeroPointDays, allDayPoints.length)})`);

    // 3. 사회적 항 비중 -> 배수 산출
    const top20 = oldSorted.slice(0, 20);
    const recordMean = mean(top20.map(u => u.recordOld));
    const pointsMean = mean(top20.map(u => u.points));
    const socialMean = mean(top20.map(u => u.socialRaw));
    const currentShare = socialMean / (recordMean + socialMean);
    const scale = recordMean > 0 ? pointsMean / recordMean : 1;
    console.log(`\n[3] 사회적 항 비중 보존 배수 (현행 상위 20명 기준)`);
    console.log(`    현행: 기록항 평균 ${recordMean.toFixed(0)} · 사회항 평균 ${socialMean.toFixed(0)} -> 사회 비중 ${(currentShare * 100).toFixed(1)}%`);
    console.log(`    새 기록항(활동 포인트) 평균 ${pointsMean.toFixed(0)} -> 배율 ${scale.toFixed(2)}배`);
    console.log(`    비중 보존 배수: 댓글 x${(3 * scale).toFixed(1)}  리액션 x${(1 * scale).toFixed(1)}`);
    const C = Math.max(1, Math.round(3 * scale));
    const R = Math.max(1, Math.round(1 * scale));
    console.log(`    반올림 제안: 댓글 x${C}  리액션 x${R}`);

    // 4. 순위 변화
    users.forEach(u => { u.newScore = u.points + u.comments * C + u.reactions * R; });
    printTop('현행 (days x10 + 댓글 x3 + 리액션 x1)', users, 'oldScore',
        u => `${u.days}일 댓글${u.comments} 리액션${u.reactions} (포인트 ${u.points})`);
    printTop('포인트만', users, 'pointsOnly',
        u => `${u.days}일 댓글${u.comments} 리액션${u.reactions}`);
    printTop(`제안 (포인트 + 댓글 x${C} + 리액션 x${R})`, users, 'newScore',
        u => `${u.days}일 댓글${u.comments} 리액션${u.reactions} (포인트 ${u.points})`);

    const rOld = rankMap(users, 'oldScore');
    console.log(`\n[4] 순위 상관 (1.0 = 완전 동일)`);
    console.log(`    현행 vs 포인트만 : rho = ${(spearman(rOld, rankMap(users, 'pointsOnly')) ?? 0).toFixed(3)}`);
    console.log(`    현행 vs 제안     : rho = ${(spearman(rOld, rankMap(users, 'newScore')) ?? 0).toFixed(3)}`);

    const newTie = tieReport([...users].sort((a, b) => b.newScore - a.newScore), 'newScore', 3);
    console.log(`    제안 식 3위 커트라인 ${newTie.cutoff}점 · 동점자 ${newTie.tiedAtCutoff}명 (현행 ${oldTie.tiedAtCutoff}명)`);

    return { C, R };
}

// ================================ 주간 ================================
async function measureWeekly() {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    const dow = kst.getUTCDay();
    const monday = new Date(kst);
    monday.setUTCDate(kst.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
    const mondayStr = monday.toISOString().slice(0, 10);

    // 화면은 updatedAt desc + limit 300 을 쓴다. 잘림이 실제로 일어나는지도 함께 본다.
    const snap = await db.collection('gallery_posts').orderBy('updatedAt', 'desc').limit(300).get();
    const all = [];
    snap.forEach(d => all.push(d.data()));
    const week = all.filter(p => (p.date || '') >= mondayStr);

    console.log(`\n${'='.repeat(74)}`);
    console.log(`주간 열심 학생 - ${mondayStr} 이후 · gallery_posts 상위 300건 중 ${week.length}건`);
    console.log('='.repeat(74));
    if (snap.size === 300) {
        const oldest = all.map(p => p.date).filter(Boolean).sort()[0];
        console.log(`    [경고] limit 300에 걸림. 가장 오래된 문서 날짜 ${oldest} - 이번 주가 잘렸는지 확인 필요`);
    }
    if (week.length === 0) { console.log('\n    이번 주 데이터 없음'); return null; }

    // hidePoints / hideX 로 포인트가 0이 되는 비율 — 새 기준의 최대 위험
    let noPointsField = 0, zeroPoints = 0, hidDiet = 0, hidEx = 0, hidMind = 0;
    week.forEach(p => {
        const ss = p.shareSettings || {};
        if (ss.hideDiet) hidDiet++;
        if (ss.hideExercise) hidEx++;
        if (ss.hideMind) hidMind++;
        if (!p.awardedPoints) noPointsField++;
        else if (activityPoints(p) === 0) zeroPoints++;
    });
    console.log(`\n[1] 공유 설정으로 포인트가 가려지는 정도 (새 기준의 최대 위험)`);
    console.log(`    awardedPoints 필드 자체가 없음(hidePoints): ${noPointsField}건 (${pct(noPointsField, week.length)})`);
    console.log(`    필드는 있으나 합계 0: ${zeroPoints}건 (${pct(zeroPoints, week.length)})`);
    console.log(`    hideDiet ${hidDiet} · hideExercise ${hidEx} · hideMind ${hidMind}`);

    const stats = {};
    week.forEach(p => {
        const uid = p.userId;
        if (!uid) return;
        if (!stats[uid]) {
            stats[uid] = { userId: uid, name: p.userName || '익명', dates: new Set(), points: 0, reactions: 0, comments: 0, hiddenPosts: 0 };
        }
        const u = stats[uid];
        if (p.userName) u.name = p.userName;
        if (p.date) u.dates.add(p.date);
        u.points += activityPoints(p);
        if (!p.awardedPoints) u.hiddenPosts++;
        u.reactions += uniqueReactionUserIds(p).length;   // 받은 것
        u.comments += uniqueCommentUserIds(p).length;     // 받은 것
    });

    const users = Object.values(stats).map(u => ({ ...u, days: u.dates.size }));
    users.forEach(u => {
        u.recordOld = u.days * 10;
        u.socialRaw = u.reactions * 2 + u.comments * 3;
        u.oldScore = u.recordOld + u.socialRaw;
    });
    const active = users.filter(u => u.oldScore > 0);
    if (active.length === 0) { console.log('\n    이번 주 참여자 없음'); return null; }

    const daysList = active.map(u => u.days).sort((a, b) => b - a);
    console.log(`\n[2] days 포화도 (주간은 천장이 7일이라 더 심함)`);
    console.log(`    참여 ${active.length}명 · 최대 ${daysList[0]}일 · 중앙값 ${median(daysList)}일`);
    const dh = {};
    active.forEach(u => { dh[u.days] = (dh[u.days] || 0) + 1; });
    console.log('    분포: ' + Object.entries(dh).sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([d, n]) => `${d}일x${n}명`).join('  '));
    const oldSorted = [...active].sort((a, b) => b.oldScore - a.oldScore);
    const oldTie = tieReport(oldSorted, 'oldScore', 3);
    console.log(`    현행 식 3위 커트라인 ${oldTie.cutoff}점 · 동점자 ${oldTie.tiedAtCutoff}명`);

    const top10 = oldSorted.slice(0, 10);
    const recordMean = mean(top10.map(u => u.recordOld));
    const pointsMean = mean(top10.map(u => u.points));
    const socialMean = mean(top10.map(u => u.socialRaw));
    const scale = recordMean > 0 ? pointsMean / recordMean : 1;
    console.log(`\n[3] 사회적 항 비중 보존 배수 (현행 상위 10명)`);
    console.log(`    현행: 기록항 ${recordMean.toFixed(0)} · 사회항 ${socialMean.toFixed(0)} -> 사회 비중 ${(socialMean / (recordMean + socialMean) * 100).toFixed(1)}%`);
    console.log(`    새 기록항(활동 포인트) ${pointsMean.toFixed(0)} -> 배율 ${scale.toFixed(2)}배`);
    const C = Math.max(1, Math.round(3 * scale));
    const R = Math.max(1, Math.round(2 * scale));
    console.log(`    비중 보존 배수: 댓글 x${(3 * scale).toFixed(1)} 리액션 x${(2 * scale).toFixed(1)} -> 반올림 댓글 x${C} 리액션 x${R}`);

    active.forEach(u => { u.newScore = u.points + u.comments * C + u.reactions * R; });
    const tail = u => `${u.days}일 받은댓글${u.comments} 받은리액션${u.reactions} (포인트 ${u.points}${u.hiddenPosts ? `, 가려진글 ${u.hiddenPosts}` : ''})`;
    printTop('현행 (days x10 + 리액션 x2 + 댓글 x3)', active, 'oldScore', tail);
    printTop(`제안 (포인트 + 댓글 x${C} + 리액션 x${R})`, active, 'newScore', tail);

    const newTie = tieReport([...active].sort((a, b) => b.newScore - a.newScore), 'newScore', 3);
    console.log(`\n[4] rho = ${(spearman(rankMap(active, 'oldScore'), rankMap(active, 'newScore')) ?? 0).toFixed(3)}`);
    console.log(`    제안 식 3위 동점자 ${newTie.tiedAtCutoff}명 (현행 ${oldTie.tiedAtCutoff}명)`);
    const affected = active.filter(u => u.hiddenPosts > 0).length;
    console.log(`    포인트가 가려진 글을 가진 참여자 ${affected}명 (${pct(affected, active.length)}) - 이들은 새 기준에서 불리해짐`);
    return { C, R };
}

// ======================== 공유 · 초대 (주간 대안 축) ========================
//
// 주간 리스트를 "얼마나 공유했나 / 초대했나 / 초대에 성공했나"로 바꾸자는 안을 재는 곳.
// 가장 먼저 확인해야 할 것은 가중치가 아니라 표본이다:
//   일주일 안에 초대 성공이 1건이라도 있는 사람이 몇 명인가?
// 이게 3명 미만이면 주간 TOP 3는 만들 수가 없다. 배수 논의는 그 다음이다.
async function measureShareAndInvite() {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    const dayMs = 24 * 3600 * 1000;
    const dow = kst.getUTCDay();
    const monday = new Date(kst);
    monday.setUTCDate(kst.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
    const mondayMs = Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()) - 9 * 3600 * 1000;
    const nowMs = Date.now();

    const toMs = (v) => {
        if (!v) return 0;
        if (typeof v.toDate === 'function') return v.toDate().getTime();
        if (v instanceof Date) return v.getTime();
        if (typeof v === 'number') return v;
        const t = Date.parse(v);
        return Number.isFinite(t) ? t : 0;
    };
    const kstDateKey = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

    console.log(`\n${'='.repeat(74)}`);
    console.log('공유 · 초대 축 (주간 리스트 대안)');
    console.log('='.repeat(74));

    // ---- 공유: share_cards. TTL 30일이라 그 이전은 이미 지워졌다. ----
    const cardSnap = await db.collection('share_cards').get();
    const cards = [];
    cardSnap.forEach(d => {
        const c = d.data();
        if (c?.userId) cards.push({ userId: c.userId, ms: toMs(c.createdAt) });
    });
    const weekCards = cards.filter(c => c.ms >= mondayMs);
    const card30 = cards.filter(c => c.ms >= nowMs - 30 * dayMs);

    console.log(`\n[1] 공유 카드 (share_cards, TTL 30일)`);
    console.log(`    전체 살아있는 카드 ${cards.length}건 · 최근 30일 ${card30.length}건 · 이번 주 ${weekCards.length}건`);

    const byUserWeek = {};
    const perUserPerDay = {};
    weekCards.forEach(c => {
        byUserWeek[c.userId] = (byUserWeek[c.userId] || 0) + 1;
        const k = `${c.userId}|${kstDateKey(c.ms)}`;
        perUserPerDay[k] = (perUserPerDay[k] || 0) + 1;
    });
    const sharers = Object.entries(byUserWeek).map(([userId, n]) => ({ userId, shares: n }));
    console.log(`    이번 주 공유한 사람 ${sharers.length}명`);
    if (sharers.length) {
        const counts = sharers.map(s => s.shares).sort((a, b) => b - a);
        console.log(`    1인당 공유 수: 최대 ${counts[0]} · 중앙 ${median(counts)} · 평균 ${mean(counts).toFixed(1)}`);
        console.log(`    분포: ` + counts.slice(0, 12).join(', ') + (counts.length > 12 ? ' ...' : ''));
    }
    // 어뷰징 지표 — 토큰은 카드를 다시 그릴 때마다 새로 생긴다(app-core.js:22746).
    // 같은 사람이 하루에 카드를 여러 장 올렸다면 그만큼 문서가 쌓인다.
    const dayCounts = Object.values(perUserPerDay);
    const maxPerDay = dayCounts.length ? Math.max(...dayCounts) : 0;
    const overThree = dayCounts.filter(n => n >= 3).length;
    console.log(`    [어뷰징 점검] 1인 1일 최대 ${maxPerDay}건 · 하루 3건 이상인 (사람,날짜) ${overThree}쌍`);
    console.log(`                   -> 이 값이 크면 '공유 횟수' 그대로는 보상 기준으로 못 쓴다`);
    const dedupWeek = {};
    Object.keys(perUserPerDay).forEach(k => {
        const uid = k.split('|')[0];
        dedupWeek[uid] = (dedupWeek[uid] || 0) + 1;   // 하루 1회로 눌러 센 값
    });
    console.log(`    하루 1회로 눌러 세면: 상위 ` + Object.values(dedupWeek).sort((a, b) => b - a).slice(0, 10).join(', '));

    // ---- 초대: users.referredBy + referralDay3BonusGiven ----
    const usersSnap = await db.collection('users')
        .select('customDisplayName', 'displayName', 'createdAt', 'referredBy',
                'referralDay3BonusGiven', 'referralDay3BonusAt', 'referralDay3BonusDate')
        .get();

    const nameOf = {};
    const invitedByWeek = {};   // 이번 주에 가입한 피초대자 수
    const invitedByAll = {};    // 누적 피초대자 수
    const successWeek = {};     // 이번 주에 3일 스트릭을 채운 피초대자 수 (= 초대 성공)
    const successAll = {};

    usersSnap.forEach(d => {
        const u = d.data() || {};
        nameOf[d.id] = u.customDisplayName || u.displayName || '익명';
        const ref = String(u.referredBy || '').trim();
        if (!ref) return;
        invitedByAll[ref] = (invitedByAll[ref] || 0) + 1;
        if (toMs(u.createdAt) >= mondayMs) invitedByWeek[ref] = (invitedByWeek[ref] || 0) + 1;
        if (u.referralDay3BonusGiven === true) {
            successAll[ref] = (successAll[ref] || 0) + 1;
            const okMs = toMs(u.referralDay3BonusAt) || toMs(u.referralDay3BonusDate);
            if (okMs >= mondayMs) successWeek[ref] = (successWeek[ref] || 0) + 1;
        }
    });

    console.log(`\n[2] 초대 (users ${usersSnap.size}명)`);
    console.log(`    referredBy 가 있는 회원 ${Object.values(invitedByAll).reduce((a, b) => a + b, 0)}명`);
    console.log(`    누적 초대자 ${Object.keys(invitedByAll).length}명 · 누적 초대 성공자 ${Object.keys(successAll).length}명`);
    console.log(`    이번 주 초대 발생: ${Object.keys(invitedByWeek).length}명이 총 ${Object.values(invitedByWeek).reduce((a, b) => a + b, 0)}명 초대`);
    console.log(`    이번 주 초대 성공: ${Object.keys(successWeek).length}명이 총 ${Object.values(successWeek).reduce((a, b) => a + b, 0)}건`);

    // ---- 핵심 판정: 주간 TOP 3를 만들 표본이 되는가 ----
    console.log(`\n[3] 판정 - 주간 TOP 3를 세울 표본이 되는가`);
    const inviteRankable = Object.keys(successWeek).length;
    const shareRankable = sharers.length;
    console.log(`    초대 성공 기준으로 줄 세울 수 있는 사람: ${inviteRankable}명  ${inviteRankable < 3 ? '<- 3명 미만. 주간 단독 축으로 불가' : ''}`);
    console.log(`    초대(성공 무관) 기준: ${Object.keys(invitedByWeek).length}명`);
    console.log(`    공유 기준: ${shareRankable}명`);
    // 지난 4주로 넓히면 되는지도 같이 본다.
    let weeksWithEnough = 0;
    for (let w = 0; w < 4; w++) {
        const hi = mondayMs - w * 7 * dayMs, lo = hi - 7 * dayMs;
        const n = new Set(cards.filter(c => c.ms >= lo && c.ms < hi).map(c => c.userId)).size;
        if (n >= 3) weeksWithEnough++;
        console.log(`    ${w + 1}주 전 공유자 수: ${n}명`);
    }
    console.log(`    최근 4주 중 공유자 3명 이상인 주: ${weeksWithEnough}/4`);

    // ---- 후보 합성 점수 미리보기 ----
    // 공유는 하루 1회로 눌러 세고(어뷰징 차단), 성공한 초대에 가장 큰 가중치를 준다.
    const allUids = new Set([...Object.keys(dedupWeek), ...Object.keys(invitedByWeek), ...Object.keys(successWeek)]);
    const candidates = [...allUids].map(uid => {
        const sh = dedupWeek[uid] || 0;
        const inv = invitedByWeek[uid] || 0;
        const ok = successWeek[uid] || 0;
        return {
            userId: uid, name: nameOf[uid] || '익명', shares: sh, invites: inv, success: ok,
            spreadScore: sh * 5 + inv * 20 + ok * 100
        };
    }).filter(u => u.spreadScore > 0);

    console.log(`\n[4] 후보 확산 점수 = 공유(하루1회) x5 + 초대 x20 + 초대성공 x100`);
    if (candidates.length === 0) {
        console.log('    이번 주 해당자 없음 - 이 축만으로는 리스트가 비어버린다');
    } else {
        printTop(`확산 점수 상위 (해당자 ${candidates.length}명)`, candidates, 'spreadScore',
            u => `공유${u.shares} 초대${u.invites} 성공${u.success}`);
        const tie = tieReport([...candidates].sort((a, b) => b.spreadScore - a.spreadScore), 'spreadScore', 3);
        console.log(`    3위 커트라인 ${tie.cutoff}점 · 동점자 ${tie.tiedAtCutoff}명`);
    }
    return { candidates };
}

(async () => {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    const month = process.argv[3] || `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}`;
    await measureMonthly(month);
    await measureWeekly();
    await measureShareAndInvite();
    console.log('\n측정 완료 - 쓰기 없음\n');
    process.exit(0);
})().catch(e => { console.error('실패:', e); process.exit(1); });
