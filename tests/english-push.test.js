import { describe, expect, it } from 'vitest';
import { readRawRepoFile } from './source-helpers.js';

// 해외 3단계 E6-1 (2026-10-23): 친구·챌린지 알림을 받는 사람 언어로 보낸다.
// 예전에는 영어 앱 회원에게도 "친구 요청이 도착했어요" 가 갔고, 영어 알림 주소는
// 영어 앱이 식단·운동·수면·프로필만 있던 때의 목록을 써서 대시보드·갤러리·자산 알림이 식단 탭을 열었다.
const RUNTIME = readRawRepoFile('functions/runtime.js');
const HANGUL = /[가-힣]/;

const slice = (from, to) => RUNTIME.slice(RUNTIME.indexOf(from), RUNTIME.indexOf(to, RUNTIME.indexOf(from)));
const api = Function(`
    function normalizeLocale(raw = "ko") { return String(raw || "").toLowerCase().startsWith("en") ? "en" : "ko"; }
    ${slice('function buildAppPath(', 'async function hydratePushTargetLocales(')}
    ${slice('const ENGLISH_PUSH_TABS', 'async function sendLocalizedMulticast(')}
    ${slice('const isEnglishPush =', 'function inferImageContentType(')}
    return {
        buildLocalizedAppPath,
        builders: {
            buildFriendRequestPushPayload, buildFriendConnectedPushPayload, buildFriendDeclinedPushPayload,
            buildChallengeInvitePushPayload, buildChallengeStartedPushPayload, buildChallengePendingUpdatePushPayload,
            buildChallengeDeclinedPushPayload, buildChallengeCancelledPushPayload, buildChallengeSettledPushPayload
        }
    };
`)();

const ARGS = {
    requesterName: 'Ann', friendName: 'Ann', friendshipId: 'f1', challengeId: 'c1', creatorName: 'Ann',
    accepterName: 'Ann', responderName: 'Ann', type: 'competition', durationDays: 7, stakePoints: 50,
    outcome: 'win', bonusPoints: 30
};
const textOf = (payload) => [payload.title, payload.body, ...(payload.actions || []).map((a) => a.title)].join(' ');

describe('친구·챌린지 알림은 받는 사람 언어로 간다', () => {
    for (const [name, build] of Object.entries(api.builders)) {
        it(`${name}: 영어 회원에게는 한글 없이, 한국어 회원에게는 한국어로`, () => {
            const make = build(ARGS);
            expect(typeof make).toBe('function');
            const en = make('en');
            const ko = make('ko');
            expect(HANGUL.test(textOf(en)), textOf(en)).toBe(false);
            expect(HANGUL.test(ko.title)).toBe(true);
            expect(en.url.startsWith('/en')).toBe(true);
            expect(ko.url.startsWith('/?tab=')).toBe(true);
            expect(en.tag).toBe(ko.tag);
        });
    }

    it('한국어 알림 글은 예전 그대로다', () => {
        const ko = api.builders.buildFriendRequestPushPayload(ARGS)('ko');
        expect(ko.title).toBe('친구 요청이 도착했어요');
        expect(ko.body).toBe('Ann님이 친구 요청을 보냈어요.');
        expect(ko.url).toBe('/?tab=profile&panel=friends&friendshipId=f1');
        const settled = api.builders.buildChallengeSettledPushPayload(ARGS)('ko');
        expect(settled.body).toBe('경쟁에서 승리했어요 · 보너스 30P');
        expect(api.builders.buildChallengeSettledPushPayload(ARGS)('en').body).toBe('You won the match · 30P bonus');
    });

    it('보내는 쪽은 함수를 받으면 회원 언어별로 나눠 보낸다', () => {
        const fn = slice('async function sendPushToUsers(', 'function addPushTarget(');
        expect(fn).toContain('if (typeof payload === "function") await sendLocalizedMulticast(targets, payload);');
    });
});

describe('영어 알림 주소는 지금 영어 앱의 탭을 연다', () => {
    it('대시보드가 첫 탭이고 나머지는 # 로 연다', () => {
        expect(api.buildLocalizedAppPath('en', 'dashboard', { panel: 'challenge', challengeId: 'c1' })).toBe('/en?panel=challenge&challengeId=c1');
        expect(api.buildLocalizedAppPath('en', 'diet', { focus: 'upload' })).toBe('/en?focus=upload#diet');
        expect(api.buildLocalizedAppPath('en', 'gallery')).toBe('/en#gallery');
        expect(api.buildLocalizedAppPath('en', 'assets')).toBe('/en#assets');
        expect(api.buildLocalizedAppPath('en', 'unknown')).toBe('/en');
    });

    it('화면 쪽 영어 탭 목록과 같다', () => {
        const client = readRawRepoFile('js/app-mode.js').match(/const ENGLISH_TABS = \[([^\]]+)\]/)[1];
        const server = RUNTIME.match(/const ENGLISH_PUSH_TABS = Object\.freeze\(\[([^\]]+)\]\)/)[1];
        const names = (list) => list.replace(/["'\s]/g, '').split(',');
        expect(names(server)).toEqual(names(client));
    });

    it('한국어 주소는 그대로다', () => {
        expect(api.buildLocalizedAppPath('ko', 'diet', { focus: 'upload' })).toBe('/?tab=diet&focus=upload');
    });
});
