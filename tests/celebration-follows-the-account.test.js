import { describe, expect, it, vi } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-21 제보: "폰에서 확인했던 배지 축하가 새 컴퓨터로 로그인하니까 처음부터
// 다시 다 뜨네?"
//
// 확인한 사실이 localStorage 에만 있었다. 기기가 하나일 때는 한 번 더 보는 정도의
// 일이지만, 기기를 바꾸면 몇 달치 배지가 첫 화면에 한꺼번에 쏟아진다.
//
// 아래는 글자 맞추기가 아니라 실제 코드를 떼어 와 돌린다. "계정에 적는다" 는 문장이
// 소스에 있는 것과, 새 기기에서 정말 안 뜨는 것은 다른 일이다.

const APP = readRepoFile('js/app-core.js');

function createHarness({ serverIds = null, storage = {}, uid = 'u1' } = {}) {
    const start = APP.indexOf("const CELEBRATED_ACHIEVEMENTS_KEY_PREFIX = 'hs_celebrated_';");
    const end = APP.indexOf('// ── 챌린지 보상 수령 축하');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = APP.slice(start, end);

    // 화면에 실제로 뜬 축하만 담는다. 제목 칸에 글이 찍히는 순간이 그것이다.
    const shown = [];
    const writes = [];
    const warnings = [];
    const timers = [];
    const nodes = new Map();
    const node = (id) => {
        if (!nodes.has(id)) {
            nodes.set(id, {
                id,
                style: { display: 'none' },
                innerHTML: '',
                _text: '',
                get textContent() { return this._text; },
                set textContent(value) {
                    this._text = value;
                    if (id === 'achievement-title' && value) shown.push(value);
                },
            });
        }
        return nodes.get(id);
    };

    const localStorage = {
        getItem: (k) => (k in storage ? storage[k] : null),
        setItem: (k, v) => { storage[k] = v; },
    };

    const win = {};
    const setDoc = vi.fn((_ref, payload) => {
        writes.push(payload);
        return Promise.resolve();
    });

    const api = Function(
        'window', 'localStorage', 'document', 'auth', 'setDoc', 'doc', 'db',
        'arrayUnion', 'console', 'setTimeout', 'clearTimeout', 'escapeHtml',
        `${block}
        return {
            celebrate: (items) => window.celebrateAchievementsOnce(items),
            prime: (u, ids) => window.primeCelebratedAchievements(u, ids),
            dismiss: () => window.dismissAchievementCelebration(),
            seenIds: (u) => [...getCelebratedAchievementIds(u)],
        };`
    )(
        win,
        localStorage,
        { getElementById: (id) => node(id) },
        { currentUser: { uid } },
        setDoc,
        (_db, col, id) => ({ col, id }),
        {},
        (...ids) => ({ __arrayUnion: ids }),
        { warn: (...args) => warnings.push(args.join(' ')) },
        (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
        () => {},
        (value) => String(value)
    );

    if (serverIds) api.prime(uid, serverIds);
    return { api, shown, writes, warnings, timers, storage, setDoc, modal: node('achievement-modal') };
}

const BADGE = { id: 'badge:streak5', emoji: '🏅', title: '5주 연속 배지를 얻었어요' };

describe('a celebration belongs to the person, not the device', () => {
    it('does not replay on a new device what the phone already confirmed', () => {
        // 새 컴퓨터: localStorage 는 비어 있지만 계정은 이미 알고 있다.
        const h = createHarness({ serverIds: ['badge:streak5'], storage: {} });
        h.api.celebrate([BADGE]);
        expect(h.shown).toEqual([]);
        expect(h.modal.style.display).toBe('none');
    });

    it('still celebrates something the account has never seen', () => {
        const h = createHarness({ serverIds: ['badge:streak3'], storage: {} });
        h.api.celebrate([BADGE]);
        expect(h.shown).toEqual(['5주 연속 배지를 얻었어요']);
        expect(h.modal.style.display).toBe('flex');
    });

    it('writes the confirmation to the account, not only to this device', () => {
        const h = createHarness({ serverIds: [], storage: {} });
        h.api.celebrate([BADGE]);
        expect(h.setDoc).toHaveBeenCalledTimes(1);
        // 규칙 화이트리스트에 이미 있는 settings 안이라 규칙 배포가 필요 없다.
        expect(h.writes[0].settings.celebratedAchievements.__arrayUnion).toEqual(['badge:streak5']);
        expect(h.setDoc.mock.calls[0][2]).toEqual({ merge: true });
        // 기기 기록도 그대로 남는다 — 연결이 끊긴 채 다시 그려도 되풀이되지 않는다.
        expect(JSON.parse(h.storage.hs_celebrated_u1)).toContain('badge:streak5');
    });

    it('holds the sheet until the account answers', () => {
        // prime 하기 전. 여기서 띄우면 고치려던 바로 그 장면이 된다.
        const h = createHarness({ serverIds: null, storage: {} });
        h.api.celebrate([BADGE]);
        expect(h.shown).toEqual([]);
        expect(h.setDoc).not.toHaveBeenCalled();

        h.api.prime('u1', ['badge:streak5']);
        expect(h.shown).toEqual([]);
    });

    it('releases what it was holding when the account has not seen it', () => {
        const h = createHarness({ serverIds: null, storage: {} });
        h.api.celebrate([BADGE]);
        h.api.prime('u1', []);
        expect(h.shown).toEqual(['5주 연속 배지를 얻었어요']);
    });

    it('celebrates anyway when the account never answers', () => {
        // 축하를 영영 삼키는 것보다 한 번 더 보는 쪽이 낫다.
        const h = createHarness({ serverIds: null, storage: {} });
        h.api.celebrate([BADGE]);
        expect(h.timers).toHaveLength(1);
        expect(h.timers[0].ms).toBe(5000);
        h.timers[0].fn();
        expect(h.shown).toEqual(['5주 연속 배지를 얻었어요']);
        expect(h.warnings.join(' ')).toContain('계정 기록');
    });

    it('shows one sheet when the same item is sent on every redraw', () => {
        // 소모임 카드는 화면을 다시 그릴 때마다 같은 항목을 보낸다.
        const h = createHarness({ serverIds: null, storage: {} });
        const group = { id: 'group-reward:g1', title: '소모임 100일을 채웠어요' };
        h.api.celebrate([group]);
        h.api.celebrate([group]);
        h.api.celebrate([group]);
        h.api.prime('u1', []);
        expect(h.shown).toEqual(['소모임 100일을 채웠어요']);
    });

    it('still queues two different achievements one after the other', () => {
        const h = createHarness({ serverIds: [], storage: {} });
        h.api.celebrate([BADGE, { id: 'badge:streak3', title: '3주 연속 배지를 얻었어요' }]);
        expect(h.shown).toEqual(['5주 연속 배지를 얻었어요']);
        h.api.dismiss();
        expect(h.shown).toEqual(['5주 연속 배지를 얻었어요', '3주 연속 배지를 얻었어요']);
    });

    it('teaches this device what the account knows, so next time is instant', () => {
        const h = createHarness({ serverIds: ['badge:streak3', 'badge:streak5'], storage: {} });
        expect(JSON.parse(h.storage.hs_celebrated_u1).sort())
            .toEqual(['badge:streak3', 'badge:streak5']);
    });

    it('keeps a confirmation that has not reached the server yet', () => {
        // 이 기기에만 있는 확인을 계정 목록이 덮어쓰면, 연결이 끊긴 동안 확인한
        // 축하가 연결이 돌아오는 순간 다시 뜬다.
        const h = createHarness({
            serverIds: ['badge:streak3'],
            storage: { hs_celebrated_u1: JSON.stringify(['badge:offline']) },
        });
        expect(h.api.seenIds('u1').sort()).toEqual(['badge:offline', 'badge:streak3']);
    });

    it('does not read one account list for another account', () => {
        const h = createHarness({ serverIds: ['badge:streak5'], storage: {}, uid: 'u1' });
        expect(h.api.seenIds('u2')).toEqual([]);
    });

    it('says so out loud when the account write fails', () => {
        // 조용히 실패하면 기기를 옮길 때마다 되풀이되는데 화면은 멀쩡해 보인다.
        const mark = APP.split('function markAchievementCelebrated(')[1].split('\n}\n')[0];
        expect(mark).toContain('console.warn');
        expect(mark).not.toContain('.catch(() => {})');
    });
});
