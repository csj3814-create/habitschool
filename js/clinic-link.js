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

// 영어 앱(<html class="locale-en">)이면 병원 문서의 영어 칸(nameEn·directorNameEn·introEn·addressEn·hoursEn)을 먼저 쓴다.
// 영어 칸이 비어 있으면 한국어 그대로(2026-11-18 대표: "요셉의원 소개도 영어 추가해 줘").
const LOCALIZED_CLINIC_FIELDS = ['name', 'directorName', 'intro', 'address', 'hours'];

function isEnglishRoot(root) {
    return !!root?.documentElement?.classList?.contains?.('locale-en');
}

export function localizeClinic(clinic, english = false) {
    if (!clinic || !english) return clinic;
    const out = { ...clinic };
    for (const field of LOCALIZED_CLINIC_FIELDS) {
        const en = String(clinic[`${field}En`] || '').trim();
        if (en) out[field] = en;
    }
    return out;
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

// 로고는 https 주소나 이 앱 안의 파일(/assets/clinics/...)만 받는다.
function safeLogoUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    try {
        const origin = globalThis.location?.origin || 'https://habitschool.web.app';
        const url = new URL(value, origin);
        if (url.protocol === 'https:') return url.href;
        if (value.startsWith('/') && !value.startsWith('//') && url.origin === origin) return url.href;
        return '';
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

export const CLINIC_THEME_KEY = 'habitschoolClinicTheme';

// 다음에 앱을 열 때 첫 페인트 전에 병원 색을 입히려고 기억한다(index.html 머리 스크립트).
function rememberClinicTheme(clinic, storage = globalThis.localStorage) {
    try {
        const color = clinic ? safeBrandColor(clinic.brandColor) : '';
        if (color) storage?.setItem(CLINIC_THEME_KEY, JSON.stringify({ color }));
        else storage?.removeItem(CLINIC_THEME_KEY);
    } catch (_) { }
}

/**
 * 머리글 한 줄(병원 로고·이름 · 회원 이름 · 날짜)의 병원 부분을 그린다. 글자는 textContent 로만 넣는다.
 * clinic 이 없으면 숨긴다(로그아웃·다른 계정 로그인 때도 이 함수로 지운다).
 * 연결된 동안 <html> 에
 *  - clinic-branded: 머리글을 병원 색으로 칠하고 포인트 배지를 감춘다(styles-features.css).
 *    병원 간판 아래 포인트가 보이면 병원이 경제적 이익을 주는 것처럼 읽힌다. 포인트는 자산 탭에 그대로 있다.
 *  - clinic-theme: 앱의 주황을 병원 색으로 바꾼다(styles-clinic-theme.css, 자동 생성).
 */
// ===== 화면에 직접 적힌(inline) 주황 =====
// 스타일 파일의 주황은 styles-clinic-theme.css(자동 생성)가 바꾸지만, index.html 의 style="" 에 적힌 주황
// (프로필 "변경" 단추 등 8곳)은 스타일 파일로 덮을 수 없다. 병원 색을 켤 때 한 번 바꾸고, 끌 때 되돌린다.
// 주황을 가리는 기준은 scripts/generate-clinic-theme.js 와 같다(색상 12°~43°, 채도 45%↑, 아주 옅으면 48°까지).
export function inlineOrangeShade(r, g, b) {
    const [R, G, B] = [r, g, b].map((v) => v / 255);
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const l = (max + min) / 2;
    if (max === min) return null;
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    const maxHue = l > 0.88 ? 48 : 43;
    if (s < 0.45 || h < 12 || h > maxHue) return null;
    if (l < 0.42) return 'dark';
    if (l < 0.6) return 'brand';
    if (l < 0.72) return 'soft';
    if (l < 0.84) return 'light';
    if (l < 0.93) return 'pale';
    return 'wash';
}

const INLINE_SHADE_VAR = {
    brand: 'var(--clinic-brand)',
    dark: 'color-mix(in srgb, var(--clinic-brand) 45%, #000)',
    soft: 'color-mix(in srgb, var(--clinic-brand) 72%, #fff)',
    light: 'color-mix(in srgb, var(--clinic-brand) 45%, #fff)',
    pale: 'color-mix(in srgb, var(--clinic-brand) 22%, #fff)',
    wash: 'color-mix(in srgb, var(--clinic-brand) 9%, #fff)'
};

export function recolorInlineValue(value) {
    let changed = false;
    const next = String(value).replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (match, hex) => {
        const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
        const n = parseInt(full, 16);
        const shade = inlineOrangeShade((n >> 16) & 255, (n >> 8) & 255, n & 255);
        if (!shade) return match;
        changed = true;
        return INLINE_SHADE_VAR[shade];
    });
    return changed ? next : null;
}

const ORIGINAL_STYLE_ATTR = 'data-clinic-original-style';

export function recolorInlineOranges(root = globalThis.document, on = true) {
    if (!root?.querySelectorAll) return 0;
    let count = 0;
    if (on) {
        for (const el of root.querySelectorAll('[style*="#"]')) {
            if (el.hasAttribute(ORIGINAL_STYLE_ATTR)) continue;
            const style = el.getAttribute('style');
            const next = recolorInlineValue(style);
            if (!next) continue;
            el.setAttribute(ORIGINAL_STYLE_ATTR, style);
            el.setAttribute('style', next);
            count += 1;
        }
    } else {
        for (const el of root.querySelectorAll(`[${ORIGINAL_STYLE_ATTR}]`)) {
            el.setAttribute('style', el.getAttribute(ORIGINAL_STYLE_ATTR));
            el.removeAttribute(ORIGINAL_STYLE_ATTR);
            count += 1;
        }
    }
    return count;
}

// 지금 연결된 병원(머리글에 그린 것). 병원 소개 화면과 공유가 쓴다.
let currentClinic = null;
export function getCurrentClinic() { return currentClinic; }

export function renderClinicBanner(clinic, root = globalThis.document, { storage = globalThis.localStorage } = {}) {
    currentClinic = isUsableClinic(clinic) ? clinic : null;
    clinic = localizeClinic(clinic, isEnglishRoot(root));
    const banner = root?.getElementById?.('clinic-banner');
    const html = root?.documentElement;
    if (!banner) return false;
    if (!isUsableClinic(clinic)) {
        banner.hidden = true;
        banner.removeAttribute('data-clinic-id');
        html?.classList?.remove('clinic-branded', 'clinic-theme');
        applyBrandColor(html, null);
        rememberClinicTheme(null, storage);
        recolorInlineOranges(root, false);
        return false;
    }
    const nameEl = banner.querySelector('.clinic-banner__name');
    if (nameEl) nameEl.textContent = clinic.name.trim();
    fillMark(banner, clinic, '.clinic-banner__logo', '.clinic-banner__initial');
    applyBrandColor(html, clinic);
    html?.classList?.add('clinic-branded', 'clinic-theme');
    rememberClinicTheme(clinic, storage);
    recolorInlineOranges(root, true);
    if (clinic.id) banner.dataset.clinicId = clinic.id;
    banner.hidden = false;
    return true;
}

/**
 * 병원 QR 로 들어온 비로그인 방문자의 로그인 화면을 병원 화면으로 바꾼다.
 * <html> 의 clinic-entry 가 해빛스쿨 로고·표어·가입 선물 안내·소개 영상을 감추고(styles-features.css),
 * clinic-theme 가 주황을 병원 색으로 바꾼다.
 */
export function renderClinicLogin(clinic, root = globalThis.document) {
    clinic = localizeClinic(clinic, isEnglishRoot(root));
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
    const director = String(clinic.directorName || '').trim();
    const directorEl = brand.querySelector('.clinic-login-brand__director');
    if (directorEl) {
        directorEl.textContent = director ? (isEnglishRoot(root) ? `Dr. ${director}` : `${director} 원장`) : '';
        directorEl.hidden = !director;
    }
    const greeting = String(clinic.greeting || '').trim();
    const greetingEl = brand.querySelector('.clinic-login-brand__greeting');
    if (greetingEl) {
        greetingEl.textContent = greeting;
        greetingEl.hidden = !greeting;
    }
    fillMark(brand, clinic, '.clinic-login-brand__logo', '.clinic-login-brand__initial');
    applyBrandColor(html, clinic);
    parts.forEach((el) => { el.hidden = false; });
    html?.classList?.add('clinic-entry', 'clinic-theme');
    recolorInlineOranges(root, true);
    return true;
}

// ===== 병원 회원용 30일 결과지 (2026-11-18 대표: "응, 병원용으로") =====
//
// 결과지를 진료 때 원장님께 보여 준다. 그래서 병원 회원의 결과지는
//  - 제목을 "○○의원 건강수첩 · 30일 결과지" 로,
//  - 맨 앞에 아침 공복 혈압·혈당·체중(평균·처음→마지막·최저~최고·기록 횟수)과 기록한 날 수를 두고,
//  - 포인트(총·일 평균·일별 포인트 그래프·달력의 P 구간)는 싣지 않는다 — 병원 간판 아래 포인트는
//    병원이 경제적 이익을 주는 것처럼 읽힌다.
//  - 좋다·나쁘다 색이나 목표·판정은 붙이지 않는다. 숫자만 정리한다(진단·처방·약 조절 안내를 하지 않는다는 약속).

/**
 * 병원 결과지 기간: 오늘을 포함한 최근 days 일(달력 기준). 'YYYY-MM-DD' 두 개를 돌려준다.
 * (2026-11-18 대표: "결과지 기간은 최근 30일 달력기준으로 하자." → "4주인 28일로 하자." 일반 결과지는 "기록이 있는 최근 30번" 이라
 *  기록이 띄엄띄엄하면 두 달이 넘는 기간이 30일로 적혔다.)
 */
export function clinicReportWindow(todayStr, days = 28) {
    const end = new Date(`${todayStr}T00:00:00Z`);
    if (Number.isNaN(end.getTime())) return null;
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days };
}

/** 병원 회원이면 병원 이름, 아니면 ''. 머리글 병원 칸에서 읽는다(renderClinicBanner 가 채운다). */
export function getClinicReportName(root = globalThis.document) {
    if (!root?.documentElement?.classList?.contains('clinic-branded')) return '';
    return String(root.querySelector?.('#clinic-banner .clinic-banner__name')?.textContent || '').trim();
}

function round(value, digits = 0) {
    const f = 10 ** digits;
    return Math.round(value * f) / f;
}

function summarizeSeries(points, digits = 0) {
    const values = points.map((p) => p.v).filter((v) => Number.isFinite(v) && v > 0);
    if (!values.length) return { count: 0 };
    const sum = values.reduce((a, b) => a + b, 0);
    return {
        count: values.length,
        first: round(values[0], digits),
        last: round(values[values.length - 1], digits),
        average: round(sum / values.length, digits),
        min: round(Math.min(...values), digits),
        max: round(Math.max(...values), digits)
    };
}

/**
 * 날짜 오름차순 일일 기록에서 혈압·혈당·체중을 정리한다.
 * metrics.bpSystolic / bpDiastolic / glucose / weight (문자열이어도 된다).
 */
export function summarizeClinicVitals(logs = []) {
    const pick = (key) => logs
        .filter((log) => log?.metrics && log.metrics[key] !== undefined && log.metrics[key] !== '')
        .map((log) => ({ date: log.date, v: parseFloat(log.metrics[key]) }));
    return {
        systolic: summarizeSeries(pick('bpSystolic')),
        diastolic: summarizeSeries(pick('bpDiastolic')),
        glucose: summarizeSeries(pick('glucose')),
        weight: summarizeSeries(pick('weight'), 1)
    };
}

// ===== 병원 소개 (2026-11-18 대표: "왼쪽 위 요셉의원 누르면 소개 페이지, 카톡 등으로 공유. 포인트 리워드는 안 주고") =====
//
// 병원 문서의 공개 정보만 싣는다: 이름·로고·원장·소개(intro)·주소(address)·전화(phone)·안내(hours)·홈페이지(homepageUrl).
// 공유 주소는 병원 QR 과 같다(/app?clinic=<id>). 초대 코드(ref)는 붙이지 않는다 — 소개해도 포인트·보상이 없다.

// 짧은 병원 주소(2026-11-22 대표: "3글자 이름 좋다. 참사랑은 csr, 요셉은 jos"): habitschool.web.app/jos, /csr.
// firebase.json 에 rewrite 가 있는 병원만 — 없는 병원은 아래 긴 주소. 병원을 더하면 여기, firebase.json, admin.html,
// scripts/generate-clinic-pages.js 를 같이(tests/short-links.test.js).
export const SHORT_CLINIC_PATHS = Object.freeze({ joseph: 'jos', chamsarang: 'csr' });

/** 병원 소개를 나눌 주소. 병원 QR 과 같다. 초대 코드를 붙이지 않는다. */
export function buildClinicShareUrl(clinicId, origin = globalThis.location?.origin || 'https://habitschool.web.app') {
    const id = normalizeClinicSlug(clinicId);
    if (!id) return '';
    const short = SHORT_CLINIC_PATHS[id];
    if (short) return `${String(origin).replace(/\/+$/, '')}/${short}`;
    // 카톡 미리보기가 병원 이름·그림으로 뜨는 시작 링크. 열면 곧바로 /app?clinic=<병원> 으로 간다
    // (clinic/<병원>/app.html, scripts/generate-clinic-pages.js). 파일이 없는 병원도 clinic.html 이 앱으로 보낸다.
    return `${String(origin).replace(/\/+$/, '')}/clinic/${encodeURIComponent(id)}/app`;
}

function safePhoneHref(raw) {
    const digits = String(raw || '').replace(/[^\d+]/g, '');
    return digits.length >= 7 ? `tel:${digits}` : '';
}

function safeHttpsUrl(raw) {
    try {
        const url = new URL(String(raw || '').trim());
        return url.protocol === 'https:' ? url.href : '';
    } catch (_) {
        return '';
    }
}

/** 병원 소개 칸을 채운다. 글자는 textContent 로만, 링크는 tel: 과 https: 만. */
export function renderClinicIntro(clinic, root = globalThis.document) {
    const section = root?.getElementById?.('clinic-intro');
    if (!section || !isUsableClinic(clinic)) return false;
    const english = isEnglishRoot(root);
    clinic = localizeClinic(clinic, english);
    const q = (sel) => section.querySelector(sel);
    const setText = (sel, value) => {
        const el = q(sel);
        if (!el) return;
        const text = String(value || '').trim();
        el.textContent = text;
        el.hidden = !text;
    };
    setText('.clinic-intro__name', clinic.name);
    const director = String(clinic.directorName || '').trim();
    setText('.clinic-intro__director', director ? (english ? `Dr. ${director}` : `${director} 원장`) : '');
    setText('.clinic-intro__text', clinic.intro);
    fillMark(section, clinic, '.clinic-intro__logo', '.clinic-intro__initial');

    const row = (field) => q(`.clinic-intro__row[data-field="${field}"]`);
    const showRow = (field, value, fill) => {
        const el = row(field);
        if (!el) return;
        const text = String(value || '').trim();
        el.hidden = !text;
        if (text) fill(el, text);
    };
    showRow('address', clinic.address, (el, text) => { el.querySelector('dd').textContent = text; });
    showRow('hours', clinic.hours, (el, text) => { el.querySelector('dd').textContent = text; });
    const phoneHref = safePhoneHref(clinic.phone);
    showRow('phone', phoneHref ? clinic.phone : '', (el, text) => {
        const a = el.querySelector('a');
        a.textContent = text;
        a.setAttribute('href', phoneHref);
    });
    const homepage = safeHttpsUrl(clinic.homepageUrl);
    showRow('homepage', homepage, (el) => {
        const a = el.querySelector('a');
        a.textContent = homepage.replace(/^https:\/\//, '').replace(/\/$/, '');
        a.setAttribute('href', homepage);
    });
    applyBrandColor(section, clinic);
    return true;
}

/** 머리글의 병원 이름을 누르면 병원 소개 칸을 다른 탭처럼 연다. */
export function openClinicIntro(root = globalThis.document) {
    const clinic = currentClinic;
    const section = root?.getElementById?.('clinic-intro');
    if (!clinic || !section) return false;
    renderClinicIntro(clinic, root);
    for (const el of root.getElementsByClassName('content-section')) {
        el.style.display = 'none';
        el.classList.remove('active');
    }
    for (const btn of root.getElementsByClassName('tab-btn')) {
        btn.classList.remove('active');
        btn.removeAttribute('aria-current');
    }
    const submitBar = root.getElementById('submit-bar');
    if (submitBar) submitBar.style.display = 'none';
    section.style.display = 'block';
    section.classList.add('active');
    globalThis.scrollTo?.({ top: 0 });
    return true;
}

/** 시스템 공유 창(카카오톡·문자 등). 없으면 주소를 복사한다. 포인트·보상은 없다. */
export async function shareClinicIntro({ nav = globalThis.navigator, toast = () => {}, root = globalThis.document } = {}) {
    const english = isEnglishRoot(root);
    const clinic = localizeClinic(currentClinic, english);
    if (!clinic) return 'none';
    const url = buildClinicShareUrl(clinic.id);
    if (!url) return 'none';
    const name = clinic.name.trim();
    const text = english
        ? `${name} Health Notebook. Log your morning blood pressure, glucose, meals and exercise, and show them at your visit.`
        : `${name} 건강수첩이에요. 아침 혈압·혈당과 식사·운동을 기록해 진료 때 보여 드릴 수 있어요.`;
    if (typeof nav?.share === 'function') {
        try {
            await nav.share({ title: english ? `${name} Health Notebook` : `${name} 건강수첩`, text, url });
            return 'shared';
        } catch (error) {
            if (error?.name === 'AbortError') return 'cancelled';
        }
    }
    try {
        await nav?.clipboard?.writeText?.(`${text}\n${url}`);
        toast(english ? 'Link copied. Paste it into a message to share.' : '병원 소개 주소를 복사했어요. 카톡에 붙여 넣어 보내 주세요.');
        return 'copied';
    } catch (_) {
        toast(url);
        return 'shown';
    }
}

