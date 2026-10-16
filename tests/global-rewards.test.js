import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readRepoFile } from './source-helpers.js';
import { createFakeFirestore, FakeFieldValue, FakeHttpsError } from './fake-firestore.js';
import {
    isOverseasTimeZone,
    describeVoteProgress,
    normalizeVoteCountry,
} from '../js/global-rewards-core.js';

const require = createRequire(import.meta.url);
const globalRewards = require('../functions/global-rewards.js');
const {
    GLOBAL_BADGES,
    GLOBAL_GIFT_CARD_VOTE_THRESHOLD,
    GLOBAL_GIFT_CARD_VOTE_COUNTRIES,
    isOverseasMember,
    buildGlobalRewardSnapshot,
    purchaseGlobalBadge,
    voteGlobalGiftCard,
    buildAdminGlobalRewardSummary,
} = globalRewards;

const OVERSEAS = { coins: 5000, timeZone: 'America/Los_Angeles', locale: 'en' };
const deps = (fake) => ({ db: fake.db, FieldValue: FakeFieldValue, HttpsError: FakeHttpsError });

describe('해외 회원 판정', () => {
    it('서울이 아닌 정상 시간대면 해외', () => {
        for (const timeZone of ['America/Los_Angeles', 'Europe/London', 'Asia/Tokyo', 'UTC']) {
            expect(isOverseasMember({ timeZone })).toBe(true);
            expect(isOverseasTimeZone(timeZone)).toBe(true);
        }
    });

    it('사용자 문서가 없거나 이상해도 해외로 보지 않는다', () => {
        expect(isOverseasMember(null)).toBe(false);
        expect(isOverseasMember(undefined)).toBe(false);
        expect(isOverseasMember({ timeZone: 42 })).toBe(false);
        expect(isOverseasTimeZone(undefined)).toBe(false);
    });
});

describe('배지 목록', () => {
    it('7종, 아이디가 겹치지 않고, 가격은 양의 정수, 이름은 한국어·영어 둘 다', () => {
        expect(GLOBAL_BADGES).toHaveLength(7);
        expect(new Set(GLOBAL_BADGES.map((badge) => badge.id)).size).toBe(7);
        for (const badge of GLOBAL_BADGES) {
            expect(badge.id).toMatch(/^[a-z][a-z0-9-]*$/);
            expect(Number.isInteger(badge.pointCost) && badge.pointCost > 0).toBe(true);
            expect(badge.name.ko && badge.name.en && badge.desc.ko && badge.desc.en).toBeTruthy();
        }
        expect(GLOBAL_BADGES.map((badge) => badge.pointCost)).toEqual([300, 1000, 2000, 3000, 3000, 3000, 10000]);
    });

    it('바꿀 수 없다', () => {
        expect(Object.isFrozen(GLOBAL_BADGES)).toBe(true);
        expect(Object.isFrozen(GLOBAL_BADGES[0])).toBe(true);
    });
});

describe('스냅샷', () => {
    it('배지·보유 여부·포인트·투표 현황을 준다', async () => {
        const fake = createFakeFirestore({
            'global_giftcard_votes/other': { uid: 'other', country: 'GB' },
            'global_giftcard_votes/u1': { uid: 'u1', country: 'US' },
        });
        const snapshot = await buildGlobalRewardSnapshot({
            db: fake.db,
            uid: 'u1',
            userData: { ...OVERSEAS, globalBadges: { sprout: { pointCost: 300 } } },
        });
        expect(snapshot.overseas).toBe(true);
        expect(snapshot.coins).toBe(5000);
        expect(snapshot.badges.find((badge) => badge.id === 'sprout').owned).toBe(true);
        expect(snapshot.badges.filter((badge) => badge.owned)).toHaveLength(1);
        expect(snapshot.vote).toEqual({ voted: true, country: 'US', total: 2, threshold: GLOBAL_GIFT_CARD_VOTE_THRESHOLD });
    });
});

describe('배지 구매', () => {
    it('국내 회원도 산다(2026-10-16 대표 결정) — 기록에 국내/해외가 남는다', async () => {
        const fake = createFakeFirestore({ 'users/u1': { coins: 500 } });
        const result = await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'sprout' });
        expect(result).toMatchObject({ purchased: true, coins: 200 });
        expect(fake.read('users/u1').coins).toBe(200);
        expect(fake.read('global_badge_purchases/u1_sprout')).toMatchObject({ overseas: false, timeZone: 'Asia/Seoul' });
    });

    it('포인트를 빼고 배지를 넣고 기록을 남긴다', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS });
        const result = await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'globe' });
        expect(result).toEqual({ purchased: true, badgeId: 'globe', pointCost: 1000, coins: 4000 });
        const user = fake.read('users/u1');
        expect(user.coins).toBe(4000);
        expect(user.globalBadges.globe.pointCost).toBe(1000);
        expect(user.globalBadges.globe.purchasedAt).toBeInstanceOf(Date);
        expect(user.timeZone).toBe('America/Los_Angeles');
        const record = fake.read('global_badge_purchases/u1_globe');
        expect(record).toMatchObject({ uid: 'u1', badgeId: 'globe', pointCost: 1000, timeZone: 'America/Los_Angeles' });
    });

    it('같은 배지는 두 번 사지지 않고, 두 번째에는 포인트를 빼지 않는다', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS });
        await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'flame' });
        const second = await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'flame' });
        expect(second).toEqual({ purchased: false, alreadyOwned: true, badgeId: 'flame', pointCost: 2000, coins: 3000 });
        expect(fake.read('users/u1').coins).toBe(3000);
    });

    it('다른 배지는 따로 산다 — 이미 산 배지를 지우지 않는다', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS });
        await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'sprout' });
        await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'globe' });
        expect(Object.keys(fake.read('users/u1').globalBadges).sort()).toEqual(['globe', 'sprout']);
        expect(fake.read('users/u1').coins).toBe(3700);
    });

    it('포인트가 모자라면 거절하고 아무것도 쓰지 않는다', async () => {
        const fake = createFakeFirestore({ 'users/u1': { ...OVERSEAS, coins: 999 } });
        await expect(purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'globe' }))
            .rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'insufficient-points' } });
        expect(fake.read('users/u1').coins).toBe(999);
        expect(fake.paths()).toEqual(['users/u1']);
    });

    it('없는 배지는 거절', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS });
        await expect(purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'gold-bar' }))
            .rejects.toMatchObject({ code: 'invalid-argument' });
        await expect(purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: '__proto__' }))
            .rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('사용자 문서가 없으면 거절', async () => {
        const fake = createFakeFirestore();
        await expect(purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'sprout' }))
            .rejects.toMatchObject({ code: 'not-found' });
    });

    it('포인트 값이 숫자가 아니어도 음수로 만들지 않는다', async () => {
        const fake = createFakeFirestore({ 'users/u1': { ...OVERSEAS, coins: 'abc' } });
        await expect(purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'sprout' }))
            .rejects.toMatchObject({ details: { reason: 'insufficient-points' } });
    });
});

describe('기프트카드 투표', () => {
    it('한 사람 한 표, 나라를 바꿔도 한 표', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS });
        const first = await voteGlobalGiftCard({ ...deps(fake), uid: 'u1', country: 'US' });
        expect(first).toEqual({ voted: true, country: 'US', total: 1, threshold: GLOBAL_GIFT_CARD_VOTE_THRESHOLD });
        const createdAt = fake.read('global_giftcard_votes/u1').createdAt;

        fake.setNow(Date.parse('2026-10-17T12:00:00Z'));
        const changed = await voteGlobalGiftCard({ ...deps(fake), uid: 'u1', country: 'ca' });
        expect(changed).toMatchObject({ voted: true, country: 'CA', total: 1 });
        const vote = fake.read('global_giftcard_votes/u1');
        expect(vote.createdAt).toEqual(createdAt);
        expect(vote.updatedAt.getTime()).toBeGreaterThan(createdAt.getTime());
        expect(vote).toMatchObject({ uid: 'u1', country: 'CA', timeZone: 'America/Los_Angeles', locale: 'en' });
    });

    it('모르는 나라는 기타로', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS });
        const result = await voteGlobalGiftCard({ ...deps(fake), uid: 'u1', country: 'Atlantis' });
        expect(result.country).toBe('OTHER');
        expect(normalizeVoteCountry('Atlantis')).toBe('OTHER');
        expect(normalizeVoteCountry(' gb ')).toBe('GB');
    });

    it('취소하면 표가 빠진다', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS, 'global_giftcard_votes/x': { uid: 'x', country: 'JP' } });
        await voteGlobalGiftCard({ ...deps(fake), uid: 'u1', country: 'US' });
        const withdrawn = await voteGlobalGiftCard({ ...deps(fake), uid: 'u1', withdraw: true });
        expect(withdrawn).toEqual({ voted: false, country: '', total: 1, threshold: GLOBAL_GIFT_CARD_VOTE_THRESHOLD });
        expect(fake.read('global_giftcard_votes/u1')).toBeUndefined();
    });

    it('투표는 포인트를 건드리지 않는다', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS });
        await voteGlobalGiftCard({ ...deps(fake), uid: 'u1', country: 'US' });
        expect(fake.read('users/u1')).toEqual(OVERSEAS);
    });

    it('나라 목록과 화면 목록이 같다', () => {
        expect(GLOBAL_GIFT_CARD_VOTE_COUNTRIES).toEqual(['US', 'CA', 'GB', 'AU', 'JP', 'OTHER']);
        const coreSource = readRepoFile('js/global-rewards-core.js');
        for (const code of GLOBAL_GIFT_CARD_VOTE_COUNTRIES) expect(coreSource).toContain(`'${code}'`);
    });
});

describe('투표 진행 문구', () => {
    it('기준까지 남은 수를 알려 준다', () => {
        expect(describeVoteProgress({ total: 12, threshold: 30 }, false)).toBe('12명이 원해요 · 30명이 모이면 준비를 시작해요');
        expect(describeVoteProgress({ total: 12, threshold: 30 }, true)).toBe('12 members want this · we start building at 30');
        expect(describeVoteProgress({ total: 31, threshold: 30 }, false)).toBe('31명이 원해요 · 준비를 검토하고 있어요');
        expect(describeVoteProgress({ total: 31, threshold: 30 }, true)).toBe('31 members want this · we are reviewing it now');
    });
});

describe('관제탑 요약', () => {
    it('투표 수·나라별·남은 수, 해외 회원 수, 배지 판매를 센다', async () => {
        const fake = createFakeFirestore({
            'users/a': { timeZone: 'America/New_York' },
            'users/b': { timeZone: 'Europe/London' },
            'users/c': { timeZone: 'Asia/Seoul' },
            'users/d': {},
            'global_giftcard_votes/a': { uid: 'a', country: 'US' },
            'global_giftcard_votes/b': { uid: 'b', country: 'GB' },
            'global_giftcard_votes/e': { uid: 'e', country: 'US' },
            'global_badge_purchases/a_sprout': { uid: 'a', badgeId: 'sprout', pointCost: 300 },
            'global_badge_purchases/a_globe': { uid: 'a', badgeId: 'globe', pointCost: 1000 },
        });
        const summary = await buildAdminGlobalRewardSummary({ db: fake.db });
        expect(summary).toEqual({
            threshold: GLOBAL_GIFT_CARD_VOTE_THRESHOLD,
            votes: { total: 3, remaining: GLOBAL_GIFT_CARD_VOTE_THRESHOLD - 3, byCountry: { US: 2, GB: 1 } },
            overseasMembers: 2,
            badges: { purchases: 2, pointsSpent: 1300, byBadge: { sprout: 1, globe: 1 } },
        });
    });
});

describe('보안 — 배지와 투표는 서버만 쓴다', () => {
    const rules = readRepoFile('firestore.rules');

    it('회원이 직접 고칠 수 있는 사용자 필드에 globalBadges 가 없다', () => {
        expect(rules).not.toContain('globalBadges');
    });

    it('해외 컬렉션에 회원용 규칙을 따로 열지 않았다(기본 거부)', () => {
        expect(rules).not.toContain('global_badge_purchases');
        expect(rules).not.toContain('global_giftcard_votes');
        expect(rules).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
    });

    it('콜러블 네 개가 있고 관리자 요약은 관리자만', () => {
        const runtime = readRepoFile('functions/runtime.js');
        for (const name of ['getGlobalRewardSnapshot', 'purchaseGlobalBadge', 'voteGlobalGiftCard', 'getAdminGlobalRewardSummary']) {
            expect(runtime).toContain(`exports.${name} = onCall(`);
        }
        const adminBlock = runtime.slice(runtime.indexOf('exports.getAdminGlobalRewardSummary'));
        expect(adminBlock.slice(0, 400)).toContain('await assertAdminRequest(request)');
    });
});

describe('화면 — 브라우저 확인에서 잡은 것', () => {
    const source = readRepoFile('js/global-rewards.js');

    it('고른 나라를 화면을 다시 그리기 전에 읽는다(안 그러면 늘 첫 나라로 저장된다)', () => {
        const body = source.slice(source.indexOf('async function vote('));
        expect(body.indexOf("getElementById('global-reward-vote-country')"))
            .toBeLessThan(body.indexOf('runAction('));
    });

    it('배지를 산 뒤에는 카드 내용만 다시 받는다(시간대를 다시 따지다 카드가 사라지지 않게)', () => {
        const body = source.slice(source.indexOf('async function purchaseBadge('));
        expect(body.slice(0, 600)).toContain('await fetchAndRender();');
        expect(body.slice(0, 600)).not.toContain('loadGlobalRewards(');
    });

    it('해외 접속은 배지를 펼치고 해빛 마켓을 접는다, 국내는 반대', () => {
        expect(source).toContain("collapse = { key, badge: !overseas, market: overseas };");
        expect(source).toContain("marketCard.classList.toggle(COLLAPSED_CLASS, collapse.market);");
    });

    it('투표는 해외 접속 스냅샷에만 그린다', () => {
        expect(source).toContain("(snapshot.overseas && snapshot.vote ? renderVote(snapshot.vote) : '')");
    });

    it('카드 이름은 해빛 배지', () => {
        expect(source).toContain("copy('해빛 배지', 'Haebit Badges')");
        expect(source).not.toContain('해외 회원 보상');
    });
});

describe('화면 문구', () => {
    const source = readRepoFile('js/global-rewards.js');

    it('배지를 사면 포인트가 빠진다고 말한다(포인트가 "그대로 남는다" 고 하지 않는다)', () => {
        expect(source).toContain('배지 가격만큼 포인트가 빠져요');
        expect(source).not.toContain('그대로 남아요');
        expect(source).not.toContain('stay safe');
    });
});

describe('대표 배지 — 카톡 단톡방 챗봇 순위에서 이름 앞에 붙는다', () => {
    const { setDisplayBadge } = globalRewards;

    it('가진 배지만 대표로 달 수 있고, 챗봇이 쓸 이모지도 함께 남긴다', async () => {
        const fake = createFakeFirestore({ 'users/u1': { coins: 0, globalBadges: { globe: { pointCost: 1000 } } } });
        const result = await setDisplayBadge({ ...deps(fake), uid: 'u1', badgeId: 'globe' });
        expect(result).toEqual({ displayBadge: 'globe', displayBadgeEmoji: '🌍' });
        expect(fake.read('users/u1')).toMatchObject({ displayBadge: 'globe', displayBadgeEmoji: '🌍' });
    });

    it('안 가진 배지는 거절', async () => {
        const fake = createFakeFirestore({ 'users/u1': { coins: 0, globalBadges: { sprout: {} } } });
        await expect(setDisplayBadge({ ...deps(fake), uid: 'u1', badgeId: 'legend' }))
            .rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'not-owned' } });
        expect(fake.read('users/u1').displayBadge).toBeUndefined();
    });

    it('없는 배지 이름은 거절', async () => {
        const fake = createFakeFirestore({ 'users/u1': { globalBadges: { sprout: {} } } });
        await expect(setDisplayBadge({ ...deps(fake), uid: 'u1', badgeId: 'gold' }))
            .rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('빈 값이면 대표 배지를 뗀다', async () => {
        const fake = createFakeFirestore({ 'users/u1': { globalBadges: { sprout: {} }, displayBadge: 'sprout', displayBadgeEmoji: '🌱' } });
        const result = await setDisplayBadge({ ...deps(fake), uid: 'u1', badgeId: '' });
        expect(result).toEqual({ displayBadge: '', displayBadgeEmoji: '' });
        expect(fake.read('users/u1').displayBadge).toBeUndefined();
        expect(fake.read('users/u1').displayBadgeEmoji).toBeUndefined();
    });

    it('첫 배지를 사면 대표 배지로 바로 단다 — 사자마자 단톡방 순위에 보인다', async () => {
        const fake = createFakeFirestore({ 'users/u1': { coins: 2000 } });
        await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'sprout' });
        expect(fake.read('users/u1')).toMatchObject({ displayBadge: 'sprout', displayBadgeEmoji: '🌱' });
    });

    it('이미 대표 배지가 있으면 새로 사도 바꾸지 않는다', async () => {
        const fake = createFakeFirestore({ 'users/u1': { coins: 2000, globalBadges: { sprout: {} }, displayBadge: 'sprout', displayBadgeEmoji: '🌱' } });
        await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'globe' });
        expect(fake.read('users/u1')).toMatchObject({ displayBadge: 'sprout', displayBadgeEmoji: '🌱' });
    });

    it('스냅샷에 대표 배지와 배지마다 보유자 수가 나온다', async () => {
        const fake = createFakeFirestore({
            'global_badge_purchases/a_sprout': { uid: 'a', badgeId: 'sprout' },
            'global_badge_purchases/b_sprout': { uid: 'b', badgeId: 'sprout' },
            'global_badge_purchases/b_legend': { uid: 'b', badgeId: 'legend' },
        });
        const snapshot = await buildGlobalRewardSnapshot({
            db: fake.db, uid: 'u1', userData: { coins: 0, globalBadges: { sprout: {} }, displayBadge: 'sprout' },
        });
        expect(snapshot.displayBadge).toBe('sprout');
        const holders = Object.fromEntries(snapshot.badges.map((badge) => [badge.id, badge.holders]));
        expect(holders).toEqual({ sprout: 2, globe: 0, flame: 0, plate: 0, mover: 0, sleeper: 0, legend: 1 });
    });

    it('대표 배지를 이제 안 가지고 있으면 스냅샷은 빈 값으로 준다', async () => {
        const fake = createFakeFirestore();
        const snapshot = await buildGlobalRewardSnapshot({
            db: fake.db, uid: 'u1', userData: { globalBadges: {}, displayBadge: 'legend' },
        });
        expect(snapshot.displayBadge).toBe('');
    });

    it('회원이 대표 배지 필드를 직접 쓸 수 없다(규칙 화이트리스트에 없음)', () => {
        const rules = readRepoFile('firestore.rules');
        expect(rules).not.toContain('displayBadge');
    });

    it('콜러블 setDisplayBadge 가 있다', () => {
        expect(readRepoFile('functions/runtime.js')).toContain('exports.setDisplayBadge = onCall(');
    });

    it('화면: 가진 배지에 "대표로 달기", 대표 배지에는 표시, 배지마다 보유자 수', () => {
        const source = readRepoFile('js/global-rewards.js');
        expect(source).toContain("copy('대표로 달기', 'Show by my name')");
        expect(source).toContain("copy('대표 배지', 'Shown by my name')");
        expect(source).toContain("copy(`보유 ${holders}명`, `${holders} own this`)");
        expect(source).toContain("setDisplayBadgeFn");
    });
});
