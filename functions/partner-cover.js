// 제휴 전용 앱 커버 (2026-11-20, tasks/2026-11-20_런비커스_전용앱_커버.md).
//
// 런비커스 링크로 새로 가입한 회원은 런비커스 모임에 바로 들어가고(첫 4주 참가비 면제), 앱은 달리기에 맞춘
// 탭(내 기록·운동·갤러리)만 보인다. 4주 안에 14번을 채우면 해빛스쿨 전체 앱으로 바꿀지 묻는다.
// 회원 문서의 partnerCover 는 서버만 쓴다(규칙 화이트리스트에 없다). 화면 쪽 짝은 js/partner-cover.js.

const PARTNER_COVERS = Object.freeze({
    runbickers: Object.freeze({ id: "runbickers", groupId: "exercise-runbickers" }),
});

// 링크를 누르고 가입한 그 자리에서 커버가 켜진다. 앱을 닫았다 다시 열어 늦게 들어오는 경우를 넉넉히 둔다.
const PARTNER_COVER_MAX_ACCOUNT_AGE_MS = 3 * 24 * 60 * 60 * 1000;

function getPartnerCover(partnerId = "") {
    return PARTNER_COVERS[String(partnerId || "").trim()] || null;
}

/**
 * 이 가입이 커버를 켜고 첫 4주 참가비를 면제받는가.
 * 새 계정(3일 안)이고, 그 제휴의 모임이고, 이 모임에 지난 진행이 없고, 커버를 받은 적이 없을 때만.
 */
function shouldStartPartnerCover({
    partnerId = "",
    groupId = "",
    accountCreatedMs = NaN,
    nowMs = Date.now(),
    existingCover = null,
    hasPreviousProgress = false,
} = {}) {
    const cover = getPartnerCover(partnerId);
    if (!cover || cover.groupId !== String(groupId || "").trim()) return false;
    if (existingCover && typeof existingCover === "object" && existingCover.id) return false;
    if (hasPreviousProgress) return false;
    const created = Number(accountCreatedMs);
    if (!Number.isFinite(created) || created > nowMs + 60 * 1000) return false;
    return nowMs - created <= PARTNER_COVER_MAX_ACCOUNT_AGE_MS;
}

/** 모임 보상을 줄 때 커버에 완주를 적어야 하는가. */
function shouldMarkPartnerCoverCompleted(cover = null, groupId = "") {
    if (!cover || typeof cover !== "object") return false;
    const def = getPartnerCover(cover.id);
    return !!def && def.groupId === String(groupId || "").trim()
        && cover.status === "active" && !cover.completedAt;
}

/**
 * 완주 뒤 묻는 창의 답. 'keep' 은 켜져 있으면 언제든.
 * 'release' 는 완주했거나, 그 모임에 더는 없을 때(나가기·마무리) — 모임 밖에서 커버에 갇히지 않게.
 * 돌려주는 값: 'release' | 'keep' | 'noop' | 'not_completed' | 'invalid'
 */
function resolvePartnerCoverDecision(cover = null, choice = "", { inGroup = true } = {}) {
    const normalized = String(choice || "").trim();
    if (!["release", "keep"].includes(normalized)) return "invalid";
    if (!cover || typeof cover !== "object" || !getPartnerCover(cover.id)) return "invalid";
    if (cover.status !== "active") return "noop";
    if (normalized === "release" && !cover.completedAt && inGroup) return "not_completed";
    return normalized;
}

module.exports = {
    PARTNER_COVERS,
    PARTNER_COVER_MAX_ACCOUNT_AGE_MS,
    getPartnerCover,
    shouldStartPartnerCover,
    shouldMarkPartnerCoverCompleted,
    resolvePartnerCoverDecision,
};
