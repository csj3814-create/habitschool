// 병원 시범 운영 — 병원 QR 링크로 회원을 병원과 잇는다 (2026-11-17, tasks/2026-11-17_병원_시범_연결.md)
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    CLINIC_THEME_KEY,
    PENDING_CLINIC_KEY,
    buildClinicShareUrl,
    recolorInlineValue,
    clinicReportWindow,
    getCurrentClinic,
    renderClinicIntro,
    shareClinicIntro,
    getClinicReportName,
    summarizeClinicVitals,
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
            const banner = html.indexOf('<span id="clinic-banner" class="clinic-banner" role="button"');
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
        expect(mapValue('#FF3D00')).toBe('var(--clinic-brand)');
        for (const keep of ['#FFC107', '#FFD54F', '#E57373', '#F44336', '#E53935', '#D32F2F', '#4A3A22', '#5C4A2E', '#4CAF50']) {
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
        expect(html).toContain('<button class="tab-btn clinic-report-tab" type="button" onclick="openClinicReportTab()"');
        expect(css).toContain('.clinic-report-tab { display: none; }');
        expect(css).toContain('html.clinic-branded .clinic-report-tab { display: block; }');
        expect(css).toContain(`html.clinic-branded .tab-btn[onclick="openTab('assets')"] { display: none; }`);
    });
});

describe('30-day report for clinic members (2026-11-18 "응, 병원용으로")', () => {
    const CORE = read('js/app-core.js');
    const start = CORE.indexOf('window.generate30DayReport = async function');
    const report = CORE.slice(start, CORE.indexOf('} catch (e) {', start));

    it('summarizes blood pressure, glucose and weight without judging them', () => {
        const v = summarizeClinicVitals([
            { date: '2026-11-01', metrics: { bpSystolic: '134', bpDiastolic: '86', weight: '70.25' } },
            { date: '2026-11-02', metrics: { bpSystolic: '126', bpDiastolic: '80', glucose: '112', weight: '69.9' } },
            { date: '2026-11-03', metrics: { bpSystolic: '128', glucose: '' } },
            { date: '2026-11-04' }
        ]);
        expect(v.systolic).toEqual({ count: 3, first: 134, last: 128, average: 129, min: 126, max: 134 });
        expect(v.diastolic).toEqual({ count: 2, first: 86, last: 80, average: 83, min: 80, max: 86 });
        expect(v.glucose).toEqual({ count: 1, first: 112, last: 112, average: 112, min: 112, max: 112 });
        expect(v.weight.last).toBe(69.9);
        expect(summarizeClinicVitals([]).glucose).toEqual({ count: 0 });
    });

    it('knows it is a clinic member only from the clinic header', () => {
        const root = (branded, name) => ({
            documentElement: { classList: { contains: (c) => branded && c === 'clinic-branded' } },
            querySelector: () => ({ textContent: name })
        });
        expect(getClinicReportName(root(true, ' 요셉의원 '))).toBe('요셉의원');
        expect(getClinicReportName(root(false, '요셉의원'))).toBe('');
    });

    it('titles the report with the clinic and puts vitals first', () => {
        expect(report).toContain("t('report.clinic.title', { clinic: clinicName })");
        // 일반 회원은 처음 글자로 되돌린다(한국어 사전에 report.intro 가 없어 t() 로 되돌리면 키가 보인다)
        expect(report).toContain('el.textContent = clinicName ? clinicText : el.dataset.defaultText;');
        expect(read('js/i18n-ko.js')).toContain("'report.clinic.title': '{clinic} 건강수첩 · 4주 결과지',");
        expect(report.indexOf('data-report-section="clinic-vitals"')).toBeLessThan(report.indexOf('data-report-section="summary"'));
    });

    it('covers the last 4 weeks by the calendar (28 days ending today)', () => {
        expect(clinicReportWindow('2026-11-18')).toEqual({ start: '2026-10-22', end: '2026-11-18', days: 28 });
        expect(clinicReportWindow('2026-03-01')).toEqual({ start: '2026-02-02', end: '2026-03-01', days: 28 });
        expect(clinicReportWindow('nope')).toBeNull();
        expect(CORE).toContain('const CLINIC_REPORT_DAYS = 28;');
        expect(report).toContain('clinicReportWindow(getDatesInfo().todayStr, CLINIC_REPORT_DAYS)');
        expect(report).toContain('logs = logs.filter((log) => log.date >= clinicWindow.start && log.date <= clinicWindow.end);');
        // 머리의 기간과 달력도 그 4주다
        expect(report).toContain('const startDate = clinicWindow ? clinicWindow.start : logs[0].date;');
        expect(report).toContain('buildReportCalendar(logs, clinicWindow ? { from: clinicWindow.start, to: clinicWindow.end } : {})');
        // 식단·운동·마음 칸도 4주 날짜 수로 나눈다(기록 6개면 "6일 / 6일" 이 되던 것)
        expect(report).toContain('const categoryDayTotal = clinicWindow ? clinicWindow.days : logs.length;');
        expect(report).not.toMatch(/report\.category\.days', \{ n: (diet|exer|mind)Days, total: logs\.length \}/);
    });

    it('counts recorded days over the real date span, not over the number of records', () => {
        expect(report).toContain("t('report.category.days', { n: recordDays, total: spanDays })");
        expect(report).toMatch(/const spanDays = Math\.max\(1, Math\.round\(\(Date\.parse\(`\$\{endDate\}T00:00:00Z`\) - Date\.parse\(`\$\{startDate\}T00:00:00Z`\)\) \/ 86400000\) \+ 1\);/);
    });

    it('leaves points out of the clinic report', () => {
        expect(report).toContain('if (!clinicName) html += `<div class="report-section" data-report-section="summary">');
        expect(report).toContain('if (!clinicName) html += `<div class="report-section" data-report-section="points">');
        expect(report).toContain('if (!clinicName) html += `<div class="report-section" data-report-section="category-trend">');
        expect(report).toContain('renderReportCalendar(calendarWeeks, { hidePoints: !!clinicName })');
        const clinicBlock = report.slice(report.indexOf('if (clinicName) {'), report.indexOf('// — 요약 카드 —'));
        // 화면에 나가는 포인트 글자(…P)나 좋다·나쁘다 색이 없다. dietPoints 같은 변수는 기록한 날을 세는 데만 쓴다.
        expect(clinicBlock).not.toMatch(/\}P|\dP\b|report\.summary|report-metric-diff|'good'|'warn'/);
        expect(report).toContain("const dietDetail = clinicName ? t('report.clinic.dietDetail', { photos: dietPhotos })");
        expect(read('js/i18n-ko.js')).toMatch(/'report\.clinic\.(dietDetail|exerciseDetail|mindDetail)': '[^'P]*',/);
        // 인쇄도 병원 결과지를 막지 않는다
        expect(CORE).toContain("const REPORT_PRINT_CLINIC_REQUIRED_SECTIONS = Object.freeze(['clinic-vitals', 'category', 'calendar']);");
    });
});

describe('clinic members: report as a tab, no Habit School group chat, white button text (2026-11-18)', () => {
    const CORE = read('js/app-core.js');
    const css = read('styles-features.css');
    const html = read('index.html');

    it('draws the report inside a tab section instead of the popup', () => {
        expect(html).toContain('<div id="clinic-report" class="content-section clinic-report-section" role="region" data-i18n-aria-label="report.clinic.tabRegionAria" aria-label="결과지" style="display:none;"></div>');
        const open = CORE.slice(CORE.indexOf('window.openClinicReportTab = async function'), CORE.indexOf('window.close30DayReport = function'));
        expect(open).toContain("if (container.parentElement !== section) section.appendChild(container);");
        expect(open).toContain("if (modal) modal.style.display = 'none';");
        expect(open).toContain('await window.generate30DayReport();');
        // 다른 탭과 같은 방식으로 칸·단추를 바꾼다(openTab 이 이 칸을 숨길 수 있게 content-section 이다)
        expect(open).toContain("for (const el of document.getElementsByClassName('content-section'))");
        // 제목·소개는 카드 안에서 찾는다(창 안에서 찾으면 탭에서는 못 찾아 "해빛스쿨 30일 종합 결과지" 로 남았다)
        const gen = CORE.slice(CORE.indexOf('window.generate30DayReport = async function'));
        expect(gen).toContain("[reportContainer?.querySelector?.('.report-header h2'), t('report.clinic.title', { clinic: clinicName })]");
        expect(gen.slice(0, gen.indexOf('const startDate'))).not.toContain("modal.querySelector");
    });

    it('puts the report card back into the popup for everyone else', () => {
        const genStart = CORE.indexOf('window.generate30DayReport = async function');
        const gen = CORE.slice(genStart, CORE.indexOf("document.getElementById('report-user-name')", genStart));
        expect(gen).toContain('if (!inlineReport && reportContainer && modal && reportContainer.parentElement !== modal) {');
        expect(gen).toContain("if (!inlineReport) modal.style.display = 'flex';");
    });

    it('hides the popup close buttons inside the tab', () => {
        expect(css).toContain('.clinic-report-section .report-close-x,\n.clinic-report-section .report-btn-close { display: none; }');
    });

    it('hides the gallery bottom group-chat button for clinic members', () => {
        const fn = CORE.slice(CORE.indexOf('function updateGalleryPrimaryAction()'), CORE.indexOf('function handleMissionPrimaryAction()'));
        const clinic = fn.indexOf("document.documentElement.classList.contains('clinic-branded')");
        expect(clinic).toBeGreaterThan(0);
        expect(clinic).toBeLessThan(fn.indexOf("saveBtn.dataset.mode = 'chat'"));
    });

    it('hides the Habit School group-chat banner for clinic members', () => {
        expect(html).toContain('id="chat-banner"');
        expect(css).toContain('html.clinic-branded #chat-banner { display: none !important; }');
    });

    it('writes white text on clinic-colored buttons, beating the generated theme', () => {
        expect(css).toContain('html.clinic-theme .submit-btn,\nhtml.clinic-theme .submit-btn.install-mode { color: #FFFFFF; }');
        // 생성 테마는 :where() 라 이 규칙(html.clinic-theme ...)보다 구체성이 낮다
        expect(read('styles-clinic-theme.css')).toContain(':where(html.clinic-theme) .submit-btn.install-mode {');
    });
});

describe('clinic intro page and sharing, no friend invites (2026-11-18)', () => {
    const html = read('index.html');
    const css = read('styles-features.css');

    it('opens from the clinic name in the header', () => {
        expect(html).toMatch(/<span id="clinic-banner" class="clinic-banner" role="button" tabindex="0"[^>]*onclick="openClinicIntro\(\)"/);
        expect(html).toContain('<div id="clinic-intro" class="content-section clinic-intro-section"');
        expect(read('js/auth.js')).toContain('window.openClinicIntro = () => openClinicIntro();');
    });

    it('shares the clinic QR address only — no invite code, no points', () => {
        expect(buildClinicShareUrl('joseph', 'https://habitschool.web.app')).toBe('https://habitschool.web.app/app?clinic=joseph');
        expect(buildClinicShareUrl('../x', 'https://habitschool.web.app')).toBe('');
        const intro = read('js/clinic-link.js').slice(read('js/clinic-link.js').indexOf('// ===== 병원 소개'));
        expect(intro).not.toMatch(/ref=|referral|httpsCallable|coins|포인트를 받|P 받/);
        expect(html.slice(html.indexOf('id="clinic-intro"'), html.indexOf('id="clinic-report"'))).not.toMatch(/\d+P|포인트|보상/);
    });

    it('uses the system share sheet, and copies the address when there is none', async () => {
        const { render } = fakeBanner();
        render({ ...JOSEPH, id: 'joseph' });
        expect(getCurrentClinic().id).toBe('joseph');
        const shared = [];
        expect(await shareClinicIntro({ nav: { share: async (d) => shared.push(d) } })).toBe('shared');
        expect(shared[0].url).toMatch(/\/app\?clinic=joseph$/);
        const copied = [];
        const toasts = [];
        expect(await shareClinicIntro({ nav: { clipboard: { writeText: async (t) => copied.push(t) } }, toast: (m) => toasts.push(m) })).toBe('copied');
        expect(copied[0]).toMatch(/\/app\?clinic=joseph$/);
        const abort = Object.assign(new Error('x'), { name: 'AbortError' });
        expect(await shareClinicIntro({ nav: { share: async () => { throw abort; } } })).toBe('cancelled');
    });

    it('fills the intro with text only, tel: and https: links only', () => {
        const el = (extra = {}) => ({ textContent: '', hidden: true, src: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, ...extra });
        const rows = {};
        for (const f of ['address', 'phone', 'hours', 'homepage']) {
            const dd = el(); const a = el();
            rows[f] = el({ querySelector: (s) => (s === 'a' ? a : dd), dd, a });
        }
        const parts = {
            '.clinic-intro__name': el(), '.clinic-intro__director': el(), '.clinic-intro__text': el(),
            '.clinic-intro__logo': el(), '.clinic-intro__initial': el()
        };
        const section = {
            style: { setProperty() {}, removeProperty() {} },
            querySelector: (sel) => parts[sel] || rows[(sel.match(/data-field="(\w+)"/) || [])[1]]
        };
        const root = { getElementById: (id) => (id === 'clinic-intro' ? section : null) };
        renderClinicIntro({
            ...JOSEPH, directorName: '', intro: '<b>무료 자선병원</b>', address: '서울 용산구 한강대로 389',
            phone: '02-2634-1760', homepageUrl: 'javascript:alert(1)'
        }, root);
        expect(parts['.clinic-intro__text'].textContent).toBe('<b>무료 자선병원</b>');
        expect(parts['.clinic-intro__director'].hidden).toBe(true);
        expect(rows.phone.a.attrs.href).toBe('tel:0226341760');
        expect(rows.homepage.hidden).toBe(true);
        expect(rows.hours.hidden).toBe(true);
        renderClinicIntro({ ...JOSEPH, homepageUrl: 'https://www.josephclinic.org/' }, root);
        expect(rows.homepage.a.attrs.href).toBe('https://www.josephclinic.org/');
    });

    it('hides the whole friends·invite group in Profile for clinic members', () => {
        expect(html).toContain('<details class="profile-group" id="profile-group-friends"');
        expect(css).toContain('html.clinic-branded #profile-group-friends { display: none !important; }');
    });
});

describe('inline oranges in index.html follow the clinic colour too', () => {
    it('uses the same orange test as the stylesheet generator', () => {
        const { mapValue } = require('../scripts/generate-clinic-theme.js');
        for (const c of ['#FF8C00', '#FFa040', '#FFF3E0', '#E65100', '#FF3D00', '#FFC107', '#F44336', '#4CAF50', '#5C4A2E', '#FFF8E1']) {
            expect(recolorInlineValue(c) === null, c).toBe(mapValue(c) === null);
        }
        expect(recolorInlineValue('background:linear-gradient(135deg,#FF8C00,#FFa040); color:white'))
            .toBe('background:linear-gradient(135deg,var(--clinic-brand),color-mix(in srgb, var(--clinic-brand) 72%, #fff)); color:white');
    });

    it('recolors on clinic theme and restores when it goes away', () => {
        const src = read('js/clinic-link.js');
        expect(src).toContain('recolorInlineOranges(root, true);');
        expect(src).toContain('recolorInlineOranges(root, false);');
    });

    it('hides the profile jump bar once friends·invite is gone', () => {
        expect(read('styles-features.css')).toContain('html.clinic-branded #profile-jump { display: none !important; }');
    });
});

describe('control tower lists partner clinics (2026-11-18)', () => {
    const ADMIN = read('admin.html');
    it('shows each clinic with its QR link and a member count only', () => {
        expect(ADMIN).toContain('<div class="box" id="clinic-list-box">');
        expect(ADMIN).toContain("return `${location.origin}/app?clinic=${encodeURIComponent(id)}`;");
        expect(ADMIN).toContain("getCountFromServer(query(collection(db, 'users'), where('clinicId', '==', c.id)))");
        const fn = ADMIN.slice(ADMIN.indexOf('async function loadClinicList()'), ADMIN.indexOf('window.copyClinicLink'));
        // 회원 한 명을 가리키는 값(이름·이메일·uid)은 싣지 않는다
        expect(fn).not.toMatch(/displayName|email|getDocs\(query\(collection\(db, 'users'\)/);
        expect(fn).toContain('escapeHtml(c.name || c.id)');
        expect(ADMIN).toMatch(/window\.loadSignupCohort\(\);\s*loadClinicList\(\);/);
    });
});

describe('leaving the clinic, back to regular Habit School (2026-11-18)', () => {
    const AUTH = read('js/auth.js');
    const CORE = read('js/app-core.js');
    const fn = AUTH.slice(AUTH.indexOf('async function unlinkClinic('), AUTH.indexOf('window.unlinkClinic ='));

    it('asks first, then deletes both clinic fields together (what the rules allow)', () => {
        expect(fn.indexOf('window.confirm(message)')).toBeLessThan(fn.indexOf('setDoc('));
        expect(fn).toContain('clinicId: deleteField(),\n            clinicLinkedAt: deleteField()');
        expect(fn).toContain('renderClinicBanner(null);');
        expect(fn).toContain("console.error('[clinic] 병원 연결 끊기 실패:'");
    });

    it('is on the clinic intro page and behind the Profile 「기본형」 button', () => {
        expect(read('index.html')).toContain('onclick="unlinkClinic()" data-i18n="clinic.intro.unlink"');
        const sw = CORE.slice(CORE.indexOf('window.switchAppVersion = function'), CORE.indexOf('// 동의는 로그인 뒤에 계정 기준으로 받는다(#reconsent-modal)'));
        expect(sw).toMatch(/if \(version === 'ko' && window\.isClinicMember\?\.\(\)\) \{[\s\S]*window\.unlinkClinic\?\.\(\)[\s\S]*if \(left && version !== currentAppVersionKey\(\)\) window\.location\.assign\(target\);/);
    });
});
