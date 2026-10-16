// 해빛 배지 — 갤러리 글과 댓글에 "배지 칸"(userBadge)을 서버가 따로 저장한다(2026-10-16 대표 결정).
// 이름(userName)에는 배지를 넣지 않는다. 갤러리는 다른 회원 문서를 읽지 않고 이 칸만 보여 준다.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readRepoFile } from './source-helpers.js';
import { createFakeFirestore, FakeFieldValue, FakeHttpsError } from './fake-firestore.js';

const require = createRequire(import.meta.url);
const galleryPosts = require('../functions/gallery-posts.js');
const globalRewards = require('../functions/global-rewards.js');
const { buildGalleryPostFromDailyLog, preserveGalleryEngagement, syncGalleryPostFromDailyLog } = galleryPosts;
const { setDisplayBadge, resolveDisplayBadgeEmoji } = globalRewards;

const deps = (fake) => ({ db: fake.db, FieldValue: FakeFieldValue, HttpsError: FakeHttpsError });

const LOG = {
    userId: 'u1',
    userName: '김해빛',
    date: '2026-10-16',
    shareSettings: {},
    sleepAndMind: { meditationDone: true },
    awardedPoints: { mindPoints: 5 },
};

describe('대표 배지 이모지 고르기', () => {
    it('가진 배지만, 목록에 있는 배지만', () => {
        expect(resolveDisplayBadgeEmoji({ displayBadge: 'sprout', globalBadges: { sprout: {} } })).toBe('🌱');
        expect(resolveDisplayBadgeEmoji({ displayBadge: 'legend', globalBadges: { sprout: {} } })).toBe('');
        expect(resolveDisplayBadgeEmoji({ displayBadge: 'globe', globalBadges: { globe: {} } })).toBe('');
        expect(resolveDisplayBadgeEmoji({})).toBe('');
        expect(resolveDisplayBadgeEmoji(null)).toBe('');
    });
});

describe('갤러리 글에 배지 칸', () => {
    it('이름을 보여 주는 글이면 배지 칸을 저장한다 — 이름 자체는 그대로', () => {
        const post = buildGalleryPostFromDailyLog({ logId: 'u1_2026-10-16', dailyLog: LOG, userBadge: '🌱' });
        expect(post.userBadge).toBe('🌱');
        expect(post.userName).toBe('김해빛');
    });

    it('이름을 숨긴 글에는 배지도 넣지 않는다', () => {
        const post = buildGalleryPostFromDailyLog({
            logId: 'u1_2026-10-16',
            dailyLog: { ...LOG, shareSettings: { hideIdentity: true } },
            userBadge: '🌱',
        });
        expect(post.userName).toBe('');
        expect(post).not.toHaveProperty('userBadge');
    });

    it('배지가 없으면 칸을 만들지 않는다', () => {
        const post = buildGalleryPostFromDailyLog({ logId: 'u1_2026-10-16', dailyLog: LOG });
        expect(post).not.toHaveProperty('userBadge');
    });

    it('글을 다시 만들 때 댓글의 배지 칸을 지우지 않는다', () => {
        const preserved = preserveGalleryEngagement({
            comments: [{ userId: 'u2', userName: '친구', userBadge: '🔥', text: '좋아요', id: 'c1' }],
        });
        expect(preserved.comments[0].userBadge).toBe('🔥');
    });

    it('투영할 때 글쓴이의 대표 배지를 서버가 읽어 넣는다(회원이 글에 직접 못 넣는다)', async () => {
        const fake = createFakeFirestore({
            'users/u1': { displayBadge: 'sprout', displayBadgeEmoji: '🌱', globalBadges: { sprout: {} } },
            'daily_logs/u1_2026-10-16': { ...LOG, userBadge: '👑' },
        });
        await syncGalleryPostFromDailyLog({ db: fake.db, FieldValue: FakeFieldValue, logId: 'u1_2026-10-16' });
        expect(fake.read('gallery_posts/u1_2026-10-16').userBadge).toBe('🌱');
    });

    it('대표 배지가 없으면 투영에도 배지가 없다', async () => {
        const fake = createFakeFirestore({
            'users/u1': {},
            'daily_logs/u1_2026-10-16': LOG,
        });
        await syncGalleryPostFromDailyLog({ db: fake.db, FieldValue: FakeFieldValue, logId: 'u1_2026-10-16' });
        expect(fake.read('gallery_posts/u1_2026-10-16')).not.toHaveProperty('userBadge');
    });
});

describe('대표 배지를 바꾸면 지난 갤러리 글도 한꺼번에 바뀐다', () => {
    function seed() {
        return createFakeFirestore({
            'users/u1': { globalBadges: { sprout: {}, flame: {} }, displayBadge: 'sprout', displayBadgeEmoji: '🌱' },
            'gallery_posts/u1_a': { userId: 'u1', userName: '김해빛', userBadge: '🌱' },
            'gallery_posts/u1_b': { userId: 'u1', userName: '김해빛' },
            'gallery_posts/u1_hidden': { userId: 'u1', userName: '' },
            'gallery_posts/u2_a': { userId: 'u2', userName: '다른 회원', userBadge: '👑' },
        });
    }

    it('바꾸면 이름이 보이는 내 글 전부에 새 배지', async () => {
        const fake = seed();
        await setDisplayBadge({ ...deps(fake), uid: 'u1', badgeId: 'flame' });
        expect(fake.read('gallery_posts/u1_a').userBadge).toBe('🔥');
        expect(fake.read('gallery_posts/u1_b').userBadge).toBe('🔥');
        expect(fake.read('gallery_posts/u1_hidden')).not.toHaveProperty('userBadge');
        expect(fake.read('gallery_posts/u2_a').userBadge).toBe('👑');
    });

    it('떼면 내 글에서 배지 칸이 빠진다', async () => {
        const fake = seed();
        await setDisplayBadge({ ...deps(fake), uid: 'u1', badgeId: '' });
        expect(fake.read('gallery_posts/u1_a')).not.toHaveProperty('userBadge');
        expect(fake.read('gallery_posts/u1_b')).not.toHaveProperty('userBadge');
        expect(fake.read('gallery_posts/u2_a').userBadge).toBe('👑');
    });

    it('첫 배지를 사서 대표로 달릴 때도 지난 글에 붙는다', async () => {
        const logs = {};
        for (let i = 0; i < 7; i += 1) {
            const date = `2026-01-0${i + 1}`;
            logs[`daily_logs/u1_${date}`] = { userId: 'u1', date, awardedPoints: { mindPoints: 5 } };
        }
        const fake = createFakeFirestore({
            'users/u1': { coins: 1000 },
            'gallery_posts/u1_a': { userId: 'u1', userName: '김해빛' },
            ...logs,
        });
        await globalRewards.purchaseGlobalBadge({ ...deps(fake), uid: 'u1', badgeId: 'sprout' });
        expect(fake.read('gallery_posts/u1_a').userBadge).toBe('🌱');
    });
});

describe('댓글과 화면', () => {
    it('댓글을 달 때 서버가 내 대표 배지를 함께 저장한다', () => {
        const runtime = readRepoFile('functions/runtime.js');
        const block = runtime.slice(runtime.indexOf('exports.addGalleryComment = onCall('));
        const body = block.slice(0, block.indexOf('exports.deleteGalleryComment'));
        expect(body).toContain('resolveDisplayBadgeEmoji(userData)');
        expect(body).toContain('comment.userBadge = userBadge');
    });

    it('갤러리 글쓴이 이름과 댓글 작성자 이름 앞에 배지 칸을 보여 준다', () => {
        const app = readRepoFile('js/app-core.js');
        expect(app).toContain('formatBadgedName(');
        const render = app.slice(app.indexOf('function renderCommentList(docId, comments)'));
        expect(render.slice(0, 1200)).toContain('formatBadgedName(c.userName');
    });

    it('규칙은 바꾸지 않는다 — 갤러리 글은 원래 서버만 쓴다', () => {
        const rules = readRepoFile('firestore.rules');
        expect(rules).not.toContain('userBadge');
        expect(rules).toMatch(/match \/gallery_posts\/\{postId\} \{\s*allow read: if isSignedIn\(\);\s*allow create, update, delete: if false;/);
    });
});

describe('투영 트랜잭션은 사용자 문서를 잠그지 않는다', () => {
    it('사용자 문서는 트랜잭션 밖에서 읽는다(포인트 지급과 서로 기다리지 않게)', async () => {
        const fake = createFakeFirestore({
            'users/u1': { displayBadge: 'sprout', globalBadges: { sprout: {} } },
            'daily_logs/u1_2026-10-16': LOG,
        });
        const txGets = [];
        const db = {
            ...fake.db,
            doc: fake.db.doc,
            collection: fake.db.collection,
            runTransaction: (fn) => fake.db.runTransaction((tx) => fn({
                ...tx,
                get: (ref) => { txGets.push(ref.path); return tx.get(ref); },
            })),
        };
        await syncGalleryPostFromDailyLog({ db, FieldValue: FakeFieldValue, logId: 'u1_2026-10-16' });
        expect(txGets).not.toContain('users/u1');
        expect(fake.read('gallery_posts/u1_2026-10-16').userBadge).toBe('🌱');
    });
});
