import { describe, expect, it, vi } from 'vitest';
import rewardMarketModule from '../functions/reward-market.js';
import { EN_MESSAGES } from '../js/i18n-en.js';
import { KO_MESSAGES } from '../js/i18n-ko.js';
import { readRawRepoFile } from './source-helpers.js';

// 해외 3단계 E6-3 (2026-10-27): 마켓 교환 불가 사유와 챌린지 결산 글을 회원 언어로.
// - 교환 불가 사유는 서버가 한국어로 만든다 → 그 옆에 blockedReasonI18n: { en } 을 싣는다.
// - 결산은 서버가 결과 이름표(outcome)만 보내는데, 화면이 한국어 문장을 박아 두어 영어 앱에도 한국어가 나갔다.
const { __test } = rewardMarketModule;
const HANGUL = /[가-힣]/;
const MARKET = readRawRepoFile('functions/reward-market.js');
const APP = readRawRepoFile('js/app-core.js');

describe('마켓 교환 불가 사유에 영어가 실린다', () => {
    const limits = { daily: { remainingPoints: 0 }, weekly: { remainingPoints: 0 }, monthly: { remainingPoints: 0 } };

    it('서버가 만드는 사유 문장마다 영어가 있다', () => {
        const texts = [
            ...[...MARKET.matchAll(/blockedReasons\.push\("([^"]+)"\)/g)].map((m) => m[1]),
            ...[...MARKET.matchAll(/blockedReason = (?:config\.providerReadyMessage \|\| )?"([^"]+)"/g)].map((m) => m[1]),
        ];
        expect(texts.length).toBeGreaterThanOrEqual(8);
        for (const text of texts) {
            const localized = __test.buildCatalogAvailability({ available: true }, { issuanceEnabled: false, blockedReason: text, limits: {} }).blockedReasonI18n;
            expect(localized?.en, text).toBeTruthy();
            expect(HANGUL.test(localized.en), text).toBe(false);
        }
    });

    it('교환할 수 없는 상품에 한국어 사유와 영어가 함께 간다', () => {
        const item = __test.buildCatalogAvailability({ sku: 'x', pointCost: 2000, available: true }, { issuanceEnabled: true, limits });
        expect(item.redeemable).toBe(false);
        expect(item.blockedReason).toBe('오늘 교환 한도를 모두 사용했어요.');
        expect(item.blockedReasonI18n).toEqual({ en: "Today's redemption limit has been used up." });
    });

    it('교환할 수 있으면 사유도 영어도 없다', () => {
        const open = { daily: { remainingPoints: 9999 }, weekly: { remainingPoints: 9999 }, monthly: { remainingPoints: 9999 } };
        const item = __test.buildCatalogAvailability({ sku: 'x', pointCost: 2000, available: true }, { issuanceEnabled: true, limits: open });
        expect(item.redeemable).toBe(true);
        expect(item.blockedReason).toBe('');
        expect(item.blockedReasonI18n).toBeNull();
    });

    it('연동 설정 이름 같은 운영 글은 회원 영어로 바꾼다', () => {
        const item = __test.buildCatalogAvailability({ available: true }, { issuanceEnabled: false, blockedReason: 'Giftishow 연동 설정이 비어 있어요: GIFTISHOW_AUTH_CODE', limits: {} });
        expect(item.blockedReasonI18n).toEqual({ en: "Coupon issuing isn't set up yet." });
    });

    it('화면 네 곳이 사유를 언어로 골라 쓴다', () => {
        const market = readRawRepoFile('js/reward-market.js');
        expect(market.match(/localizedServerText\(item\.blockedReason, item\.blockedReasonI18n, ''\)/g)).toHaveLength(2);
        expect(market).toContain("localizedServerText(latestItem.blockedReason, latestItem.blockedReasonI18n, t('market.cannotTrade'))");
        expect(market).toContain("localizedServerText(item.blockedReason, item.blockedReasonI18n, t('market.cannotTrade'))");
        expect(market).not.toMatch(/item\.blockedReason \|\|/);
    });
});

describe('화면 도우미 localizedServerText', async () => {
    vi.stubGlobal('window', { location: { pathname: '/en', search: '' }, localStorage: { getItem: () => null, setItem() {} } });
    const i18n = await import('../js/i18n.js');

    it('영어 화면: { en } → 한글 없는 서버 글 → 기본 문장', () => {
        expect(i18n.getLocale()).toBe('en');
        expect(i18n.localizedServerText('오늘 교환 한도를 모두 사용했어요.', { en: 'Limit used up.' }, 'x')).toBe('Limit used up.');
        expect(i18n.localizedServerText('처음 보는 사유', null, 'fallback')).toBe('fallback');
        expect(i18n.localizedServerText('Sold out', null, 'fallback')).toBe('Sold out');
        expect(i18n.localizedServerText('', null, 'fallback')).toBe('fallback');
    });

    it('한국어 화면은 서버 글 그대로 (예전과 같다)', () => {
        const fn = readRawRepoFile('js/i18n.js').split("export function localizedServerText(text, localized = null, fallback = '') {")[1].split('\n}\n')[0];
        expect(fn).toContain("if (locale === 'ko') return original || fallback;");
    });
});

describe('챌린지 결산·친구 알림 글은 사전에서', () => {
    const block = APP.slice(APP.indexOf('async function checkChallengeNotifications(uid) {'), APP.indexOf('_appBootReady = true;'));

    it('알림 토스트에 박힌 한국어가 없다', () => {
        const lines = block.split('\n').filter((line) => !/^\s*\/\//.test(line) && !line.includes('console.')).filter((line) => HANGUL.test(line));
        expect(lines).toEqual([]);
    });

    it('결과 이름표마다 두 언어 글이 있고, 한국어는 예전 그대로다', () => {
        for (const outcome of ['success', 'win', 'loss', 'draw', 'void', 'missed', 'settled']) {
            expect(EN_MESSAGES[`notify.challenge.${outcome}`], outcome).toBeTruthy();
            expect(HANGUL.test(EN_MESSAGES[`notify.challenge.${outcome}`]), outcome).toBe(false);
            expect(KO_MESSAGES[`notify.challenge.${outcome}`], outcome).toBeTruthy();
        }
        expect(KO_MESSAGES['notify.challenge.win']).toBe('🏆 경쟁에서 승리! 스테이크와 보너스를 획득했어요');
        expect(KO_MESSAGES['notify.friendRequest']).toBe('👥 {name}님이 친구 요청을 보냈어요.');
    });

    it('친구 요청 결과 토스트도 사전에서 온다', () => {
        for (const literal of ['이미 연결된 친구예요.', '이미 친구로 연결되어 있어요.', '친구 요청을 보냈어요. 상대가 앱에서 수락하면 연결됩니다.', '상대가 먼저 요청을 보냈어요. 앱에서 바로 응답해보세요.', '친구 요청을 보냈어요. 앱에서 수락을 기다려주세요.']) {
            expect(APP, literal).not.toContain(`showToast('${literal}')`);
        }
    });
});
