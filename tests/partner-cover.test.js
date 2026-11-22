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

    it('기본 앱으로는 언제든 바꿀 수 있다 (2026-11-22 대표: 병원 앱처럼)', () => {
        const cover = { id: 'runbickers', status: 'active' };
        expect(server.resolvePartnerCoverDecision(cover, 'release')).toBe('release');
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
        expect(runtime).toContain('resolvePartnerCoverDecision(cover, request.data?.choice);');
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

describe('다시 열어도 런비커스 앱 (2026-11-20 대표: 업데이트 노트 → 프로필로 돌아가기 뒤 기본 앱)', async () => {
    const { rememberPartnerCover, readRememberedPartnerCover, PARTNER_COVER_MEMORY_KEY } = await import('../js/partner-cover.js');
    const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

    it('기기에 계정과 커버를 기억하고, 빈 값이면 지운다', () => {
        const s = memStore();
        rememberPartnerCover('uid1', 'runbickers', s);
        expect(readRememberedPartnerCover(s)).toEqual({ uid: 'uid1', id: 'runbickers' });
        rememberPartnerCover('uid1', '', s);
        expect(readRememberedPartnerCover(s)).toBe(null);
        rememberPartnerCover('uid1', 'nope', s);
        expect(readRememberedPartnerCover(s)).toBe(null);
    });

    it('머리 스크립트가 같은 칸을 읽어 첫 페인트 전에 커버를 입힌다', () => {
        expect(PARTNER_COVER_MEMORY_KEY).toBe('habitschoolPartnerCover');
        const head = indexHtml.slice(0, indexHtml.indexOf('</head>'));
        expect(head).toContain("localStorage.getItem('habitschoolPartnerCover')");
        expect(head).toContain("classList.add('partner-cover', 'partner-runbickers')");
    });

    it('회원 문서에 커버가 없어도 기억한 계정이면 서버에 다시 묻고, 못 닿으면 커버를 둔다', () => {
        expect(auth).toContain("if (state === 'none' && remembered?.uid === user.uid) {");
        expect(auth).toContain("await getDocFromServer(doc(db, 'users', user.uid))");
        expect(auth).toContain("console.warn('[partnerCover] 서버 확인 실패 — 기억한 커버를 유지:'");
    });

    it('로그아웃·전체 앱으로 바꾸기에서 기억을 지운다', () => {
        expect(auth).toMatch(/applyPartnerCover\(''\);\s*rememberPartnerCover\('', ''\);\s*_partnerCoverUserData = null;/);
        expect(auth).toMatch(/_partnerCoverUserData = null;\s*applyPartnerCover\(''\);\s*rememberPartnerCover\('', ''\);/);
    });

    it('내 기록 맨 위 런비커스 띠와 회색 탭', () => {
        expect(indexHtml).toContain('class="partner-cover-hero partner-cover-only"');
        expect(indexHtml).toContain('src="assets/partners/runbickers-runner.png"');
        expect(css).toContain('html.partner-cover .tab-menu { background-color: #363636;');
    });
});

describe('러닝 마일리지 (2026-11-21 대표)', async () => {
    const { sumDailyRunning, summarizeWeeklyRunning } = await import('../js/habit-groups.js');
    const run = (exerciseType, distanceKm, durationMinutes) => ({ imageUrl: 'x', aiAnalysis: { exerciseType, distanceKm, durationMinutes } });
    const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];

    it('AI 가 읽은 달리기는 모임 기준과 상관없이 모두 센다', () => {
        const log = { exercise: { cardioList: [run('러닝', 5.2, 31), run('러닝', 0.8, 6), run('걷기', 3, 40), run('running', 2, 15)] } };
        expect(sumDailyRunning(log)).toEqual({ km: 8, minutes: 52, runs: 3 });
    });

    it('거리·시간을 못 읽었거나 사람이 못 내는 속도는 뺀다', () => {
        const log = { exercise: { cardioList: [run('러닝', 0, 30), run('러닝', 10, 0), run('러닝', 10, 20)] } };
        expect(sumDailyRunning(log)).toEqual({ km: 0, minutes: 0, runs: 0 });
    });

    it('이번 주 거리·시간·달린 날', () => {
        const logs = [
            { date: '2026-11-17', exercise: { cardioList: [run('러닝', 5.25, 31)] } },
            { date: '2026-11-20', exercise: { cardioList: [run('조깅', 3.1, 20)] } }
        ];
        const s = summarizeWeeklyRunning(logs, { todayStr: '2026-11-21', weekStrs: week });
        expect(s.totalKm).toBe(8.4);
        expect(s.totalMinutes).toBe(51);
        expect(s.runDays).toBe(2);
        expect(s.days[1].km).toBe(5.3);
        expect(s.days[6].isFuture).toBe(true);
    });

    it('런비커스 앱이거나 달리기 모임 회원이면 이번 주 운동 대신 러닝 마일리지', () => {
        expect(appCore).toContain("if (globalThis.isPartnerCoverMember?.()) return true;");
        expect(appCore).toContain("item?.groupId === RUNBICKERS_COVER_GROUP_ID && item?.active !== false");
        expect(appCore).toContain('renderRunningMileageCard(summarizeWeeklyRunning(logs, { todayStr, weekStrs }))');
    });
});

describe('런비커스 단톡방 (2026-11-21 대표)', async () => {
    const { RUNBICKERS_CHAT_URL } = await import('../js/partner-cover.js');
    it('런비커스 앱의 단톡방 단추·QR 은 런비커스 단톡방으로', () => {
        expect(RUNBICKERS_CHAT_URL).toBe('https://open.kakao.com/o/gJi9sw4g');
        expect(appCore).toContain('if (window.isPartnerCoverMember?.()) return RUNBICKERS_CHAT_URL;');
        expect(appCore).toContain("window.isPartnerCoverMember?.() ? t('partnerCover.chat.button') : t('gallery.chat.button')");
        expect(appCore).toContain('text: window.isPartnerCoverMember?.() ? RUNBICKERS_CHAT_URL');
    });
});

describe('런비커스 안내 탭 (2026-11-22 대표)', () => {
    it('머리글 로고를 누르면 안내 탭이 열린다', () => {
        expect(indexHtml).toMatch(/id="partner-cover-badge"[^>]*onclick="openPartnerCoverIntro\(\)"/);
        expect(indexHtml).toContain('id="partner-intro"');
        expect(appCore).toContain('window.openPartnerCoverIntro = function()');
    });

    it('안내 탭: 진행, 단톡방, 친구에게 나누기, 언제든 기본 해빛스쿨로', () => {
        expect(indexHtml).toContain('id="partner-intro-progress"');
        expect(indexHtml).toContain('class="partner-intro__chat" onclick="openCommunityChat()"');
        expect(indexHtml).toContain('onclick="sharePartnerCoverIntro()"');
        expect(indexHtml).toContain('class="partner-intro__release" onclick="releasePartnerCover()"');
        expect(appCore).toContain("const RUNBICKERS_SHARE_PATH = '/?group=runbickers';");
    });

    it('기본 앱으로 바꿀 때 완주 여부를 묻지 않는다', () => {
        const fn = auth.slice(auth.indexOf('async function releasePartnerCover()'), auth.indexOf('window.decidePartnerCover ='));
        expect(fn).not.toContain('canReleasePartnerCover');
        expect(fn).toContain('달리기 모임은 그대로 이어져요');
    });
});

describe('친구에게 나누기 — 내 초대 코드와 공유 혜택 (2026-11-22 대표)', () => {
    it('나누기 링크에 내 초대 코드를 넣는다(/i/CODE?g=runbickers)', () => {
        expect(appCore).toContain('`${window.location.origin}/i/${code}?g=runbickers`');
        expect(appCore).toContain('const url = await buildRunbickersShareUrl();');
        expect(auth).toContain('_myReferralCode = normalizeInviteRefCode(ud.referralCode);');
        expect(runtime).toContain('const groupParam = groupCard ? `&group=${groupSlug}` : "";');
    });

    it('공유 혜택을 안내 탭에 보인다', () => {
        expect(indexHtml).toContain('class="partner-intro__share-benefit" data-i18n-html="partnerCover.intro.shareBenefit"');
        expect(indexHtml).toContain('나에게 최대 500P');
        expect(indexHtml).toContain('초대 선물 200P');
    });

    it('친구의 초대 링크로 온 새 회원에게는 롤로님 코드를 넣지 않는다', () => {
        expect(auth).toContain('const cameWithFriendInvite = !!readPendingInviteRef() || !!userData?.referredBy;');
        expect(auth).toContain('if (!cameWithFriendInvite) applyRunbickersInviteCode(user);');
    });

    it('카톡 미리보기 문구에 속도 조건이 없다', () => {
        const card = runtime.slice(runtime.indexOf('const INVITE_GROUP_CARDS'), runtime.indexOf('exports.inviteLinkPreview'));
        expect(card).not.toMatch(/12분|km/);
    });
});

describe('갤러리 「런비커스만」 (2026-11-22 대표, 병원은 하지 않음)', () => {
    const gallery = require('../functions/gallery-posts.js');
    const log = { userId: 'u1', userName: '러너', date: '2026-11-22', exercise: { cardioList: [] }, sleepAndMind: { gratitude: '오늘 5km 뛰었다' } };

    it('런비커스 앱이거나 런비커스 모임 회원이면 소속을 적는다', () => {
        expect(gallery.resolveGalleryCommunity({ partnerCover: { id: 'runbickers', status: 'active' } }, null)).toBe('runbickers');
        expect(gallery.resolveGalleryCommunity({ partnerCover: { id: 'runbickers', status: 'released' } }, null)).toBe('');
        expect(gallery.resolveGalleryCommunity({}, { active: true })).toBe('runbickers');
        expect(gallery.resolveGalleryCommunity({}, { active: false })).toBe('');
        expect(gallery.resolveGalleryCommunity({ clinicId: 'joseph' }, null)).toBe('');
    });

    it('글에 community 를 싣는다(없으면 칸이 없다)', () => {
        const withCommunity = gallery.buildGalleryPostFromDailyLog({ logId: 'u1_2026-11-22', dailyLog: log, community: 'runbickers' });
        expect(withCommunity.community).toBe('runbickers');
        const without = gallery.buildGalleryPostFromDailyLog({ logId: 'u1_2026-11-22', dailyLog: log });
        expect(without).not.toHaveProperty('community');
    });

    it('병원 소속은 갤러리 글에 싣지 않는다', () => {
        expect(read('functions/gallery-posts.js')).not.toMatch(/clinicId/);
    });

    it('화면: 런비커스 앱에서 식단·운동·마음 대신 「런비커스만」, 처음부터 눌림', () => {
        expect(indexHtml).toContain('id="gallery-community-chip" onclick="setGalleryFilter(\'community\', this)"');
        expect(css).toContain('html.partner-cover .partner-community-chip { display: inline-flex; }');
        expect(appCore).toContain("window.setGalleryFilter('community', chip, { auto: true });");
        expect(appCore).toContain("where('community', '==', GALLERY_COMMUNITY_ID)");
        expect(appCore).toContain("if (filter === 'community') return data?.community === GALLERY_COMMUNITY_ID");
    });
});

describe('갤러리 기본값·WEEKLY SPOTLIGHT (2026-11-22 대표)', () => {
    it('런비커스 앱인지는 <html> 표시로 보고, 커버가 켜질 때 갤러리 기본값을 다시 맞춘다', () => {
        const fn = appCore.slice(appCore.indexOf('function applyPartnerGalleryDefault()'), appCore.indexOf('window.applyPartnerGalleryDefault = applyPartnerGalleryDefault;'));
        expect(fn).toContain("document.documentElement.classList.contains('partner-cover')");
        expect(read('js/partner-cover.js')).toContain("globalThis.applyPartnerGalleryDefault?.()");
    });

    it('커버가 켜질 때 갤러리가 열려 있으면 기본값 함수를 부른다', () => {
        const root = fakeRoot();
        let called = 0;
        globalThis.applyPartnerGalleryDefault = () => { called += 1; };
        root.getElementById = (id) => (id === 'gallery' ? { classList: { contains: (c) => c === 'active' } } : null);
        applyPartnerCover('runbickers', root);
        expect(called).toBe(1);
        applyPartnerCover('', root);
        expect(called).toBe(2);
        delete globalThis.applyPartnerGalleryDefault;
    });

    it('WEEKLY SPOTLIGHT 를 감춘다', () => {
        expect(css).toContain('html.partner-cover #weekly-best-container { display: none !important; }');
    });
});
