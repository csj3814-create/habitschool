// 커뮤니티 현황의 "꾸준함" 두 줄을 그린다.
//
// 같은 두 줄이 네 곳(대시보드·그룹 챌린지·게스트 데모·지난 현황 페이지)에서 그려진다.
// 네 벌로 두면 기준이 조용히 갈라지므로 여기 한 곳에 둔다.
//
// 표시 규칙이 바뀐 이유는 functions/community-stats.js 에 적어 두었다.
// 요약하면: 매일 기록하는 사람이 많아져 "누가 제일 오래" 는 전부 같은 숫자가 됐고,
// 동점이면 먼저 스캔된 사람이 뽑히고 있었다. 이름 대신 인원을 센다.
// security.js 의 escapeHtml 은 document.createElement 를 쓴다. 여기 두 함수는
// 문자열만 만들고 DOM 을 만지지 않으므로, 브라우저 밖(테스트)에서도 그대로 돌게
// 문자 치환으로 둔다. 따옴표까지 막아 두는 편이 옛 이름을 넣을 때 더 안전하다.
function escapeText(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const CATEGORY_ICONS = { diet: '🥗', exercise: '🏃', mind: '🌙' };
const CATEGORY_LABELS = { diet: '식단', exercise: '운동', mind: '마음' };

/**
 * 새 집계인지 판별한다.
 *
 * "새 필드가 비었으면 옛 표시로" 라고 쓰면 안 된다. 새 집계도 달 초에는 개근 인원을
 * 일부러 비워 두는데(며칠은 지나야 뜻이 생긴다), 그때 옛 표시로 돌아가면 방금
 * 없앤 "누가 1일" 이 며칠간 다시 나타난다. 비었다는 것과 없다는 것은 다르다.
 */
function isCurrentFormat(stats) {
    return Number(stats && stats.statsVersion) >= 2;
}

/**
 * 🔥 줄. 새 집계에는 `streakTier`, 지난 달 아카이브에는 `bestStreak`/`bestStreakName`
 * 만 있다. 이미 저장된 달을 다시 쓸 수는 없으므로 둘 다 그린다.
 */
export function buildStreakHighlightHtml(stats, { className = 'community-highlight' } = {}) {
    if (isCurrentFormat(stats)) {
        const tier = stats.streakTier;
        const count = Number(tier && tier.count) || 0;
        if (!tier || count <= 0) return '';
        const label = escapeText(tier.label || `${Number(tier.days) || 0}일 이상`);
        return `<div class="${className}">🔥 연속 기록 <strong>${label} ${count}명</strong></div>`;
    }

    // 옛 표시 — 이 화면이 바뀌기 전에 저장된 달 전용.
    const best = Number(stats && stats.bestStreak) || 0;
    if (best >= 2) {
        const name = escapeText(stats.bestStreakName || '익명');
        return `<div class="${className}">🔥 연속 기록: <strong>${name}</strong> ${best}일</div>`;
    }
    return '';
}

/**
 * 카테고리 칩 줄. 개근 인원이 0명인 칸은 그리지 않는다 —
 * "식단 개근 0명" 은 알려주는 게 없고 자리만 차지한다.
 */
export function buildAttendanceChipsHtml(stats, { className = 'category-kings', chipClass = 'cat-king', icons = {} } = {}) {
    const icon = (key) => icons[key] || CATEGORY_ICONS[key];
    if (isCurrentFormat(stats)) {
        const perfect = stats.perfectAttendance;
        // 달 초라 아직 셀 때가 아니거나(null), 아무도 개근하지 못한 달이면 줄을 비운다.
        if (!perfect || Number(perfect.days) <= 0) return '';
        const chips = ['diet', 'exercise', 'mind']
            .map((key) => ({ key, count: Number(perfect[key]) || 0 }))
            .filter((item) => item.count > 0)
            .map((item) => `<span class="${chipClass}">${icon(item.key)} ${CATEGORY_LABELS[item.key]} 개근 <strong>${item.count}명</strong></span>`);
        return chips.length ? `<div class="${className}">${chips.join('')}</div>` : '';
    }

    // 옛 표시 — 이 화면이 바뀌기 전에 저장된 달 전용.
    const legacy = ['diet', 'exercise', 'mind']
        .map((key) => ({ key, king: stats && stats[`${key}King`] }))
        .filter((item) => item.king && Number(item.king.count) > 0)
        .map((item) => `<span class="${chipClass}">${icon(item.key)} <strong>${escapeText(item.king.name || '익명')}</strong> ${Number(item.king.count)}일</span>`);
    return legacy.length ? `<div class="${className}">${legacy.join('')}</div>` : '';
}
