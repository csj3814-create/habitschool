"use strict";

/**
 * 월간 MVP 점수 — 단일 진실 공급원.
 *
 * 이 파일이 생긴 이유:
 * 점수 식이 runtime.js 안에 세 벌(지급 · 시간별 집계 · 아카이브) 복사돼 있었다.
 * 리액션 쓰기 경로가 daily_logs 에서 gallery_posts 로 옮겨갔을 때(리액션 UID를
 * 위조해 코인을 찍어낼 수 있던 취약점 수정, runtime.js의 toggleReactionOnPost)
 * 세 벌 모두 옛 소스를 계속 읽었다.
 *
 * 결과(2026-08-21 측정):
 *   - 화면의 "댓글 0개 · 리액션 0개"는 거짓이었다. 실제 8월 리액션은 494개.
 *   - MVP 점수가 days*10 하나로 붕괴해 21일 만점 6명이 정확히 210점 동점이 됐다.
 *   - 동점 처리 규칙이 없어서 5,000P/2,000P/500P가 Firestore 스캔 순서로 나갈 뻔했다.
 *
 * 식을 고칠 일이 있으면 여기만 고친다. 화면과 지급이 갈라지면 안 된다.
 */

// 이 달부터 활동 포인트 기준을 쓴다. 그 전 달은 옛 식 그대로 둔다 —
// 이미 지나간 달의 순위를 소급해서 바꾸면 지급된 보상과 아카이브가 어긋난다.
const POINTS_FORMULA_START_MONTH = "2026-09";

// 2026-08-21 실측으로 정한 값.
// 현행 상위 20명의 사회항 비중(13.7%)을 기록항이 days*10 -> 활동 포인트로
// 바뀐 뒤에도 유지하도록 역산했다. 배율 3.55 -> 댓글 3*3.55=10.7, 리액션 1*3.55=3.6.
const COMMENT_WEIGHT = 11;
const REACTION_WEIGHT = 4;

// 사회항 상한. 리액션은 한 번 탭이면 끝이라 상한이 없으면 한 달에 수백 번 눌러
// 기록 없이 1위가 된다. 실제로 8월 리액션 494개 중 356개(72%)가 한 사람이었고,
// 상한 없이 x4를 주면 그 사람 점수의 51%가 사회항이 됐다.
// 상한을 "자기 활동 포인트의 30%"로 두면 기록을 쌓지 않는 한 상한도 안 커진다.
const SOCIAL_CAP_RATIO = 0.30;

const DAILY_POINT_KEYS = ["dietPoints", "exercisePoints", "mindPoints"];
const REACTION_TYPES = ["heart", "fire", "clap"];

/** 하루치 활동 포인트 합 (식단 최대 30 + 운동 최대 30 + 수면·명상 최대 20 = 80) */
function sumActivityPoints(awarded) {
    const source = awarded && typeof awarded === "object" ? awarded : {};
    let total = 0;
    for (const key of DAILY_POINT_KEYS) {
        const value = Number(source[key]);
        if (Number.isFinite(value) && value > 0) total += value;
    }
    return total;
}

/** 한 게시물에 리액션을 남긴 서로 다른 사용자 (같은 사람이 여러 종류를 눌러도 1회) */
function uniqueReactionUserIds(doc) {
    const found = new Set();
    const reactions = doc?.reactions || {};
    for (const type of REACTION_TYPES) {
        const list = Array.isArray(reactions[type]) ? reactions[type] : [];
        for (const uid of list) if (uid) found.add(uid);
    }
    return found;
}

/** 한 게시물에 댓글을 남긴 서로 다른 사용자 (같은 사람이 3개 달아도 1회) */
function uniqueCommentUserIds(doc) {
    const found = new Set();
    const comments = Array.isArray(doc?.comments) ? doc.comments : [];
    for (const comment of comments) if (comment?.userId) found.add(comment.userId);
    return found;
}

function usesPointsFormula(month) {
    return String(month || "") >= POINTS_FORMULA_START_MONTH;
}

/**
 * MVP 점수. month 로 식이 갈린다.
 *   2026-09 이후: 활동 포인트 + min(댓글*11 + 리액션*4, 활동 포인트*0.3)
 *   그 이전     : days*10 + 댓글*3 + 리액션*1  (옛 식 유지)
 */
function computeMvpScore(user, month) {
    const stat = user || {};
    const comments = Number(stat.comments) || 0;
    const reactions = Number(stat.reactions) || 0;

    if (!usesPointsFormula(month)) {
        return (Number(stat.days) || 0) * 10 + comments * 3 + reactions;
    }

    const points = Number(stat.points) || 0;
    const social = comments * COMMENT_WEIGHT + reactions * REACTION_WEIGHT;
    return points + Math.min(social, Math.floor(points * SOCIAL_CAP_RATIO));
}

/**
 * 동점 정렬 규칙.
 *
 * 옛 코드는 정렬 키가 score 하나뿐이라(`sort((a,b) => b.score - a.score)`)
 * 동점자 순서가 Firestore 스캔 순서를 따랐다. 집계가 매시간 돌 때마다 메달이
 * 바뀔 수 있었고, 지급 시점의 순서도 사실상 무작위였다.
 * 8월에는 210점 동점자가 6명이었다 — 메달 3개를 6명이 제비뽑기한 셈이다.
 */
function compareForRank(a, b) {
    const byScore = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (byScore) return byScore;
    const byPoints = (Number(b.points) || 0) - (Number(a.points) || 0);
    if (byPoints) return byPoints;
    const byDays = (Number(b.days) || 0) - (Number(a.days) || 0);
    if (byDays) return byDays;
    const byComments = (Number(b.comments) || 0) - (Number(a.comments) || 0);
    if (byComments) return byComments;
    const byReactions = (Number(b.reactions) || 0) - (Number(a.reactions) || 0);
    if (byReactions) return byReactions;
    // 마지막 안전장치. uid 는 불변이라 같은 달을 몇 번 재집계해도 같은 순서가 나온다.
    return String(a.userId || "").localeCompare(String(b.userId || ""));
}

/**
 * userStats 맵 -> 점수 매겨 정렬한 배열.
 * 기록이 하나도 없는 사람(days === 0)은 순위에서 뺀다 — 리액션만 눌러서
 * MVP가 되는 건 이 상의 취지가 아니다.
 */
function rankUsers(userStats, month, limit) {
    const ranked = Object.entries(userStats || {})
        .map(([userId, stat]) => ({ userId, ...stat, score: computeMvpScore(stat, month) }))
        .filter((u) => (Number(u.days) || 0) > 0)
        .sort(compareForRank);
    return Number.isFinite(limit) ? ranked.slice(0, limit) : ranked;
}

/**
 * 댓글·리액션을 실제로 저장된 곳에서 읽어 온다.
 *
 * 리액션은 toggleReactionOnPost 가 gallery_posts 에만 쓴다. daily_logs 에는
 * 옛 기록만 남아 있다. 두 곳을 합치되 (문서, 사용자) 쌍으로 중복을 제거한다 —
 * gallery_posts 의 문서 ID 는 daily_logs 와 같으므로(sourceLogId) 그대로 키가 된다.
 *
 * gallery_posts 를 날짜 범위로 조회하지 않고 로그 ID 로 직접 가져오는 이유:
 * shareSettings.hideDate 가 켜진 게시물에는 date 필드가 아예 없어서
 * where('date', ...) 조회에 안 잡힌다. 그런 글에 달린 리액션이 조용히 빠진다.
 *
 * @param {object} db Firestore 인스턴스
 * @param {Array<{id: string, data: object}>} dailyLogs 해당 월의 daily_logs
 * @returns {Promise<{comments: Map<string, number>, reactions: Map<string, number>}>}
 */
async function collectSocialCounts(db, dailyLogs) {
    const seenComment = new Set();
    const seenReaction = new Set();
    const comments = new Map();
    const reactions = new Map();

    const bump = (map, uid) => map.set(uid, (map.get(uid) || 0) + 1);
    const absorb = (logId, doc) => {
        for (const uid of uniqueCommentUserIds(doc)) {
            const key = `${logId}|${uid}`;
            if (seenComment.has(key)) continue;
            seenComment.add(key);
            bump(comments, uid);
        }
        for (const uid of uniqueReactionUserIds(doc)) {
            const key = `${logId}|${uid}`;
            if (seenReaction.has(key)) continue;
            seenReaction.add(key);
            bump(reactions, uid);
        }
    };

    // 1) 레거시 경로 — 쓰기 경로가 옮겨가기 전의 기록
    for (const log of dailyLogs) absorb(log.id, log.data);

    // 2) 현행 경로 — gallery_posts
    const refs = dailyLogs.map((log) => db.doc(`gallery_posts/${log.id}`));
    for (let i = 0; i < refs.length; i += 200) {
        const chunk = refs.slice(i, i + 200);
        if (chunk.length === 0) continue;
        const snaps = await db.getAll(...chunk);
        for (const snap of snaps) {
            if (!snap.exists) continue;
            absorb(snap.id, snap.data() || {});
        }
    }

    return { comments, reactions };
}

module.exports = {
    POINTS_FORMULA_START_MONTH,
    COMMENT_WEIGHT,
    REACTION_WEIGHT,
    SOCIAL_CAP_RATIO,
    sumActivityPoints,
    uniqueReactionUserIds,
    uniqueCommentUserIds,
    usesPointsFormula,
    computeMvpScore,
    compareForRank,
    rankUsers,
    collectSocialCounts,
};
