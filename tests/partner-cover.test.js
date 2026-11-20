// 런비커스 전용 앱 커버 (tasks/2026-11-20_런비커스_전용앱_커버.md)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
    RUNBICKERS_COVER_GROUP_ID,
    PENDING_HABIT_GROUP_LINK_KEY,
    PARTNER_COVER_HIDDEN_TABS,
    shouldStartRunbickersCover,
    resolvePartnerCoverState,
    canReleasePartnerCover,
    applyPartnerCover,
    isTabHiddenByPartnerCover,
    getActivePartnerCover,
    isRunbickersSpecialInvite,
    PARTNER_COVER_MAX_ACCOUNT_AGE_MS,
    RUNBICKERS_INVITE_CODE
} from '../js/partner-cover.js';

const require = createRequire(import.meta.url);
const server = require('../functions/partner-cover.js');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const runtime = read('functions/runtime.js');
const appCore = read('js/app-core.js');
const auth = read('js/auth.js');
const indexHtml = read('index.html');
const css = read('styles-features.css');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-20T03:00:00Z');

function fakeRoot() {
    const classes = new Set();
    return {
        documentElement: {
            classList: {
                add: (...c) => c.forEach((x) => classes.add(x)),
                remove: (...c) => c.forEach((x) => classes.delete(x)),
                contains: (c) => classes.has(c)
            }
        },
        querySelector: () => null,
        classes
    };
}

describe('화면 쪽 판단', () => {
    it('새 가입 + 런비커스 모임 링크일 때만 커버를 켠다', () => {
        expect(shouldStartRunbickersCover({ isNewUser: true, pendingGroupId: RUNBICKERS_COVER_GROUP_ID })).toBe(true);
        expect(shouldStartRunbickersCover({ isNewUser: false, pendingGroupId: RUNBICKERS_COVER_GROUP_ID })).toBe(false);
        expect(shouldStartRunbickersCover({ isNewUser: true, pendingGroupId: 'exercise-walking-10000' })).toBe(false);
        expect(shouldStartRunbickersCover({ isNewUser: true, pendingGroupId: '' })).toBe(false);
        expect(shouldStartRunbickersCover({
            isNewUser: true, pendingGroupId: RUNBICKERS_COVER_GROUP_ID, userData: { partnerCover: { id: 'runbickers' } }
        })).toBe(false);
    });

    it('회원 문서로 커버 상태를 정한다', () => {
        expect(resolvePartnerCoverState({})).toBe('none');
        expect(resolvePartnerCoverState({ partnerCover: { id: 'other', status: 'active' } })).toBe('none');
        expect(resolvePartnerCoverState({ partnerCover: { id: 'runbickers', status: 'active' } })).toBe('active');
        expect(resolvePartnerCoverState({ partnerCover: { id: 'runbickers', status: 'active', completedAt: 1 } })).toBe('ask');
        expect(resolvePartnerCoverState({ partnerCover: { id: 'runbickers', status: 'active', completedAt: 1, keptAt: 2 } })).toBe('active');
        expect(resolvePartnerCoverState({ partnerCover: { id: 'runbickers', status: 'released', completedAt: 1 } })).toBe('none');
    });

    it('완주해야 전체 앱으로 바꿀 수 있다', () => {
        expect(canReleasePartnerCover({ partnerCover: { id: 'runbickers', status: 'active' } })).toBe(false);
        expect(canReleasePartnerCover({ partnerCover: { id: 'runbickers', status: 'active', completedAt: 1 } })).toBe(true);
    });

    it('커버는 식단·마음·자산 탭을 감추고, 끄면 되돌린다', () => {
        const root = fakeRoot();
        expect(PARTNER_COVER_HIDDEN_TABS).toEqual(['diet', 'sleep', 'assets']);
        expect(isTabHiddenByPartnerCover('diet', root)).toBe(false);
        expect(applyPartnerCover('runbickers', root)).toBe(true);
        expect(getActivePartnerCover()).toBe('runbickers');
        expect(root.classes.has('partner-cover') && root.classes.has('partner-runbickers')).toBe(true);
        for (const tab of ['diet', 'sleep', 'assets']) expect(isTabHiddenByPartnerCover(tab, root)).toBe(true);
        for (const tab of ['dashboard', 'exercise', 'gallery', 'profile']) expect(isTabHiddenByPartnerCover(tab, root)).toBe(false);
        applyPartnerCover('', root);
        expect(root.classes.size).toBe(0);
        expect(getActivePartnerCover()).toBe('');
    });

    it('소모임 링크 기억 칸 이름이 app-core 와 같다', () => {
        expect(appCore).toContain(`const PENDING_HABIT_GROUP_LINK_KEY = '${PENDING_HABIT_GROUP_LINK_KEY}';`);
    });
});

describe('서버 판단', () => {
    const base = { partnerId: 'runbickers', groupId: 'exercise-runbickers', nowMs: NOW };

    it('새 계정(3일 안)·첫 4주·커버 없음일 때만 커버와 면제', () => {
        expect(server.shouldStartPartnerCover({ ...base, accountCreatedMs: NOW - 60 * 1000 })).toBe(true);
        expect(server.shouldStartPartnerCover({ ...base, accountCreatedMs: NOW - 2.9 * DAY })).toBe(true);
        expect(server.shouldStartPartnerCover({ ...base, accountCreatedMs: NOW - 3.1 * DAY })).toBe(false);
        expect(server.shouldStartPartnerCover({ ...base, accountCreatedMs: NaN })).toBe(false);
        expect(server.shouldStartPartnerCover({ ...base, accountCreatedMs: NOW, hasPreviousProgress: true })).toBe(false);
        expect(server.shouldStartPartnerCover({ ...base, accountCreatedMs: NOW, existingCover: { id: 'runbickers' } })).toBe(false);
        expect(server.shouldStartPartnerCover({ ...base, groupId: 'exercise-walking-10000', accountCreatedMs: NOW })).toBe(false);
        expect(server.shouldStartPartnerCover({ ...base, partnerId: 'nope', accountCreatedMs: NOW })).toBe(false);
    });

    it('완주 표시는 켜진 커버의 그 모임에서 한 번만', () => {
        const cover = { id: 'runbickers', status: 'active' };
        expect(server.shouldMarkPartnerCoverCompleted(cover, 'exercise-runbickers')).toBe(true);
        expect(server.shouldMarkPartnerCoverCompleted(cover, 'exercise-walking-10000')).toBe(false);
        expect(server.shouldMarkPartnerCoverCompleted({ ...cover, completedAt: 1 }, 'exercise-runbickers')).toBe(false);
        expect(server.shouldMarkPartnerCoverCompleted({ ...cover, status: 'released' }, 'exercise-runbickers')).toBe(false);
        expect(server.shouldMarkPartnerCoverCompleted(null, 'exercise-runbickers')).toBe(false);
    });

    it('전체 앱으로 바꾸기는 완주 뒤에만', () => {
        const cover = { id: 'runbickers', status: 'active' };
        expect(server.resolvePartnerCoverDecision(cover, 'release')).toBe('not_completed');
        // 모임을 나갔으면 완주 전이라도 풀린다(갇히지 않게)
        expect(server.resolvePartnerCoverDecision(cover, 'release', { inGroup: false })).toBe('release');
        expect(server.resolvePartnerCoverDecision({ ...cover, completedAt: 1 }, 'release')).toBe('release');
        expect(server.resolvePartnerCoverDecision(cover, 'keep')).toBe('keep');
        expect(server.resolvePartnerCoverDecision({ ...cover, status: 'released' }, 'release')).toBe('noop');
        expect(server.resolvePartnerCoverDecision(null, 'release')).toBe('invalid');
        expect(server.resolvePartnerCoverDecision(cover, 'delete')).toBe('invalid');
    });

    it('화면과 서버의 모임 id 가 같다', () => {
        expect(server.PARTNER_COVERS.runbickers.groupId).toBe(RUNBICKERS_COVER_GROUP_ID);
    });
});

describe('연결 위치', () => {
    const join = runtime.split('exports.joinHabitGroup = onCall(')[1].split('exports.finishHabitGroup')[0];
    const trigger = runtime.split('exports.onHabitGroupCheckinWritten = onDocumentWritten(')[1].slice(0, 9000);

    it('joinHabitGroup: 커버면 참가비를 받지 않고 partnerCover 를 쓴다', () => {
        expect(join).toContain('shouldStartPartnerCover({');
        expect(join).toContain('!hasPaidEntryFee && !startsPartnerCover');
        expect(join).toContain('"partner_cover_waived"');
        expect(join).toMatch(/partnerCover: \{\s*id: partnerCoverId,/);
    });

    it('보상 때 완주를 적는다', () => {
        expect(trigger).toContain('tx.get(userRef)');
        expect(trigger).toContain('shouldMarkPartnerCoverCompleted(partnerCover, target.groupId)');
    });

    it('decidePartnerCover 콜러블이 있고 runtime 에서 내보낸다', () => {
        expect(runtime).toContain('exports.decidePartnerCover = onCall(');
        expect(runtime).toContain('resolvePartnerCoverDecision(cover, request.data?.choice, { inGroup })');
    });

    it('partnerCover 는 회원이 직접 쓰지 못한다(규칙 화이트리스트에 없다)', () => {
        expect(read('firestore.rules')).not.toContain('partnerCover');
    });

    it('auth.js: 로그인 뒤 커버를 처리하고, 로그아웃하면 끈다', () => {
        expect(auth).toContain('handlePartnerCoverAfterAuth(user, ud, { isNewUser })');
        expect(auth).toMatch(/showClinicLoginBrand\(\);\s*applyPartnerCover\(''\);/);
        // 실패를 삼키지 않는다
        expect(auth).toContain("console.error('[partnerCover] 런비커스 모임 가입 실패:'");
    });

    it('openTab 이 감춘 탭을 운동 탭으로 돌린다', () => {
        expect(appCore).toContain('if (isTabHiddenByPartnerCover(resolvedTabName)) resolvedTabName = PARTNER_COVER_FALLBACK_TAB;');
    });

    it('화면: 달리기 가입 안내, 완주 뒤 묻는 창, 머리글 표시, 탭 감춤', () => {
        expect(indexHtml).toContain('id="ob-step-runbickers"');
        expect(indexHtml).toContain("onclick=\"decidePartnerCover('release')\"");
        expect(indexHtml).toContain("onclick=\"decidePartnerCover('keep')\"");
        expect(indexHtml).toContain('id="partner-cover-badge"');
        expect(indexHtml).toContain('src="assets/partners/runbickers-wordmark-dark.png"');
        expect(indexHtml).toContain('src="assets/partners/runbickers-logo.png"');
        expect(css).toContain(`html.partner-cover .tab-btn[onclick="openTab('diet')"]`);
        expect(css).toContain(`html.partner-cover .tab-btn[onclick="openTab('sleep')"]`);
        expect(css).toContain(`html.partner-cover .tab-btn[onclick="openTab('assets')"]`);
        expect(css).toContain('html.partner-cover #ob-step-1 { display: none !important; }');
    });
});

describe('런비커스 특별 초대 (2026-11-20 대표)', () => {
    const i18nKo = read('js/i18n-ko.js');

    it('링크로 온 3일 안의 계정만 0P 특별 초대를 본다', () => {
        const base = { inviteSeen: true, accountCreatedMs: NOW - DAY, now: NOW };
        expect(isRunbickersSpecialInvite(base)).toBe(true);
        expect(isRunbickersSpecialInvite({ ...base, inviteSeen: false })).toBe(false);
        expect(isRunbickersSpecialInvite({ ...base, accountCreatedMs: NOW - 4 * DAY })).toBe(false);
        expect(isRunbickersSpecialInvite({ ...base, userData: { partnerCover: { id: 'runbickers' } } })).toBe(false);
        expect(isRunbickersSpecialInvite({ ...base, accountCreatedMs: NaN })).toBe(false);
    });

    it('화면과 서버의 3일이 같다', () => {
        expect(PARTNER_COVER_MAX_ACCOUNT_AGE_MS).toBe(server.PARTNER_COVER_MAX_ACCOUNT_AGE_MS);
    });

    it('롤로님 초대 코드를 기본으로 넣는다', () => {
        expect(RUNBICKERS_INVITE_CODE).toBe('7E8HF9');
        expect(appCore).toContain('buildHabitGroupInviteCodeHtml(group.id === RUNBICKERS_COVER_GROUP_ID ? RUNBICKERS_INVITE_CODE');
        expect(auth).toContain("httpsCallable(functions, 'processReferralSignup')({ code: RUNBICKERS_INVITE_CODE, source: 'habit_group' })");
    });

    it('0P 단추: 원래 참가비에 줄을 긋고, 서버는 면제 못 하면 받지 않고 거절한다', () => {
        expect(appCore).toContain('<s class="habit-group-cta-was">');
        expect(appCore).toContain("joinHabitGroup('${group.id}', { specialInvite: true })");
        const join = runtime.split('exports.joinHabitGroup = onCall(')[1].split('exports.finishHabitGroup')[0];
        expect(join).toMatch(/if \(partnerCoverId && shouldChargeEntryFee\) \{\s*throw new HttpsError/);
    });

    it('모임 설명에 속도 조건을 쓰지 않는다', () => {
        const line = i18nKo.split('\n').find((l) => l.includes("'habitGroup.runbickers.description'"));
        expect(line).not.toMatch(/12분|km/);
        expect(i18nKo).toContain("'habitGroup.specialInvite.badge'");
    });
});

describe('런비커스 앱 내 기록 (2026-11-20 스테이징 확인)', () => {
    it('자동 가입이 끝나면 소모임 카드를 다시 그린다', () => {
        expect(appCore).toMatch(/window\.refreshHabitGroupCardAfterJoin = function\(\) \{\s*invalidateHabitGroupCaches\(\);\s*revealHabitGroupCardForMember/);
        expect(auth).toMatch(/notePartnerCoverStarted\(RUNBICKERS_COVER_ID\);\s*window\.refreshHabitGroupCardAfterJoin\?\.\(\);/);
    });

    it('식단 방법 칸을 감춘다', () => {
        expect(css).toContain('html.partner-cover #dashboard-diet-program-summary { display: none !important; }');
    });
});
