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
    computeBadgeStats,
} = globalRewards;

const OVERSEAS = { coins: 5000, timeZone: 'America/Los_Angeles', locale: 'en' };
const deps = (fake) => ({ db: fake.db, FieldValue: FakeFieldValue, HttpsError: FakeHttpsError });

// 기록 n 일을 날짜를 이어서 만든다(연속). 식단·운동·마음 중 무엇을 했는지 고를 수 있다.
function seedLogs(uid, days, { diet = true, exercise = true, mind = true, start = '2026-01-01' } = {}) {
    const docs = {};
    const base = Date.parse(`${start}T00:00:00Z`);
    for (let i = 0; i < days; i += 1) {
        const date = new Date(base + i * 86400000).toISOString().slice(0, 10);
        docs[`daily_logs/${uid}_${date}`] = {
            userId: uid,
            date,
            awardedPoints: { dietPoints: diet ? 10 : 0, exercisePoints: exercise ? 10 : 0, mindPoints: mind ? 5 : 0 },
        };
    }
    return docs;
}
// 모든 배지의 조건(기록 300일·30일 연속·각 100일)을 넘는 회원
const VETERAN_LOGS = seedLogs('u1', 300);

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
    it('6종(세계 회원은 뺐다), 아이디가 겹치지 않고, 가격은 양의 정수, 이름은 한국어·영어 둘 다', () => {
        expect(GLOBAL_BADGES.map((badge) => badge.id)).toEqual(['sprout', 'flame', 'plate', 'mover', 'sleeper', 'legend']);
        for (const badge of GLOBAL_BADGES) {
            expect(badge.id).toMatch(/^[a-z][a-z0-9-]*$/);
            expect(Number.isInteger(badge.pointCost) && badge.pointCost > 0).toBe(true);
            expect(badge.name.ko && badge.name.en && badge.desc.ko && badge.desc.en).toBeTruthy();
        }
        expect(GLOBAL_BADGES.map((badge) => badge.pointCost)).toEqual([300, 2000, 3000, 3000, 3000, 10000]);
    });

    it('🌙 이름은 "좋은 잠과 마음"', () => {
        expect(GLOBAL_BADGES.find((badge) => badge.id === 'sleeper').name.ko).toBe('좋은 잠과 마음');
    });

    it('배지마다 활동 기준이 있다(대표 결정 표 그대로)', () => {
        expect(Object.fromEntries(GLOBAL_BADGES.map((badge) => [badge.id, badge.requirement]))).toEqual({
            sprout: { metric: 'activeDays', target: 7 },
            flame: { metric: 'bestStreak', target: 30 },
            plate: { metric: 'dietDays', target: 100 },
            mover: { metric: 'exerciseDays', target: 100 },
            sleeper: { metric: 'mindDays', target: 100 },
            legend: { metric: 'activeDays', target: 300 },
        });
    });

    it('바꿀 수 없다', () => {
        expect(Object.isFrozen(GLOBAL_BADGES)).toBe(true);
        expect(Object.isFrozen(GLOBAL_BADGES[0])).toBe(true);
    });
});

describe('활동 통계', () => {
    it('포인트를 받은 날만 센다 — 기록한 날·가장 긴 연속·식단·운동·마음 일수', () => {
        const logs = [
            ...Object.values(seedLogs('u1', 5, { start: '2026-03-01' })),
            ...Object.values(seedLogs('u1', 3, { start: '2026-03-10', exercise: false, mind: false })),
            { userId: 'u1', date: '2026-03-20', awardedPoints: {} },
            { userId: 'u1', date: 'bad-date', awardedPoints: { dietPoints: 10 } },
        ];
        expect(computeBadgeStats(logs)).toEqual({
            activeDays: 8, bestStreak: 5, dietDays: 8, exerciseDays: 5, mindDays: 5,
        });
    });

    it('달이 바뀌어도 이어진 날은 연속으로 센다', () => {
        const logs = Object.values(seedLogs('u1', 40, { start: '2026-01-15' }));
        expect(computeBadgeStats(logs).bestStreak).toBe(40);
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
    it('국내 회원도 산다 — 기록에 국내/해외가 남는다', async () => {
        const fake = createFakeFirestore({ 'users/u1': { coins: 500 }, ...seedLogs('u1', 7) });
        const result = await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'sprout' });
        expect(result).toMatchObject({ purchased: true, coins: 200 });
        expect(fake.read('users/u1').coins).toBe(200);
        expect(fake.read('global_badge_purchases/u1_sprout')).toMatchObject({ overseas: false, timeZone: 'Asia/Seoul' });
    });

    it('포인트를 빼고 배지를 넣고 기록을 남긴다', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS, ...VETERAN_LOGS });
        const result = await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'flame' });
        expect(result).toEqual({ purchased: true, badgeId: 'flame', pointCost: 2000, coins: 3000 });
        const user = fake.read('users/u1');
        expect(user.coins).toBe(3000);
        expect(user.globalBadges.flame.pointCost).toBe(2000);
        expect(user.globalBadges.flame.purchasedAt).toBeInstanceOf(Date);
        expect(fake.read('global_badge_purchases/u1_flame')).toMatchObject({ uid: 'u1', badgeId: 'flame', pointCost: 2000 });
    });

    it('같은 배지는 두 번 사지지 않고, 두 번째에는 포인트를 빼지 않는다', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS, ...VETERAN_LOGS });
        await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'flame' });
        const second = await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'flame' });
        expect(second).toEqual({ purchased: false, alreadyOwned: true, badgeId: 'flame', pointCost: 2000, coins: 3000 });
        expect(fake.read('users/u1').coins).toBe(3000);
    });

    it('다른 배지는 따로 산다 — 이미 산 배지를 지우지 않는다', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS, ...VETERAN_LOGS });
        await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'sprout' });
        await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'plate' });
        expect(Object.keys(fake.read('users/u1').globalBadges).sort()).toEqual(['plate', 'sprout']);
        expect(fake.read('users/u1').coins).toBe(1700);
    });

    it('포인트가 모자라면 거절하고 아무것도 쓰지 않는다', async () => {
        const fake = createFakeFirestore({ 'users/u1': { ...OVERSEAS, coins: 999 }, ...VETERAN_LOGS });
        await expect(purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'flame' }))
            .rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'insufficient-points' } });
        expect(fake.read('users/u1').coins).toBe(999);
        expect(fake.read('global_badge_purchases/u1_flame')).toBeUndefined();
    });

    it('없는 배지는 거절(빠진 세계 회원 포함)', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS, ...VETERAN_LOGS });
        for (const badgeId of ['gold-bar', '__proto__', 'globe']) {
            await expect(purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId }))
                .rejects.toMatchObject({ code: 'invalid-argument' });
        }
    });

    it('사용자 문서가 없으면 거절', async () => {
        const fake = createFakeFirestore(seedLogs('u1', 7));
        await expect(purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'sprout' }))
            .rejects.toMatchObject({ code: 'not-found' });
    });

    it('포인트 값이 숫자가 아니어도 음수로 만들지 않는다', async () => {
        const fake = createFakeFirestore({ 'users/u1': { ...OVERSEAS, coins: 'abc' }, ...seedLogs('u1', 7) });
        await expect(purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'sprout' }))
            .rejects.toMatchObject({ details: { reason: 'insufficient-points' } });
    });
});

describe('활동 기준', () => {
    it('기준을 못 넘으면 포인트가 있어도 못 산다 — 지금 몇 일인지 알려 준다', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS, ...seedLogs('u1', 37, { exercise: false, mind: false }) });
        await expect(purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'plate' }))
            .rejects.toMatchObject({
                code: 'failed-precondition',
                details: { reason: 'requirement-not-met', metric: 'dietDays', target: 100, current: 37 },
            });
        expect(fake.read('users/u1').coins).toBe(5000);
        expect(fake.read('users/u1').globalBadges).toBeUndefined();
    });

    it('30일 연속은 한 번이라도 해냈으면 된다(지금은 끊겼어도)', async () => {
        const fake = createFakeFirestore({
            'users/u1': OVERSEAS,
            ...seedLogs('u1', 30, { start: '2026-01-01' }),
            ...seedLogs('u1', 2, { start: '2026-03-01' }),
        });
        const result = await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'flame' });
        expect(result.purchased).toBe(true);
    });

    it('29일 연속이면 아직 안 된다', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS, ...seedLogs('u1', 29) });
        await expect(purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'flame' }))
            .rejects.toMatchObject({ details: { reason: 'requirement-not-met', current: 29, target: 30 } });
    });

    it('이미 가진 배지는 다시 사라고 하지 않는다(기준을 다시 따지지 않음)', async () => {
        const fake = createFakeFirestore({ 'users/u1': { ...OVERSEAS, globalBadges: { legend: {} } } });
        const second = await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'legend' });
        expect(second).toMatchObject({ purchased: false, alreadyOwned: true });
    });

    it('스냅샷이 배지마다 기준·지금 값·열렸는지 준다', async () => {
        const fake = createFakeFirestore(seedLogs('u1', 37, { exercise: false, mind: false }));
        const snapshot = await buildGlobalRewardSnapshot({ db: fake.db, uid: 'u1', userData: { coins: 0 } });
        const plate = snapshot.badges.find((badge) => badge.id === 'plate');
        expect(plate.requirement).toEqual({ metric: 'dietDays', target: 100, current: 37, met: false });
        const sprout = snapshot.badges.find((badge) => badge.id === 'sprout');
        expect(sprout.requirement).toEqual({ metric: 'activeDays', target: 7, current: 37, met: true });
    });

    it('통계는 몇 시간 동안 사용자 문서에 담아 두고 다시 세지 않는다', async () => {
        const fake = createFakeFirestore(seedLogs('u1', 10));
        const now = Date.parse('2026-10-16T12:00:00Z');
        await buildGlobalRewardSnapshot({ db: fake.db, uid: 'u1', userData: { coins: 0 }, now });
        const cached = fake.read('users/u1').badgeStats;
        expect(cached).toMatchObject({ activeDays: 10, computedAt: now });

        fake.touched.clear();
        await buildGlobalRewardSnapshot({ db: fake.db, uid: 'u1', userData: { coins: 0, badgeStats: cached }, now: now + 60 * 60 * 1000 });
        expect(fake.touched.has('daily_logs')).toBe(false);

        await buildGlobalRewardSnapshot({ db: fake.db, uid: 'u1', userData: { coins: 0, badgeStats: cached }, now: now + 7 * 60 * 60 * 1000 });
        expect(fake.touched.has('daily_logs')).toBe(true);
    });

    it('살 때는 담아 둔 통계가 아니라 기록을 새로 센다', async () => {
        const fake = createFakeFirestore({
            'users/u1': { ...OVERSEAS, badgeStats: { activeDays: 999, bestStreak: 999, dietDays: 999, exerciseDays: 999, mindDays: 999, computedAt: Date.now() } },
            ...seedLogs('u1', 3),
        });
        await expect(purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'sprout' }))
            .rejects.toMatchObject({ details: { reason: 'requirement-not-met', current: 3 } });
    });

    it('화면: 잠긴 배지는 🔒 와 지금 진행을 보여 주고 구매 버튼을 잠근다', () => {
        const source = readRepoFile('js/global-rewards.js');
        expect(source).toContain('🔒');
        expect(source).toContain('requirement.met');
        expect(source).toContain('describeBadgeRequirement(');
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
    it('몇 명이 원하는지만 말한다', () => {
        // 기준(30명)은 회원 화면에 말하지 않는다 — 관제탑에만 보인다.
        expect(describeVoteProgress({ total: 12, threshold: 30 }, false)).toBe('12명이 원해요');
        expect(describeVoteProgress({ total: 12, threshold: 30 }, true)).toBe('12 members want this');
        expect(describeVoteProgress({ total: 31, threshold: 30 }, false)).toBe('31명이 원해요');
        expect(readRepoFile('js/global-rewards-core.js')).not.toContain('모이면 준비를 시작해요');
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
            'global_badge_purchases/a_plate': { uid: 'a', badgeId: 'plate', pointCost: 3000 },
        });
        const summary = await buildAdminGlobalRewardSummary({ db: fake.db });
        expect(summary).toEqual({
            threshold: GLOBAL_GIFT_CARD_VOTE_THRESHOLD,
            votes: { total: 3, remaining: GLOBAL_GIFT_CARD_VOTE_THRESHOLD - 3, byCountry: { US: 2, GB: 1 } },
            overseasMembers: 2,
            badges: { purchases: 2, pointsSpent: 3300, byBadge: { sprout: 1, plate: 1 } },
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
        const fake = createFakeFirestore({ 'users/u1': { coins: 0, globalBadges: { plate: { pointCost: 3000 } } } });
        const result = await setDisplayBadge({ ...deps(fake), uid: 'u1', badgeId: 'plate' });
        expect(result).toEqual({ displayBadge: 'plate', displayBadgeEmoji: '🥗' });
        expect(fake.read('users/u1')).toMatchObject({ displayBadge: 'plate', displayBadgeEmoji: '🥗' });
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
        const fake = createFakeFirestore({ 'users/u1': { coins: 2000 }, ...seedLogs('u1', 7) });
        await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'sprout' });
        expect(fake.read('users/u1')).toMatchObject({ displayBadge: 'sprout', displayBadgeEmoji: '🌱' });
    });

    it('이미 대표 배지가 있으면 새로 사도 바꾸지 않는다', async () => {
        const fake = createFakeFirestore({ 'users/u1': { coins: 5000, globalBadges: { sprout: {} }, displayBadge: 'sprout', displayBadgeEmoji: '🌱' }, ...VETERAN_LOGS });
        await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'plate' });
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
        expect(holders).toEqual({ sprout: 2, flame: 0, plate: 0, mover: 0, sleeper: 0, legend: 1 });
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

describe('리뷰에서 고친 것', () => {
    it('기록 400개 밖의 오래된 30일 연속도 마일스톤으로 인정한다', async () => {
        const fake = createFakeFirestore({
            'users/u1': { ...OVERSEAS, milestones: { streak30: { achieved: true } } },
            ...seedLogs('u1', 3),
        });
        const result = await purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'flame' });
        expect(result.purchased).toBe(true);
    });

    it('마일스톤이 없으면 그대로 기록으로만 센다', async () => {
        const fake = createFakeFirestore({ 'users/u1': OVERSEAS, ...seedLogs('u1', 3) });
        await expect(purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'flame' }))
            .rejects.toMatchObject({ details: { reason: 'requirement-not-met', current: 3 } });
    });

    it('배지를 사고 바꾸는 함수는 120초까지 일한다(지난 갤러리 글을 맞추느라)', () => {
        const runtime = readRepoFile('functions/runtime.js');
        for (const name of ['purchaseGlobalBadge', 'setDisplayBadge']) {
            const block = runtime.slice(runtime.indexOf(`exports.${name} = onCall(`));
            expect(block.slice(0, 300)).toContain('timeoutSeconds: 120');
        }
    });
});
