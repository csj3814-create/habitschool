// 병원 시범 운영 — 병원 QR 링크로 회원을 병원과 잇는다 (2026-11-17, tasks/2026-11-17_병원_시범_연결.md)
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    CLINIC_THEME_KEY,
    PENDING_CLINIC_KEY,
    PENDING_CLINIC_MAX_AGE_MS,
    clearPendingClinic,
    decideClinicLink,
    isUsableClinic,
    normalizeClinicSlug,
    persistPendingClinic,
    readClinicSlugFromSearch,
    readPendingClinic,
    renderClinicBanner,
    renderClinicLogin
} from '../js/clinic-link.js';

const read = (path) => readFileSync(resolve(path), 'utf8');
const require = createRequire(import.meta.url);

function memoryStorage() {
    const map = new Map();
    return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: (key) => map.delete(key),
        raw: map
    };
}

const JOSEPH = { id: 'joseph', name: '요셉의원', directorName: '고영초', greeting: '', logoUrl: '', active: true };

describe('clinic slug', () => {
    it('accepts lowercase slugs and rejects anything else', () => {
        expect(normalizeClinicSlug('joseph')).toBe('joseph');
        expect(normalizeClinicSlug(' Simon ')).toBe('simon');
        expect(normalizeClinicSlug('a')).toBe('');
        expect(normalizeClinicSlug('../admins')).toBe('');
        expect(normalizeClinicSlug('joseph/x')).toBe('');
        expect(normalizeClinicSlug('x'.repeat(33))).toBe('');
        expect(normalizeClinicSlug(null)).toBe('');
    });

    it('reads ?clinic= from the address', () => {
        expect(readClinicSlugFromSearch('?clinic=joseph')).toBe('joseph');
        expect(readClinicSlugFromSearch('?ref=ABC123&clinic=simon&utm_source=qr')).toBe('simon');
        expect(readClinicSlugFromSearch('?ref=ABC123')).toBe('');
        expect(readClinicSlugFromSearch('?clinic=<script>')).toBe('');
    });

    it('matches the slug format the rules enforce', () => {
        expect(read('firestore.rules')).toContain("data.clinicId.matches('^[a-z0-9-]{2,32}$')");
        expect(read('js/clinic-link.js')).toContain('/^[a-z0-9-]{2,32}$/');
    });
});

describe('pending clinic survives the login redirect, but not for long', () => {
    it('keeps the slug through a page change and clears it after use', () => {
        const storage = memoryStorage();
        const now = 1_800_000_000_000;
        expect(persistPendingClinic('joseph', storage, now)).toBe('joseph');
        expect(readPendingClinic(storage, now + 60_000)).toBe('joseph');
        clearPendingClinic(storage);
        expect(readPendingClinic(storage, now)).toBe('');
    });

    it('ignores a QR scanned more than a day ago (someone else may sign in on this device)', () => {
        const storage = memoryStorage();
        const now = 1_800_000_000_000;
        persistPendingClinic('joseph', storage, now);
        expect(readPendingClinic(storage, now + PENDING_CLINIC_MAX_AGE_MS + 1)).toBe('');
    });

    it('does not store junk', () => {
        const storage = memoryStorage();
        expect(persistPendingClinic('../x', storage)).toBe('');
        expect(storage.raw.has(PENDING_CLINIC_KEY)).toBe(false);
        storage.setItem(PENDING_CLINIC_KEY, 'not json');
        expect(readPendingClinic(storage)).toBe('');
    });
});

describe('what to do with a clinic link', () => {
    it('links a member who has no clinic', () => {
        expect(decideClinicLink({ pendingSlug: 'joseph', currentClinicId: '', clinic: JOSEPH })).toBe('link');
    });

    it('does nothing when already linked to the same clinic', () => {
        expect(decideClinicLink({ pendingSlug: 'joseph', currentClinicId: 'joseph', clinic: JOSEPH })).toBe('same');
    });

    it('asks before replacing another clinic', () => {
        expect(decideClinicLink({ pendingSlug: 'joseph', currentClinicId: 'simon', clinic: JOSEPH })).toBe('confirm');
    });

    it('refuses a clinic that does not exist or is switched off', () => {
        expect(decideClinicLink({ pendingSlug: 'joseph', clinic: null })).toBe('invalid');
        expect(decideClinicLink({ pendingSlug: 'joseph', clinic: { ...JOSEPH, active: false } })).toBe('invalid');
        expect(decideClinicLink({ pendingSlug: 'joseph', clinic: { ...JOSEPH, name: ' ' } })).toBe('invalid');
        expect(isUsableClinic(JOSEPH)).toBe(true);
    });

    it('does nothing without a link', () => {
        expect(decideClinicLink({ pendingSlug: '', currentClinicId: 'simon', clinic: JOSEPH })).toBe('none');
    });
});

function fakeElement() {
    return {
        textContent: '', hidden: true, src: '',
        removeAttribute(name) { if (name === 'src') this.src = ''; }
    };
}

function fakeHtml() {
    const props = {};
    const classes = new Set();
    return {
        props,
        classes,
        style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } },
        classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)) }
    };
}

function fakeBanner() {
    const parts = Object.fromEntries([
        '.clinic-banner__name', '.clinic-banner__logo', '.clinic-banner__initial'
    ].map((sel) => [sel, fakeElement()]));
    const html = fakeHtml();
    const storage = memoryStorage();
    const banner = {
        hidden: true,
        dataset: {},
        querySelector: (sel) => parts[sel],
        removeAttribute(name) { if (name === 'data-clinic-id') delete this.dataset.clinicId; },
        parts,
        props: html.props,
        html,
        storage
    };
    const root = { documentElement: html, getElementById: (id) => (id === 'clinic-banner' ? banner : null) };
    return { banner, root, render: (clinic) => renderClinicBanner(clinic, root, { storage }) };
}

function fakeLogin() {
    const parts = Object.fromEntries([
        '.clinic-login-brand__name', '.clinic-login-brand__logo', '.clinic-login-brand__initial',
        '.clinic-login-brand__director', '.clinic-login-brand__greeting'
    ].map((sel) => [sel, fakeElement()]));
    const brand = { hidden: true, querySelector: (sel) => parts[sel], parts };
    const points = { hidden: true };
    const note = { hidden: true };
    const html = fakeHtml();
    const byId = { 'clinic-login-brand': brand, 'clinic-login-points': points, 'clinic-login-note': note };
    return { brand, points, note, html, root: { documentElement: html, getElementById: (id) => byId[id] || null } };
}

describe('clinic header (logo, clinic name, member name and date on one line)', () => {
    it('shows the clinic name, the first letter until a logo arrives, and turns on the clinic theme', () => {
        const { banner, render } = fakeBanner();
        expect(render(JOSEPH)).toBe(true);
        expect(banner.hidden).toBe(false);
        expect(banner.parts['.clinic-banner__name'].textContent).toBe('요셉의원');
        expect(banner.parts['.clinic-banner__logo'].hidden).toBe(true);
        expect(banner.parts['.clinic-banner__initial'].textContent).toBe('요');
        expect(banner.html.classes.has('clinic-branded')).toBe(true);
        expect(banner.html.classes.has('clinic-theme')).toBe(true);
    });

    it('takes a logo from this app (/assets/clinics/...) or https only', () => {
        const { banner, render } = fakeBanner();
        render({ ...JOSEPH, logoUrl: '/assets/clinics/joseph-logo.png' });
        expect(banner.parts['.clinic-banner__logo'].src).toMatch(/\/assets\/clinics\/joseph-logo\.png$/);
        expect(banner.parts['.clinic-banner__logo'].hidden).toBe(false);
        expect(banner.parts['.clinic-banner__initial'].hidden).toBe(true);
        for (const bad of ['javascript:alert(1)', 'http://example.com/x.png', 'data:image/png;base64,AA']) {
            render({ ...JOSEPH, logoUrl: bad });
            expect(banner.parts['.clinic-banner__logo'].hidden, bad).toBe(true);
        }
        render({ ...JOSEPH, logoUrl: 'https://example.com/logo.png' });
        expect(banner.parts['.clinic-banner__logo'].src).toBe('https://example.com/logo.png');
    });

    it('writes text only and accepts hex colours only', () => {
        const { banner, render } = fakeBanner();
        render({ ...JOSEPH, name: '<img src=x onerror=alert(1)>', brandColor: 'red;background:url(x)' });
        expect(banner.parts['.clinic-banner__name'].textContent).toBe('<img src=x onerror=alert(1)>');
        expect(banner.props['--clinic-brand']).toBeUndefined();
        render({ ...JOSEPH, brandColor: '#7EA018' });
        expect(banner.props['--clinic-brand']).toBe('#7EA018');
    });

    it('remembers the colour for the next first paint, and forgets it on sign-out', () => {
        const { banner, render } = fakeBanner();
        render({ ...JOSEPH, brandColor: '#7EA018' });
        expect(JSON.parse(banner.storage.getItem(CLINIC_THEME_KEY))).toEqual({ color: '#7EA018' });
        expect(render(null)).toBe(false);
        expect(banner.hidden).toBe(true);
        expect(banner.html.classes.has('clinic-branded')).toBe(false);
        expect(banner.html.classes.has('clinic-theme')).toBe(false);
        expect(banner.storage.getItem(CLINIC_THEME_KEY)).toBeNull();
    });

    it('paints the remembered colour in the page head, before the modules load', () => {
        for (const page of ['index.html', 'en/index.html']) {
            const html = read(page);
            const head = html.slice(0, html.indexOf('</head>'));
            expect(head).toContain("localStorage.getItem('habitschoolClinicTheme')");
            expect(head).toContain("root.classList.add('clinic-theme', 'clinic-branded')");
        }
        expect(CLINIC_THEME_KEY).toBe('habitschoolClinicTheme');
    });

    it('never uses innerHTML in the clinic code', () => {
        expect(read('js/clinic-link.js')).not.toMatch(/innerHTML/);
    });

    it('sits in the same header row as the member name and date, in both app shells', () => {
        for (const page of ['index.html', 'en/index.html']) {
            const html = read(page);
            const headerTop = html.indexOf('<div class="header-top">');
            const banner = html.indexOf('<span id="clinic-banner" class="clinic-banner" hidden>');
            const greeting = html.indexOf('<h1 id="user-greeting"');
            const date = html.indexOf('id="date-ui"');
            expect(headerTop).toBeGreaterThan(0);
            expect(banner).toBeGreaterThan(headerTop);
            expect(greeting).toBeGreaterThan(banner);
            expect(date).toBeGreaterThan(greeting);
        }
    });

    it('colours the header and hides the point badge under the clinic sign, but not the points themselves', () => {
        const css = read('styles-features.css');
        expect(css).toContain('html.clinic-branded .header { background-color: var(--clinic-brand);');
        expect(css).toContain('html.clinic-branded #point-badge-ui { display: none !important; }');
        expect(css).not.toMatch(/html\.clinic-branded[^{]*#(assets|reward)/);
    });
});

describe('clinic theme (orange → clinic colour)', () => {
    it('is up to date with the stylesheets', () => {
        const result = spawnSync(process.execPath, ['scripts/generate-clinic-theme.js', '--check'], { encoding: 'utf8' });
        expect(result.status, result.stderr).toBe(0);
    });

    it('is loaded and pre-cached', () => {
        expect(read('index.html')).toContain('<link rel="stylesheet" href="styles-clinic-theme.css?v=');
        expect(read('sw.js')).toContain("'./styles-clinic-theme.css?v=");
    });

    it('only applies under the clinic class, without adding specificity', () => {
        const css = read('styles-clinic-theme.css').replace(/\/\*[\s\S]*?\*\//g, '');
        const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((s) => !s.startsWith('@'));
        expect(selectors.length).toBeGreaterThan(100);
        for (const group of selectors) {
            for (const selector of group.split(',')) {
                // :where() 는 구체성을 더하지 않는다 — 더 구체적인 원래 규칙(border: 0 등)이 지금처럼 이긴다.
                expect(selector.trim(), group).toMatch(
                    /^(:where\(html\.clinic-theme\) |html:where\(\.clinic-theme\)|:root:where\(\.clinic-theme\)|html\.clinic-theme$)/
                );
            }
        }
    });

    it('maps the app oranges and leaves warnings and gold alone', () => {
        const css = read('styles-clinic-theme.css');
        expect(css).toContain('--primary-color: var(--clinic-brand)');
        // 값에만 본다(선택자의 [style*="color:#FF8C00"] 는 원래 규칙을 가리키는 것이다)
        const values = [...css.matchAll(/:\s*([^;{}]+)[;}]/g)].map((m) => m[1]).join(' ');
        expect(values).not.toMatch(/#FF8C00|#FFB74D|#E65100/i);
        expect(css).not.toMatch(/--warning-|--error-/);
        // 주황인지는 색상으로 가린다. 금색·노랑(별점·보상)과 빨강(오류)은 그대로, 갈색(채도 낮음)도 그대로.
        const { mapValue } = require('../scripts/generate-clinic-theme.js');
        for (const keep of ['#FFC107', '#FFD54F', '#E57373', '#F44336', '#4A3A22', '#5C4A2E', '#4CAF50']) {
            expect(mapValue(`color: ${keep}`), keep).toBeNull();
        }
        expect(mapValue('#FF8C00')).toBe('var(--clinic-brand)');
        expect(mapValue('#FFF3E0')).toBe('var(--clinic-brand-wash)');
        expect(mapValue('rgba(255, 140, 0, 0.3)')).toBe('color-mix(in srgb, var(--clinic-brand) 30%, transparent)');
        expect(mapValue('linear-gradient(#FFD54F, #FF8C00)')).toBe('linear-gradient(#FFD54F, var(--clinic-brand))');
    });
});

describe('clinic login screen (QR, not signed in yet)', () => {
    it('shows the clinic name and hides Habit School gift/coupon pitch', () => {
        const { brand, points, note, html, root } = fakeLogin();
        expect(renderClinicLogin({ ...JOSEPH, name: '참사랑내과의원', directorName: '오기창' }, root)).toBe(true);
        expect(brand.parts['.clinic-login-brand__name'].textContent).toBe('참사랑내과의원');
        expect(brand.parts['.clinic-login-brand__initial'].textContent).toBe('참');
        expect(brand.parts['.clinic-login-brand__director'].textContent).toBe('오기창 원장');
        expect([brand.hidden, points.hidden, note.hidden]).toEqual([false, false, false]);
        expect(html.classes.has('clinic-entry')).toBe(true);
        expect(html.classes.has('clinic-theme')).toBe(true);
        const css = read('styles-features.css');
        for (const hidden of ['#login-value-points', '#login-film', '.login-title', '.login-tagline', '.version-switcher', '#guest-demo-entry-btn']) {
            expect(css).toMatch(new RegExp(`html\\.clinic-entry[^{]*${hidden.replace('.', '\\.')}`));
        }
    });

    it('leaves the director out when the clinic has none (요셉의원: 여러 봉사 의사)', () => {
        const { brand, root } = fakeLogin();
        renderClinicLogin({ ...JOSEPH, directorName: '' }, root);
        expect(brand.parts['.clinic-login-brand__director'].hidden).toBe(true);
        expect(brand.parts['.clinic-login-brand__greeting'].hidden).toBe(true);
    });

    it('stays the normal login screen for an unknown clinic', () => {
        const { brand, html, root } = fakeLogin();
        expect(renderClinicLogin(null, root)).toBe(false);
        expect(brand.hidden).toBe(true);
        expect(html.classes.has('clinic-entry')).toBe(false);
    });

    it('loads the clinic before sign-in, from the public clinic doc', () => {
        const AUTH = read('js/auth.js');
        expect(AUTH).toMatch(/renderClinicBanner\(null\);\s*showClinicLoginBrand\(\);/);
        // 로그인 여부를 기다리지 않고 페이지를 열 때도 칠한다(첫 방문은 20초 넘게 걸린다)
        expect(AUTH).toMatch(/\nshowClinicLoginBrand\(\);\n/);
        const login = read('index.html');
        expect(login).toContain('<div id="clinic-login-brand" class="clinic-login-brand" hidden>');
        // 병원 화면의 안내에는 포인트·쿠폰·선물이 없다
        const pointsStart = login.indexOf('id="clinic-login-points"');
        const pointsBlock = login.slice(pointsStart, login.indexOf('</div>', login.indexOf('</ul>', pointsStart)));
        expect(pointsBlock).not.toMatch(/P|포인트|쿠폰|선물/);
    });
});

describe('wiring', () => {
    const AUTH = read('js/auth.js');

    it('remembers ?clinic= on page load, like the invite link', () => {
        expect(AUTH).toContain('const _clinicSlugFromUrl = readClinicSlugFromSearch(window.location.search);');
        expect(AUTH).toContain('persistPendingClinic(_clinicSlugFromUrl);');
    });

    it('handles the link after the member doc save, for new and existing members alike', () => {
        const save = AUTH.indexOf('await setDoc(userRef, updateData, { merge: true })');
        const invite = AUTH.indexOf('await maybeHandleInviteLinkAfterAuth(user, ud, {');
        const clinic = AUTH.indexOf('maybeHandleClinicLinkAfterAuth(user, ud)');
        expect(save).toBeGreaterThan(0);
        expect(invite).toBeGreaterThan(save);
        expect(clinic).toBeGreaterThan(invite);
        // isNewUser 로 가르지 않는다 — 이미 가입한 회원도 링크로 들어오면 이어진다.
        expect(AUTH).not.toMatch(/isNewUser[^\n]*maybeHandleClinicLinkAfterAuth/);
    });

    it('writes only clinicId and a server timestamp, and never swallows a rejected write', () => {
        const start = AUTH.indexOf('async function maybeHandleClinicLinkAfterAuth');
        const body = AUTH.slice(start, AUTH.indexOf('/** 앱 위쪽 병원 띠.', start));
        expect(body).toContain("clinicId: pendingSlug,\n            clinicLinkedAt: serverTimestamp()");
        expect(body).toContain("console.error('[clinic] 병원 연결 저장 실패");
        expect(body).toContain('window.confirm(message)');
        expect(body).not.toMatch(/\.catch\(\(\) => \{\s*\}\)/);
    });

    it('keeps the pending link when the save fails, so the next app open retries', () => {
        const start = AUTH.indexOf('async function maybeHandleClinicLinkAfterAuth');
        const body = AUTH.slice(start, AUTH.indexOf('/** 앱 위쪽 병원 띠.', start));
        const failure = body.indexOf("console.error('[clinic] 병원 연결 저장 실패");
        const failureReturn = body.indexOf('return currentClinicId;', failure);
        expect(body.slice(failure, failureReturn)).not.toContain('finishPending');
        expect(body.indexOf('finishPending();', failureReturn)).toBeGreaterThan(failureReturn);
        // 결정 직후 바로 지우지 않는다
        expect(body).not.toMatch(/decideClinicLink\([^)]*\);\s*clearPendingClinic\(\);/);
    });

    it('hides the banner on sign-out', () => {
        expect(AUTH).toMatch(/applyInviteLandingBanner\(false\);\s*trackInviteLinkLanding\(false\);\s*renderClinicBanner\(null\);/);
    });

    it('keeps clinic links out of points, push and challenges', () => {
        const start = AUTH.indexOf('// ===== 병원 링크');
        const section = AUTH.slice(start, AUTH.indexOf('// ===== 처음 어디서 왔는가', start));
        expect(section).not.toMatch(/httpsCallable|coins|points|Push|challenge/i);
    });

    it('is pre-cached with the other modules', () => {
        expect(read('sw.js')).toContain("'./js/clinic-link.js?v=");
    });
});

describe('rules', () => {
    const RULES = read('firestore.rules');

    it('makes clinics public to read and admin-only to write', () => {
        expect(RULES).toMatch(/match \/clinics\/\{clinicId\} \{\s*allow read: if true;\s*allow write: if isAdmin\(\);\s*\}/);
    });

    it('whitelists the member fields on create and update, with the value check on both', () => {
        const update = RULES.slice(RULES.indexOf('function isAllowedUserField'), RULES.indexOf('function isAllowedUserCreate'));
        const create = RULES.slice(RULES.indexOf('function isAllowedUserCreate'), RULES.indexOf('match /users/{userId}'));
        for (const block of [update, create]) {
            expect(block).toContain("'clinicId', 'clinicLinkedAt'");
        }
        const users = RULES.slice(RULES.indexOf('match /users/{userId}'), RULES.indexOf('match /inbodyHistory'));
        expect(users.match(/isValidClinicLink\(\)/g)).toHaveLength(2);
        expect(RULES).toContain('exists(/databases/$(database)/documents/clinics/$(data.clinicId))');
        expect(RULES).toContain('data.clinicLinkedAt == request.time');
    });

    it('still keeps member docs owner/admin-only to read', () => {
        expect(RULES).toMatch(/match \/users\/\{userId\} \{\s*allow read: if isOwner\(userId\) \|\| isAdmin\(\);/);
    });
});

describe('clinic switch asks first, even on a device with a stale copy (2026-11-18)', () => {
    const AUTH = read('js/auth.js');
    const start = AUTH.indexOf('async function maybeHandleClinicLinkAfterAuth');
    const body = AUTH.slice(start, AUTH.indexOf('/** 앱 위쪽 병원 띠.', start));

    it('decides from the server copy of the member doc, not the login-time copy', () => {
        expect(AUTH).toMatch(/async function readServerClinicId\(user\) \{[\s\S]*getDocFromServer\(doc\(db, 'users', user\.uid\)\)[\s\S]*readUserDocViaRest\(user\.uid\)/);
        expect(body).toContain('const currentClinicId = await readServerClinicId(user);');
        expect(body.indexOf('readServerClinicId(user)')).toBeLessThan(body.indexOf('decideClinicLink('));
    });

    it('does nothing (and keeps the pending link) when the server cannot be asked', () => {
        const unknown = body.slice(body.indexOf('if (currentClinicId === undefined) {'));
        const block = unknown.slice(0, unknown.indexOf('}') + 1);
        expect(block).toContain('return cachedClinicId;');
        expect(block).not.toMatch(/setDoc|finishPending|clearPendingClinic/);
    });
});

describe('clinic members: My Records ends before the groups, and the report takes the Assets tab', () => {
    const css = read('styles-features.css');
    const html = read('index.html');

    it('hides "함께 소모임" and everything after it on My Records', () => {
        expect(css).toContain('html.clinic-branded #social-challenge-card,\nhtml.clinic-branded #social-challenge-card ~ * { display: none !important; }');
        // 소모임 카드 다음 형제들: 친구 초대, 배지·커뮤니티·마일스톤, 결과지 단추
        const card = html.indexOf('id="social-challenge-card"');
        for (const after of ['id="referral-section"', 'id="dashboard-more-tools"', 'onclick="generate30DayReport()"><span data-i18n="report.openBtn">']) {
            expect(html.indexOf(after), after).toBeGreaterThan(card);
        }
    });

    it('swaps the Assets tab for the 30-day report, for clinic members only', () => {
        expect(html).toContain('<button class="tab-btn clinic-report-tab" type="button" onclick="generate30DayReport()"');
        expect(css).toContain('.clinic-report-tab { display: none; }');
        expect(css).toContain('html.clinic-branded .clinic-report-tab { display: block; }');
        expect(css).toContain(`html.clinic-branded .tab-btn[onclick="openTab('assets')"] { display: none; }`);
    });
});
