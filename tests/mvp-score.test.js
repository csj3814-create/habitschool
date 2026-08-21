import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    POINTS_FORMULA_START_MONTH,
    sumActivityPoints,
    usesPointsFormula,
    computeMvpScore,
    compareForRank,
    rankUsers,
    collectSocialCounts,
} = require('../functions/mvp-score.js');

// 실측(2026-08-21)에서 나온 실제 형태의 표본. 숫자를 지어내면 상한이 걸리는지
// 안 걸리는지가 우연에 좌우된다.
const HEAVY_REACTOR = { userId: 'u1', days: 21, points: 1390, comments: 2, reactions: 356 };

describe('MVP 점수 식', () => {
    it('2026-09 부터 활동 포인트 기준으로 바뀐다', () => {
        expect(usesPointsFormula('2026-08')).toBe(false);
        expect(usesPointsFormula(POINTS_FORMULA_START_MONTH)).toBe(true);
        expect(usesPointsFormula('2026-10')).toBe(true);
    });

    it('지나간 달의 순위는 옛 식 그대로 둔다', () => {
        // 21*10 + 2*3 + 356 = 572
        expect(computeMvpScore(HEAVY_REACTOR, '2026-08')).toBe(572);
    });

    it('사회 점수는 활동 포인트의 30%를 넘지 못한다', () => {
        // 사회항 원값 2*11 + 356*4 = 1446, 상한 floor(1390*0.3) = 417
        expect(computeMvpScore(HEAVY_REACTOR, '2026-09')).toBe(1390 + 417);
    });

    it('상한에 안 걸리는 참여는 그대로 더해진다', () => {
        const modest = { days: 21, points: 910, comments: 0, reactions: 56 };
        expect(56 * 4).toBeLessThan(Math.floor(910 * 0.30));
        expect(computeMvpScore(modest, '2026-09')).toBe(910 + 224);
    });

    it('기록 없이 리액션만 눌러서는 기록한 사람을 못 이긴다', () => {
        // 한 달 게시물 전부(375개)에 리액션을 눌러도 활동 포인트가 0이면 0점이다.
        const tapper = { days: 0, points: 0, comments: 0, reactions: 375 };
        expect(computeMvpScore(tapper, '2026-09')).toBe(0);
    });

    it('활동 포인트는 세 항목의 합이고 음수·비수치를 무시한다', () => {
        expect(sumActivityPoints({ dietPoints: 30, exercisePoints: 30, mindPoints: 20 })).toBe(80);
        expect(sumActivityPoints({ dietPoints: -5, exercisePoints: 'x', mindPoints: 10 })).toBe(10);
        expect(sumActivityPoints(null)).toBe(0);
    });
});

describe('동점 정렬', () => {
    it('같은 점수면 활동 포인트가 높은 쪽이 앞선다', () => {
        // 8월 실제 상황: 21일 만점 6명이 전부 210점이었다.
        const a = { userId: 'zzz', days: 21, points: 1390, comments: 0, reactions: 0, score: 210 };
        const b = { userId: 'aaa', days: 21, points: 825, comments: 0, reactions: 0, score: 210 };
        expect(compareForRank(a, b)).toBeLessThan(0);
    });

    it('모든 지표가 같으면 uid 로 확정한다 — 재집계해도 순서가 안 바뀐다', () => {
        const a = { userId: 'aaa', days: 5, points: 100, comments: 0, reactions: 0, score: 100 };
        const b = { userId: 'bbb', days: 5, points: 100, comments: 0, reactions: 0, score: 100 };
        expect(compareForRank(a, b)).toBeLessThan(0);
        expect(compareForRank(b, a)).toBeGreaterThan(0);
    });

    it('같은 입력을 순서만 바꿔 넣어도 같은 순위가 나온다', () => {
        const stats = {
            u1: { days: 21, points: 825, comments: 0, reactions: 0, name: 'A' },
            u2: { days: 21, points: 1390, comments: 0, reactions: 0, name: 'B' },
            u3: { days: 21, points: 1030, comments: 0, reactions: 0, name: 'C' },
        };
        const forward = rankUsers(stats, '2026-08', 3).map((u) => u.userId);
        const reversed = rankUsers(
            Object.fromEntries(Object.entries(stats).reverse()),
            '2026-08',
            3
        ).map((u) => u.userId);
        expect(forward).toEqual(reversed);
        expect(forward).toEqual(['u2', 'u3', 'u1']);
    });

    it('기록이 하나도 없는 사람은 순위에서 뺀다', () => {
        const stats = {
            recorder: { days: 3, points: 90, comments: 0, reactions: 0 },
            onlyReactor: { days: 0, points: 0, comments: 0, reactions: 300 },
        };
        expect(rankUsers(stats, '2026-09').map((u) => u.userId)).toEqual(['recorder']);
    });
});

describe('댓글·리액션 수집', () => {
    // gallery_posts 의 문서 ID 는 daily_logs 와 같다. 두 곳에 같은 리액션이
    // 남아 있어도 한 번만 세야 한다.
    const makeDb = (galleryDocs) => ({
        doc: (path) => ({ __id: path.split('/')[1] }),
        getAll: async (...refs) => refs.map((ref) => ({
            id: ref.__id,
            exists: Object.prototype.hasOwnProperty.call(galleryDocs, ref.__id),
            data: () => galleryDocs[ref.__id] || {},
        })),
    });

    it('gallery_posts 에만 있는 리액션을 집계한다 — 이번 버그의 핵심', () => {
        const dailyLogs = [{ id: 'ownerA_2026-09-01', data: { userId: 'ownerA' } }];
        const db = makeDb({
            'ownerA_2026-09-01': { reactions: { heart: ['fan1', 'fan2'], fire: ['fan1'] } },
        });
        return collectSocialCounts(db, dailyLogs).then((social) => {
            // fan1 은 heart 와 fire 둘 다 눌렀지만 게시물당 1회
            expect(social.reactions.get('fan1')).toBe(1);
            expect(social.reactions.get('fan2')).toBe(1);
        });
    });

    it('daily_logs 와 gallery_posts 에 겹쳐 있으면 한 번만 센다', async () => {
        const dailyLogs = [{
            id: 'ownerA_2026-09-01',
            data: { userId: 'ownerA', reactions: { heart: ['fan1'] } },
        }];
        const db = makeDb({
            'ownerA_2026-09-01': { reactions: { heart: ['fan1'] } },
        });
        const social = await collectSocialCounts(db, dailyLogs);
        expect(social.reactions.get('fan1')).toBe(1);
    });

    it('서로 다른 게시물의 리액션은 각각 센다', async () => {
        const dailyLogs = [
            { id: 'ownerA_2026-09-01', data: { userId: 'ownerA' } },
            { id: 'ownerB_2026-09-01', data: { userId: 'ownerB' } },
        ];
        const db = makeDb({
            'ownerA_2026-09-01': { reactions: { heart: ['fan1'] } },
            'ownerB_2026-09-01': { reactions: { heart: ['fan1'] } },
        });
        const social = await collectSocialCounts(db, dailyLogs);
        expect(social.reactions.get('fan1')).toBe(2);
    });

    it('같은 사람이 한 글에 댓글을 여러 개 달아도 1회로 센다', async () => {
        const dailyLogs = [{ id: 'ownerA_2026-09-01', data: { userId: 'ownerA' } }];
        const db = makeDb({
            'ownerA_2026-09-01': {
                comments: [{ userId: 'fan1' }, { userId: 'fan1' }, { userId: 'fan2' }],
            },
        });
        const social = await collectSocialCounts(db, dailyLogs);
        expect(social.comments.get('fan1')).toBe(1);
        expect(social.comments.get('fan2')).toBe(1);
    });
});

describe('회귀 가드', () => {
    // 2026-08: 리액션 쓰기가 gallery_posts 로 옮겨간 뒤에도 집계 세 곳이 모두
    // daily_logs 를 계속 읽어서, 한 달 내내 사회항이 0이었다(실제 리액션 494개).
    // 그 형태가 다시 들어오는 것을 막는다.
    const runtime = readRepoFile('functions/runtime.js');

    it('집계가 daily_logs 의 댓글·리액션을 직접 세지 않는다', () => {
        expect(runtime).not.toContain('userStats[commenterUid].comments++');
        expect(runtime).not.toContain('userStats[reactorUid].reactions++');
    });

    it('점수 식이 runtime.js 안에 다시 복사되지 않았다', () => {
        expect(runtime).not.toMatch(/u\.score\s*=\s*u\.days\s*\*\s*10/);
        expect(runtime).not.toMatch(/\(u\.days\s*\*\s*10\)/);
    });

    it('세 집계 지점이 모두 공용 모듈을 쓴다', () => {
        expect(runtime).toContain('require("./mvp-score")');
        // 지급 · 시간별 집계 · 아카이브
        expect(runtime.match(/rankUsers\(/g) || []).toHaveLength(3);
        expect(runtime.match(/collectSocialCounts\(/g) || []).toHaveLength(3);
    });

    it('화면과 지급이 같은 시점에 식을 바꾼다', () => {
        expect(readRepoFile('js/app-core.js'))
            .toContain(`MVP_POINTS_FORMULA_START_MONTH = '${POINTS_FORMULA_START_MONTH}'`);
        expect(readRepoFile('community-history.html'))
            .toContain(`MVP_POINTS_FORMULA_START_MONTH = '${POINTS_FORMULA_START_MONTH}'`);
    });
});
