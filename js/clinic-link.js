// 병원 시범 운영 — 병원 QR 링크(`/app?clinic=<slug>`)로 들어온 회원을 그 병원과 잇는다.
//
// 2026-11-17: 요셉의원·내과의사 사이먼 12주 시범. 병원은 QR 카드를 건네고 진료 때 환자 휴대폰
// 화면을 30초 볼 뿐이다. 병원은 환자 정보를 넘겨받지 않는다 — 여기서 하는 일은 회원 문서에
// "어느 병원 링크로 왔는가"(clinicId)를 적고, 앱 위쪽에 병원 이름·원장 인사말을 보여 주는 것뿐이다.
// 포인트·알림·미션은 병원 연결과 묶지 않는다. (tasks/2026-11-17_병원_시범_연결.md)
//
// 초대 링크(?ref=)와 같은 길이다: 페이지를 열 때 적어 두고(구글 로그인으로 페이지가 바뀌어도
// 남도록 localStorage), 로그인 뒤 회원 문서 저장 다음에 처리한다(js/auth.js).

export const PENDING_CLINIC_KEY = 'habitschoolPendingClinic';
export const CLINIC_URL_PARAM = 'clinic';
// firestore.rules 의 isValidClinicLink 와 같은 형식이어야 한다.
const CLINIC_SLUG_RE = /^[a-z0-9-]{2,32}$/;

export function normalizeClinicSlug(raw) {
    const slug = String(raw || '').trim().toLowerCase();
    return CLINIC_SLUG_RE.test(slug) ? slug : '';
}

export function readClinicSlugFromSearch(search = '') {
    try {
        return normalizeClinicSlug(new URLSearchParams(search || '').get(CLINIC_URL_PARAM));
    } catch (_) {
        return '';
    }
}

// QR 을 찍고 로그인하지 않은 채 두면, 며칠 뒤 같은 기기로 로그인한 다른 사람이 엮일 수 있다.
// 병원에서 받은 링크는 그 자리에서 가입하는 것이 보통이므로 하루만 기다린다.
export const PENDING_CLINIC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function persistPendingClinic(slug, storage = globalThis.localStorage, now = Date.now()) {
    const normalized = normalizeClinicSlug(slug);
    if (!normalized) return '';
    try { storage?.setItem(PENDING_CLINIC_KEY, JSON.stringify({ slug: normalized, at: now })); } catch (_) { }
    return normalized;
}

export function readPendingClinic(storage = globalThis.localStorage, now = Date.now()) {
    try {
        const parsed = JSON.parse(storage?.getItem(PENDING_CLINIC_KEY) || 'null');
        if (!parsed || typeof parsed !== 'object') return '';
        const at = Number(parsed.at);
        if (!Number.isFinite(at) || now - at > PENDING_CLINIC_MAX_AGE_MS) return '';
        return normalizeClinicSlug(parsed.slug);
    } catch (_) {
        return '';
    }
}

export function clearPendingClinic(storage = globalThis.localStorage) {
    try { storage?.removeItem(PENDING_CLINIC_KEY); } catch (_) { }
}

/** 병원 문서가 띠에 쓸 만한가. 없거나 꺼 둔(active === false) 병원은 연결하지 않는다. */
export function isUsableClinic(clinic) {
    return !!clinic && typeof clinic === 'object'
        && clinic.active !== false
        && typeof clinic.name === 'string' && clinic.name.trim() !== '';
}

/**
 * 병원 링크로 들어온 회원에게 무엇을 할지 정한다.
 *  - 'none'    : 기다리는 병원 링크가 없다
 *  - 'invalid' : 없는 병원(오타·비활성) — 연결하지 않고 알린다
 *  - 'same'    : 이미 그 병원과 연결돼 있다
 *  - 'link'    : 연결된 병원이 없다 — 바로 잇는다
 *  - 'confirm' : 다른 병원과 연결돼 있다 — 바꿀지 먼저 묻는다
 */
export function decideClinicLink({ pendingSlug = '', currentClinicId = '', clinic = null } = {}) {
    const slug = normalizeClinicSlug(pendingSlug);
    if (!slug) return 'none';
    if (!isUsableClinic(clinic)) return 'invalid';
    const current = normalizeClinicSlug(currentClinicId);
    if (current === slug) return 'same';
    if (!current) return 'link';
    return 'confirm';
}

function safeLogoUrl(raw) {
    try {
        const url = new URL(String(raw || ''));
        return url.protocol === 'https:' ? url.href : '';
    } catch (_) {
        return '';
    }
}

function safeBrandColor(raw) {
    const value = String(raw || '').trim();
    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value) ? value : '';
}

function fillMark(markRoot, clinic, logoSelector, initialSelector) {
    const logoEl = markRoot?.querySelector?.(logoSelector);
    const initialEl = markRoot?.querySelector?.(initialSelector);
    const logoUrl = safeLogoUrl(clinic.logoUrl);
    if (logoEl) {
        if (logoUrl) {
            logoEl.src = logoUrl;
            logoEl.hidden = false;
        } else {
            logoEl.removeAttribute('src');
            logoEl.hidden = true;
        }
    }
    if (initialEl) {
        // 로고를 받기 전에는 병원 이름 첫 글자를 둔다.
        initialEl.textContent = logoUrl ? '' : (Array.from(clinic.name.trim())[0] || '');
        initialEl.hidden = !!logoUrl;
    }
}

function applyBrandColor(target, clinic) {
    if (!target?.style) return;
    const color = safeBrandColor(clinic?.brandColor);
    if (color) target.style.setProperty('--clinic-brand', color);
    else target.style.removeProperty('--clinic-brand');
}

/**
 * 머리글 맨 위 병원 줄을 그린다. 병원 문서는 관리자가 쓰지만, 글자는 textContent 로만 넣는다.
 * clinic 이 없으면 숨긴다(로그아웃·다른 계정 로그인 때도 이 함수로 지운다).
 * 연결된 동안 <html> 에 clinic-branded 를 붙인다 — 머리글의 포인트 배지를 감춘다(styles-features.css).
 * 병원 간판 아래 포인트가 보이면 병원이 경제적 이익을 주는 것처럼 읽힌다. 포인트는 자산 탭에 그대로 있다.
 */
export function renderClinicBanner(clinic, root = globalThis.document, { english = false } = {}) {
    const banner = root?.getElementById?.('clinic-banner');
    const html = root?.documentElement;
    if (!banner) return false;
    if (!isUsableClinic(clinic)) {
        banner.hidden = true;
        banner.removeAttribute('data-clinic-id');
        html?.classList?.remove('clinic-branded');
        applyBrandColor(html, null);
        return false;
    }
    const nameEl = banner.querySelector('.clinic-banner__name');
    const suffixEl = banner.querySelector('.clinic-banner__suffix');
    const directorEl = banner.querySelector('.clinic-banner__director');
    const greetingEl = banner.querySelector('.clinic-banner__greeting');

    if (nameEl) nameEl.textContent = clinic.name.trim();
    if (suffixEl) suffixEl.textContent = english ? 'Health Notebook' : '건강수첩';
    const director = String(clinic.directorName || '').trim();
    if (directorEl) {
        directorEl.textContent = director ? (english ? `Dr. ${director}` : `${director} 원장`) : '';
        directorEl.hidden = !director;
    }
    const greeting = String(clinic.greeting || '').trim();
    if (greetingEl) {
        greetingEl.textContent = greeting;
        greetingEl.hidden = !greeting;
    }
    fillMark(banner, clinic, '.clinic-banner__logo', '.clinic-banner__initial');
    applyBrandColor(html, clinic);
    html?.classList?.add('clinic-branded');
    if (clinic.id) banner.dataset.clinicId = clinic.id;
    banner.hidden = false;
    return true;
}

/**
 * 병원 QR 로 들어온 비로그인 방문자의 로그인 화면을 병원 화면으로 바꾼다.
 * <html> 의 clinic-entry 가 해빛스쿨 로고·표어·가입 선물 안내·소개 영상을 감춘다(styles-features.css).
 */
export function renderClinicLogin(clinic, root = globalThis.document) {
    const brand = root?.getElementById?.('clinic-login-brand');
    const html = root?.documentElement;
    const parts = ['clinic-login-brand', 'clinic-login-points', 'clinic-login-note']
        .map((id) => root?.getElementById?.(id)).filter(Boolean);
    if (!brand || !isUsableClinic(clinic)) {
        parts.forEach((el) => { el.hidden = true; });
        html?.classList?.remove('clinic-entry');
        return false;
    }
    const nameEl = brand.querySelector('.clinic-login-brand__name');
    if (nameEl) nameEl.textContent = clinic.name.trim();
    fillMark(brand, clinic, '.clinic-login-brand__logo', '.clinic-login-brand__initial');
    applyBrandColor(html, clinic);
    parts.forEach((el) => { el.hidden = false; });
    html?.classList?.add('clinic-entry');
    return true;
}
