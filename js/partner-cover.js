// 제휴 전용 앱 커버 — 런비커스 (2026-11-20, tasks/2026-11-20_런비커스_전용앱_커버.md).
//
// 병원 앱(js/clinic-link.js)처럼 <html> 에 표시를 붙여 화면을 바꾼다. 런비커스는 달리기 모임이라
// 탭은 내 기록·운동·갤러리만 남긴다(식단·마음·자산 탭 단추를 감춘다). 기능·포인트는 그대로다.
//
//  - 켜는 때: 새로 가입한 회원이 런비커스 모임 링크(?group=runbickers)를 기다리고 있을 때.
//    서버 joinHabitGroup({ partnerCover }) 가 모임 가입·첫 4주 참가비 면제·users/{uid}.partnerCover 를 한 번에 한다.
//  - 푸는 때: 4주 안에 14번을 채우면(서버가 partnerCover.completedAt 을 적는다) 전체 앱으로 바꿀지 묻는다.
//
// partnerCover 는 서버만 쓴다. 화면 쪽은 읽기만 한다. 서버 짝은 functions/partner-cover.js.

export const RUNBICKERS_COVER_ID = 'runbickers';
export const RUNBICKERS_COVER_GROUP_ID = 'exercise-runbickers';
// js/app-core.js 의 소모임 링크 기억 칸(PENDING_HABIT_GROUP_LINK_KEY)과 같은 이름이어야 한다.
export const PENDING_HABIT_GROUP_LINK_KEY = 'pendingHabitGroupLink';

// 런비커스 초대 코드 — 운영진 롤로님(2026-11-20 대표: "이걸로 기본으로 넣어줘").
// 커버로 가입하면 자동으로 넣고, 모임 창의 초대 코드 칸에도 미리 채운다.
export const RUNBICKERS_INVITE_CODE = '7E8HF9';

// 런비커스 링크를 연 적이 있는 기기. 모임 창이 링크를 소비해도 남아 「특별 초대」 단추를 고른다.
export const RUNBICKERS_INVITE_SEEN_KEY = 'habitschoolRunbickersInvite';
// 서버 functions/partner-cover.js 의 PARTNER_COVER_MAX_ACCOUNT_AGE_MS 와 같아야 한다.
export const PARTNER_COVER_MAX_ACCOUNT_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export function rememberRunbickersInvite(storage = globalThis.localStorage, now = Date.now()) {
    try { storage?.setItem(RUNBICKERS_INVITE_SEEN_KEY, String(now)); } catch (_) { }
}

export function hasSeenRunbickersInvite(storage = globalThis.localStorage) {
    try { return !!storage?.getItem(RUNBICKERS_INVITE_SEEN_KEY); } catch (_) { return false; }
}

/**
 * 모임 창에서 런비커스 모임을 「특별 초대 0P」로 보일까. 서버가 면제해 줄 사람에게만 —
 * 런비커스 링크로 왔고, 계정이 3일 안이고, 커버를 받은 적이 없다. (지난 진행 여부는 서버가 본다.)
 */
export function isRunbickersSpecialInvite({ inviteSeen = false, accountCreatedMs = NaN, userData = {}, now = Date.now() } = {}) {
    if (!inviteSeen) return false;
    if (userData?.partnerCover?.id) return false;
    const created = Number(accountCreatedMs);
    return Number.isFinite(created) && now - created <= PARTNER_COVER_MAX_ACCOUNT_AGE_MS;
}

// 커버에서 감추는 탭. 이 탭으로 가려 하면 운동 탭을 연다.
export const PARTNER_COVER_HIDDEN_TABS = Object.freeze(['diet', 'sleep', 'assets']);
export const PARTNER_COVER_FALLBACK_TAB = 'exercise';

const COVER_CLASSES = Object.freeze({ [RUNBICKERS_COVER_ID]: 'partner-runbickers' });
// 휴대폰 주소창 색. 런비커스 로고 바탕 회색.
const PARTNER_THEME_COLORS = Object.freeze({ [RUNBICKERS_COVER_ID]: '#363636' });

function setThemeColor(root, color) {
    const metas = root?.querySelectorAll?.('meta[name="theme-color"]') || [];
    for (const meta of metas) {
        if (!meta.dataset) continue;
        if (!('originalContent' in meta.dataset)) meta.dataset.originalContent = meta.getAttribute('content') || '';
        meta.setAttribute('content', color || meta.dataset.originalContent);
    }
}

export function readPendingHabitGroupLink(storage = globalThis.localStorage) {
    try { return String(storage?.getItem(PENDING_HABIT_GROUP_LINK_KEY) || '').trim(); } catch (_) { return ''; }
}

/** 새 가입 + 런비커스 모임 링크를 기다리는 중이면 커버를 켠다. 기존 회원은 지금처럼 모임 창만 연다. */
export function shouldStartRunbickersCover({ isNewUser = false, pendingGroupId = '', userData = {} } = {}) {
    if (!isNewUser) return false;
    if (String(pendingGroupId || '').trim() !== RUNBICKERS_COVER_GROUP_ID) return false;
    return !userData?.partnerCover?.id;
}

/**
 * 회원 문서의 partnerCover 로 지금 할 일을 정한다.
 *  - 'none'   : 커버 없음(받은 적 없거나 전체 앱으로 바꿈)
 *  - 'active' : 커버를 켠다
 *  - 'ask'    : 커버를 켜고, 완주했으니 전체 앱으로 바꿀지 묻는다
 */
export function resolvePartnerCoverState(userData = {}) {
    const cover = userData?.partnerCover;
    if (!cover || typeof cover !== 'object' || !COVER_CLASSES[cover.id]) return 'none';
    if (cover.status !== 'active') return 'none';
    if (cover.completedAt && !cover.keptAt) return 'ask';
    return 'active';
}

/** 완주한 뒤 「그대로」를 골랐으면 프로필에서 언제든 전체 앱으로 바꿀 수 있다. */
export function canReleasePartnerCover(userData = {}) {
    const cover = userData?.partnerCover;
    return !!cover && cover.status === 'active' && !!cover.completedAt;
}

// 이 기기에서 커버를 쓰는 계정. 다음에 앱을 열 때 첫 페인트 전에 커버를 입힌다(index.html 머리 스크립트).
// 2026-11-20 대표: 업데이트 노트 → 「프로필로 돌아가기」(/#profile) 뒤 기본 앱으로 보였다. 회원 문서를 다 읽기 전까지
// 기본 앱이 그려지고, 기기 캐시의 회원 문서가 서버가 적은 partnerCover 보다 오래됐을 수도 있다.
export const PARTNER_COVER_MEMORY_KEY = 'habitschoolPartnerCover';

export function rememberPartnerCover(uid = '', coverId = '', storage = globalThis.localStorage) {
    try {
        if (uid && COVER_CLASSES[coverId]) storage?.setItem(PARTNER_COVER_MEMORY_KEY, JSON.stringify({ uid, id: coverId }));
        else storage?.removeItem(PARTNER_COVER_MEMORY_KEY);
    } catch (_) { }
}

export function readRememberedPartnerCover(storage = globalThis.localStorage) {
    try {
        const parsed = JSON.parse(storage?.getItem(PARTNER_COVER_MEMORY_KEY) || 'null');
        return parsed && parsed.uid && COVER_CLASSES[parsed.id] ? { uid: String(parsed.uid), id: parsed.id } : null;
    } catch (_) {
        return null;
    }
}

let currentCoverId = '';
export function getActivePartnerCover() { return currentCoverId; }

export function isTabHiddenByPartnerCover(tabName, root = globalThis.document) {
    if (!root?.documentElement?.classList?.contains('partner-cover')) return false;
    return PARTNER_COVER_HIDDEN_TABS.includes(String(tabName || ''));
}

/** 커버를 켜거나(coverId) 끈다(''). 로그아웃·다른 계정 로그인 때도 '' 로 부른다. */
export function applyPartnerCover(coverId = '', root = globalThis.document) {
    const html = root?.documentElement;
    if (!html?.classList) return false;
    const cls = COVER_CLASSES[coverId] || '';
    html.classList.remove('partner-cover', ...Object.values(COVER_CLASSES));
    currentCoverId = cls ? coverId : '';
    setThemeColor(root, cls ? PARTNER_THEME_COLORS[coverId] : '');
    if (!cls) return false;
    html.classList.add('partner-cover', cls);
    // 지금 감춘 탭에 있으면 운동 탭으로 옮긴다.
    const active = root.querySelector?.('.content-section.active');
    if (active && PARTNER_COVER_HIDDEN_TABS.includes(active.id)) {
        globalThis.openTab?.(PARTNER_COVER_FALLBACK_TAB);
    }
    return true;
}
