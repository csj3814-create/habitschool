// 병원 시범 운영 — 병원 QR 링크로 회원을 병원과 잇는다 (2026-11-17, tasks/2026-11-17_병원_시범_연결.md)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
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
        classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) }
    };
}

function fakeBanner() {
    const parts = Object.fromEntries([
        '.clinic-banner__name', '.clinic-banner__suffix', '.clinic-banner__director',
        '.clinic-banner__greeting', '.clinic-banner__logo', '.clinic-banner__initial'
    ].map((sel) => [sel, fakeElement()]));
    const html = fakeHtml();
    const banner = {
        hidden: true,
        dataset: {},
        querySelector: (sel) => parts[sel],
        removeAttribute(name) { if (name === 'data-clinic-id') delete this.dataset.clinicId; },
        parts,
        props: html.props,
        html
    };
    return { banner, root: { documentElement: html, getElementById: (id) => (id === 'clinic-banner' ? banner : null) } };
}

function fakeLogin() {
    const parts = Object.fromEntries([
        '.clinic-login-brand__name', '.clinic-login-brand__logo', '.clinic-login-brand__initial'
    ].map((sel) => [sel, fakeElement()]));
    const brand = { hidden: true, querySelector: (sel) => parts[sel], parts };
    const points = { hidden: true };
    const note = { hidden: true };
    const html = fakeHtml();
    const byId = { 'clinic-login-brand': brand, 'clinic-login-points': points, 'clinic-login-note': note };
    return { brand, points, note, html, root: { documentElement: html, getElementById: (id) => byId[id] || null } };
}

describe('clinic banner', () => {
    it('shows the clinic name and director, and hides empty greeting and logo', () => {
        const { banner, root } = fakeBanner();
        expect(renderClinicBanner(JOSEPH, root)).toBe(true);
        expect(banner.hidden).toBe(false);
        expect(banner.parts['.clinic-banner__name'].textContent).toBe('요셉의원');
        expect(banner.parts['.clinic-banner__director'].textContent).toBe('고영초 원장');
        expect(banner.parts['.clinic-banner__suffix'].textContent).toBe('건강수첩');
        expect(banner.parts['.clinic-banner__greeting'].hidden).toBe(true);
        expect(banner.parts['.clinic-banner__logo'].hidden).toBe(true);
        // 로고를 받기 전에는 이름 첫 글자
        expect(banner.parts['.clinic-banner__initial'].textContent).toBe('요');
        expect(banner.html.classes.has('clinic-branded')).toBe(true);
    });

    it('leaves the director line out when the clinic has none (요셉의원: 여러 봉사 의사)', () => {
        const { banner, root } = fakeBanner();
        renderClinicBanner({ ...JOSEPH, directorName: '' }, root);
        expect(banner.parts['.clinic-banner__director'].hidden).toBe(true);
        expect(banner.parts['.clinic-banner__director'].textContent).toBe('');
    });

    it('writes text only, accepts only https logos and hex colours', () => {
        const { banner, root } = fakeBanner();
        renderClinicBanner({
            ...JOSEPH,
            name: '<img src=x onerror=alert(1)>',
            greeting: '꾸준히 기록해 보세요',
            logoUrl: 'javascript:alert(1)',
            brandColor: 'red;background:url(x)'
        }, root);
        expect(banner.parts['.clinic-banner__name'].textContent).toBe('<img src=x onerror=alert(1)>');
        expect(banner.parts['.clinic-banner__logo'].hidden).toBe(true);
        expect(banner.props['--clinic-brand']).toBeUndefined();
        expect(banner.parts['.clinic-banner__greeting'].textContent).toBe('꾸준히 기록해 보세요');

        renderClinicBanner({ ...JOSEPH, logoUrl: 'https://example.com/logo.png', brandColor: '#2E7D32' }, root);
        expect(banner.parts['.clinic-banner__logo'].src).toBe('https://example.com/logo.png');
        expect(banner.parts['.clinic-banner__logo'].hidden).toBe(false);
        expect(banner.props['--clinic-brand']).toBe('#2E7D32');
    });

    it('hides for members without a clinic (sign-out, another account)', () => {
        const { banner, root } = fakeBanner();
        renderClinicBanner(JOSEPH, root);
        expect(renderClinicBanner(null, root)).toBe(false);
        expect(banner.hidden).toBe(true);
        expect(banner.html.classes.has('clinic-branded')).toBe(false);
    });

    it('never uses innerHTML in the banner code', () => {
        expect(read('js/clinic-link.js')).not.toMatch(/innerHTML/);
    });

    it('is the first row of the header in both app shells, hidden until a clinic is linked', () => {
        for (const page of ['index.html', 'en/index.html']) {
            const html = read(page);
            const header = html.indexOf('<div class="header" role="banner">');
            const banner = html.indexOf('<div id="clinic-banner" class="clinic-banner" role="note" hidden>');
            const headerTop = html.indexOf('<div class="header-top">', header);
            expect(header).toBeGreaterThan(0);
            expect(banner).toBeGreaterThan(header);
            expect(banner).toBeLessThan(headerTop);
        }
    });

    it('hides the point badge under the clinic sign, but not the points themselves', () => {
        const css = read('styles-features.css');
        expect(css).toContain('html.clinic-branded #point-badge-ui { display: none !important; }');
        expect(css).not.toMatch(/html\.clinic-branded[^{]*#(assets|reward)/);
    });
});

describe('clinic login screen (QR, not signed in yet)', () => {
    it('shows the clinic name and hides Habit School gift/coupon pitch', () => {
        const { brand, points, note, html, root } = fakeLogin();
        expect(renderClinicLogin({ ...JOSEPH, name: '참사랑내과의원' }, root)).toBe(true);
        expect(brand.parts['.clinic-login-brand__name'].textContent).toBe('참사랑내과의원');
        expect(brand.parts['.clinic-login-brand__initial'].textContent).toBe('참');
        expect([brand.hidden, points.hidden, note.hidden]).toEqual([false, false, false]);
        expect(html.classes.has('clinic-entry')).toBe(true);
        const css = read('styles-features.css');
        for (const hidden of ['#login-value-points', '#login-film', '.login-title', '.login-tagline']) {
            expect(css).toMatch(new RegExp(`html\\.clinic-entry[^{]*${hidden.replace('.', '\\.')}`));
        }
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
