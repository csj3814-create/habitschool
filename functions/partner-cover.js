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
 * 커버를 풀지(release), 완주 뒤에도 둘지(keep). 둘 다 켜져 있으면 언제든 된다.
 * 2026-11-22 대표: 병원 앱처럼 런비커스 안내 탭에서 언제든 기본 해빛스쿨로 돌아갈 수 있게(예전에는 완주 뒤에만).
 * 돌려주는 값: 'release' | 'keep' | 'noop' | 'invalid'
 */
function resolvePartnerCoverDecision(cover = null, choice = "") {
    const normalized = String(choice || "").trim();
    if (!["release", "keep"].includes(normalized)) return "invalid";
    if (!cover || typeof cover !== "object" || !getPartnerCover(cover.id)) return "invalid";
    if (cover.status !== "active") return "noop";
    return normalized;
}

/**
 * 기본 앱으로 바꾼 회원(또는 링크 없이 모임에 든 회원)이 런비커스 앱으로 다시 들어가는가(2026-11-24 대표).
 * 그 제휴 모임에 지금 참여 중이어야 하고, 병원 건강수첩과는 한 번에 하나만이다.
 * 돌려주는 값: 'enter' | 'noop'(이미 켜짐) | 'not-member' | 'clinic' | 'invalid'
 */
function resolvePartnerCoverEntry(cover = null, { partnerId = "", isGroupMember = false, clinicLinked = false } = {}) {
    const def = getPartnerCover(partnerId);
    if (!def) return "invalid";
    if (cover && typeof cover === "object" && cover.status === "active" && cover.id === def.id) return "noop";
    if (!isGroupMember) return "not-member";
    if (clinicLinked) return "clinic";
    return "enter";
}

module.exports = {
    PARTNER_COVERS,
    PARTNER_COVER_MAX_ACCOUNT_AGE_MS,
    getPartnerCover,
    shouldStartPartnerCover,
    shouldMarkPartnerCoverCompleted,
    resolvePartnerCoverDecision,
    resolvePartnerCoverEntry,
};
