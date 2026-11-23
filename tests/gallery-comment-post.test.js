// 갤러리 댓글 (2026-11-22)
//  - 「게시」: 누르는 즉시 단추가 잠기고 댓글이 먼저 보이며, 두 번 눌러도 한 번만, 실패하면 글을 되돌린다.
//  - 답글·댓글 알림·한 번 눌러 쓰는 댓글·댓글 포인트(tasks/2026-11-22_갤러리_댓글_알림_계획.md).
//  - 서버 함수는 runtime.js 없이 뜬다(콜드 스타트).
import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const functionsRequire = createRequire(resolve(ROOT_DIR, 'functions/gallery-comments.js'));

// ── 화면: app-core.js 의 댓글 코드를 떼어 가짜 화면에서 돌린다 ─────────────
function loadCommentUi({ callable, comments = [], postOwner = 'owner' }) {
    const app = read('js/app-core.js');
    const start = app.indexOf('const _commentPostsInFlight = new Set();');
    const source = app.slice(start, app.indexOf('// 댓글 삭제 (본인만)'));
    expect(start).toBeGreaterThan(0);

    const button = { disabled: false, textContent: '게시', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    const chips = [{ disabled: false }, { disabled: false }];
    const input = { value: '', focused: false, focus() { this.focused = true; }, setSelectionRange() {} };
    const item = { id: 'p1', data: { userId: postOwner, comments: [...comments] } };
    const toasts = [];
    const sandbox = {
        window: { _userDisplayBadgeEmoji: '🌱' },
        auth: { currentUser: { uid: 'me' } },
        document: {
            getElementById: (id) => (id === 'comment-input-p1' ? input : null),
            querySelector: (selector) => (selector.includes('comment-input-p1') ? button : null),
            querySelectorAll: (selector) => (selector.includes('comment-quick-p1') ? chips : []),
        },
        CSS: { escape: (s) => s },
        navigator: { onLine: true },
        functions: {},
        httpsCallable: (_fns, name) => { expect(name).toBe('addGalleryComment'); return callable; },
        cachedGalleryLogs: [item],
        renderCommentList: () => {},
        renderActivitySummary: () => {},
        showToast: (message) => toasts.push(message),
        sanitizeText: (s) => s,
        getUserDisplayName: () => '나',
        escapeHtml: (s) => String(s),
        t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
        console: { error: () => {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    return { win: sandbox.window, sandbox, button, chips, input, item, toasts };
}

function deferred() {
    let resolveFn;
    const promise = new Promise((res) => { resolveFn = res; });
    return { promise, resolve: resolveFn };
}

const reply = (comment, extra = {}) => Promise.resolve({ data: { comment, pointsAwarded: 0, ...extra } });

describe('댓글 게시 화면', () => {
    it('누르는 즉시 단추가 「올리는 중」으로 잠기고 댓글이 흐리게 먼저 붙는다', async () => {
        const answer = deferred();
        const callable = vi.fn(() => answer.promise);
        const ui = loadCommentUi({ callable });
        ui.input.value = '  좋아요  ';

        const running = ui.win.addComment('p1');
        expect(ui.button.disabled).toBe(true);
        expect(ui.button.textContent).toBe('gallery.comment.posting');
        expect(ui.button.attrs['aria-busy']).toBe('true');
        expect(ui.chips.every((chip) => chip.disabled)).toBe(true);
        expect(ui.input.value).toBe('');
        expect(ui.item.data.comments[0]).toMatchObject({ pending: true, text: '좋아요', userId: 'me', userName: '나', userBadge: '🌱' });

        answer.resolve({ data: { comment: { id: 'c1', userId: 'me', userName: '나', text: '좋아요', timestamp: 1 } } });
        await running;
        expect(ui.item.data.comments).toEqual([{ id: 'c1', userId: 'me', userName: '나', text: '좋아요', timestamp: 1 }]);
        expect(ui.button.disabled).toBe(false);
        expect(ui.button.textContent).toBe('gallery.comment.post');
        expect(ui.toasts).toEqual([]);
    });

    it('두 번 눌러도(엔터 포함) 서버에는 한 번만 보낸다', async () => {
        const answer = deferred();
        const callable = vi.fn(() => answer.promise);
        const ui = loadCommentUi({ callable });
        ui.input.value = '한 번만';
        const first = ui.win.addComment('p1');
        ui.input.value = '한 번만';
        const second = ui.win.addComment('p1');
        const quick = ui.win.postQuickComment('p1', 0);
        answer.resolve({ data: { comment: { id: 'c1', userId: 'me', text: '한 번만', timestamp: 1 } } });
        await Promise.all([first, second, quick]);
        expect(callable).toHaveBeenCalledTimes(1);
    });

    it('실패하면 흐린 댓글을 거두고, 쓴 글을 입력칸에 되돌리고, 이유를 알린다', async () => {
        const callable = vi.fn(() => Promise.reject(Object.assign(new Error('게시물을 찾을 수 없습니다.'), { code: 'functions/not-found' })));
        const ui = loadCommentUi({ callable });
        ui.input.value = '사라지면 안 돼요';
        await ui.win.addComment('p1');
        expect(ui.item.data.comments).toEqual([]);
        expect(ui.input.value).toBe('사라지면 안 돼요');
        expect(ui.button.disabled).toBe(false);
        expect(ui.toasts).toEqual(['gallery.comment.addFailedReason:{"reason":"게시물을 찾을 수 없습니다."}']);
    });

    it('오류 코드만 온 실패(internal)는 다시 눌러 달라고 알린다', async () => {
        const callable = vi.fn(() => Promise.reject(Object.assign(new Error('internal'), { code: 'functions/internal' })));
        const ui = loadCommentUi({ callable });
        ui.input.value = '다시';
        await ui.win.addComment('p1');
        expect(ui.toasts[0]).toContain('gallery.comment.retryLater');
        expect(ui.input.value).toBe('다시');
    });

    it('댓글 포인트를 받으면 알려 준다', async () => {
        const callable = vi.fn(() => reply({ id: 'c1', userId: 'me', text: '멋진 식단', timestamp: 1 }, { pointsAwarded: 1 }));
        const ui = loadCommentUi({ callable });
        ui.input.value = '멋진 식단';
        await ui.win.addComment('p1');
        expect(ui.toasts).toEqual(['gallery.comment.pointsEarned:{"n":1}']);
    });
});

describe('답글', () => {
    const other = { id: 'c-other', userId: 'u2', userName: '해빛이', text: '오늘도 화이팅', timestamp: 1 };

    it('「답글」을 누르면 입력칸에 @이름 이 들어가고, 보낼 때 이름은 떼고 댓글 id 를 함께 보낸다', async () => {
        const callable = vi.fn(({ text }) => reply({ id: 'c2', userId: 'me', text, timestamp: 2, replyTo: { id: 'c-other', userId: 'u2', userName: '해빛이' } }));
        const ui = loadCommentUi({ callable, comments: [other] });
        ui.win.startCommentReply('p1', 0);
        expect(ui.input.value).toBe('@해빛이 ');
        expect(ui.input.focused).toBe(true);
        ui.input.value += '고마워요';

        const running = ui.win.addComment('p1');
        const pending = ui.item.data.comments.find((c) => c.pending);
        expect(pending).toMatchObject({ text: '고마워요', replyTo: { id: 'c-other', userId: 'u2', userName: '해빛이' } });
        await running;
        expect(callable).toHaveBeenCalledWith({ postId: 'p1', text: '고마워요', replyToCommentId: 'c-other' });
    });

    it('@이름 을 지우면 답글이 아니다', async () => {
        const callable = vi.fn(({ text }) => reply({ id: 'c2', userId: 'me', text, timestamp: 2 }));
        const ui = loadCommentUi({ callable, comments: [other] });
        ui.win.startCommentReply('p1', 0);
        ui.input.value = '그냥 댓글';
        await ui.win.addComment('p1');
        expect(callable).toHaveBeenCalledWith({ postId: 'p1', text: '그냥 댓글' });
    });

    it('답글이 실패하면 @이름 까지 그대로 되돌린다', async () => {
        const callable = vi.fn(() => Promise.reject(Object.assign(new Error('internal'), { code: 'functions/internal' })));
        const ui = loadCommentUi({ callable, comments: [other] });
        ui.win.startCommentReply('p1', 0);
        ui.input.value += '고마워요';
        await ui.win.addComment('p1');
        expect(ui.input.value).toBe('@해빛이 고마워요');
    });
});

describe('한 번 눌러 쓰는 댓글', () => {
    it('누른 문장을 바로 올리고, 쓰던 입력칸은 건드리지 않는다', async () => {
        const callable = vi.fn(({ text }) => reply({ id: 'c3', userId: 'me', text, timestamp: 3 }));
        const ui = loadCommentUi({ callable });
        ui.input.value = '쓰던 글';
        await ui.win.postQuickComment('p1', 1);
        expect(callable).toHaveBeenCalledWith({ postId: 'p1', text: 'gallery.comment.quick.yummy' });
        expect(ui.input.value).toBe('쓰던 글');
    });

    it('남의 글이고 아직 내가 댓글을 달지 않았을 때만 보인다', () => {
        const ui = loadCommentUi({ callable: vi.fn() });
        const fn = vm.runInContext('shouldShowQuickComments', ui.sandbox);
        expect(fn({ data: { userId: 'u2', comments: [] } }, 'me')).toBe(true);
        expect(fn({ data: { userId: 'me', comments: [] } }, 'me')).toBe(false);
        expect(fn({ data: { userId: 'u2', comments: [{ userId: 'me' }] } }, 'me')).toBe(false);
    });
});

describe('화면 코드 모양', () => {
    const app = read('js/app-core.js');

    it('흐린 댓글은 지우기·신고·답글 단추 없이 「올리는 중」으로 그린다', () => {
        const render = app.slice(app.indexOf('function buildCommentItemHtml('));
        const pendingBranch = render.slice(render.indexOf('if (c.pending)'), render.indexOf('const timeStr'));
        expect(pendingBranch).toContain('is-pending');
        expect(pendingBranch).toContain("t('gallery.comment.posting')");
        ['deleteComment', 'reportComment', 'startCommentReply'].forEach((name) => expect(pendingBranch).not.toContain(name));
    });

    it('카드를 처음 그릴 때와 다시 그릴 때 같은 댓글 줄을 쓴다', () => {
        const card = app.slice(app.indexOf('function buildGalleryCard(item, myId)'));
        expect(card.slice(0, 9000)).toContain('buildCommentItemHtml(');
        expect(card.slice(0, 12000)).toContain('buildQuickCommentRowHtml(');
    });

    it('알림 주소(focus=gallery-post&post&comment&reply)를 읽어 그 글을 열고, 주소를 지운다', () => {
        expect(app).toContain("post: String(url.searchParams.get('post') || '').trim()");
        expect(app).toContain("reply: String(url.searchParams.get('reply') || '').trim()");
        expect(app).toMatch(/'shareFrom', 'post', 'comment', 'reply'/);
        const handler = app.slice(app.indexOf("if (params.focus === 'gallery-post' && params.post)"));
        expect(handler.slice(0, 400)).toContain('openGalleryPostFromNotification({ postId: params.post, commentId: params.comment, reply: params.reply === \'1\' })');
    });

    it('앱을 열 때 받은 댓글을 확인하고, 댓글 알림 설정을 그린다', () => {
        expect(app).toContain('checkGalleryCommentNotifications(user.uid).catch(() => {});');
        expect(app).toContain('window.renderCommentPushPreference?.(ud.settings);');
        expect(app).toContain("settings: { commentPushOptOut: !wantsPush }");
    });

    it('포인트 내역에서 댓글 포인트를 따로 이름 붙인다', () => {
        expect(app).toContain("const isComment = entry.kind === 'comment';");
        expect(app).toContain("t('assets.history.commentSent')");
        expect(app).toContain("t('assets.history.commentReceived')");
    });

    it('한국어·영어 문구와 설정 단추가 모두 있다', () => {
        const keys = [
            'gallery.comment.posting', 'gallery.comment.addFailedReason', 'gallery.comment.offline', 'gallery.comment.retryLater',
            'gallery.comment.reply', 'gallery.comment.pointsEarned', 'gallery.comment.postGone',
            'gallery.comment.quick.great', 'gallery.comment.quick.yummy', 'gallery.comment.quick.steady', 'gallery.comment.quick.metoo',
            'gallery.activity.open', 'gallery.activity.title', 'gallery.activity.commented', 'gallery.activity.replied',
            'gallery.activity.toastComment', 'gallery.activity.toastReply', 'gallery.activity.toastMany',
            'profile.commentPush.title', 'profile.commentPush.desc', 'profile.commentPush.on', 'profile.commentPush.off',
            'assets.history.comment', 'assets.history.commentSent', 'assets.history.commentReceived',
        ];
        keys.forEach((key) => {
            expect(read('js/i18n-ko.js')).toContain(`'${key}':`);
            expect(read('js/i18n-en.js')).toContain(`'${key}':`);
        });
        expect(read('index.html')).toContain('id="comment-push-toggle"');
        expect(read('en/index.html')).toContain('id="comment-push-toggle"');
    });

    it('잠긴 단추·흐린 댓글·답글·빠른 댓글 모양이 있고 다크 모드도 있다', () => {
        const css = read('styles-features.css');
        expect(css).toMatch(/\.comment-submit-btn:disabled \{[^}]*opacity/);
        expect(css).toMatch(/\.comment-item\.is-pending \{[^}]*opacity/);
        ['.comment-reply-btn', '.comment-reply-to', '.comment-quick-chip', '.gallery-activity-item'].forEach((sel) => expect(css).toContain(sel));
        const dark = read('styles-dark-mode.css');
        ['body.dark-mode .comment-quick-chip', 'body.dark-mode .gallery-activity-item'].forEach((sel) => expect(dark).toContain(sel));
    });
});

// ── 서버: 가짜 Firestore(트랜잭션 포함) ─────────────────────────────────
function fakeDb(docs = {}) {
    const store = new Map(Object.entries(docs));
    const writes = [];
    let autoId = 0;
    const ref = (path) => ({
        path,
        get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    });
    const db = {
        writes,
        store,
        doc: (path) => ref(path),
        collection: (name) => ({ doc: () => ref(`${name}/auto${++autoId}`) }),
        runTransaction: async (fn) => {
            const pending = [];
            const tx = {
                get: async (r) => ({ exists: store.has(r.path), data: () => store.get(r.path) }),
                update: (r, data) => pending.push({ op: 'update', path: r.path, data }),
                set: (r, data, opts) => pending.push({ op: 'set', path: r.path, data, opts }),
                create: (r, data) => {
                    if (store.has(r.path)) throw new Error('ALREADY_EXISTS');
                    pending.push({ op: 'create', path: r.path, data });
                },
            };
            const result = await fn(tx);
            writes.push(...pending);
            return result;
        },
    };
    return db;
}

const { _test: server } = functionsRequire('./gallery-comments.js');
const call = (db, uid, data) => server.addGalleryCommentHandler({ auth: uid ? { uid } : undefined, data }, { db, now: Date.parse('2026-11-22T03:00:00Z') });
const notificationsOf = (db) => db.writes.filter((w) => w.path.startsWith('notifications/')).map((w) => ({ to: w.data.postOwnerId, type: w.data.type }));
const pointWrites = (db) => db.writes.filter((w) => w.path.startsWith('reaction_point_ledger/') || w.path.startsWith('comment_point_daily/') || (w.path.startsWith('users/') && w.data.coins));

describe('addGalleryComment 서버', () => {
    const post = (comments = []) => ({ 'gallery_posts/p1': { userId: 'owner', comments }, 'users/u1': { customDisplayName: '해빛' } });

    it('남의 글에 댓글: 저장하고, 글 주인에게 알림, 둘 다 +1P(원장·하루 횟수 함께)', async () => {
        const db = fakeDb(post());
        const result = await call(db, 'u1', { postId: 'p1', text: ' 맛있어\n보여요 ' });
        expect(result.comment).toMatchObject({ userId: 'u1', userName: '해빛', text: '맛있어 보여요' });
        expect(result.pointsAwarded).toBe(1);
        expect(notificationsOf(db)).toEqual([{ to: 'owner', type: 'gallery_comment' }]);
        const notif = db.writes.find((w) => w.path.startsWith('notifications/')).data;
        expect(notif).toMatchObject({ fromUserId: 'u1', fromUserName: '해빛', postId: 'p1', commentId: result.comment.id, preview: '맛있어 보여요' });
        const paths = pointWrites(db).map((w) => w.path);
        expect(paths).toEqual(expect.arrayContaining(['users/u1', 'users/owner', 'reaction_point_ledger/comment_p1_u1', 'comment_point_daily/u1_2026-11-22']));
        const ledger = db.writes.find((w) => w.path === 'reaction_point_ledger/comment_p1_u1').data;
        expect(ledger).toMatchObject({ kind: 'comment', reactorUserId: 'u1', postOwnerId: 'owner', date: '2026-11-22' });
    });

    it('내 글에 단 댓글은 알림도 포인트도 없다', async () => {
        const db = fakeDb({ 'gallery_posts/p1': { userId: 'u1', comments: [] }, 'users/u1': {} });
        const result = await call(db, 'u1', { postId: 'p1', text: '오늘도 해냈다' });
        expect(result.pointsAwarded).toBe(0);
        expect(notificationsOf(db)).toEqual([]);
        expect(pointWrites(db)).toEqual([]);
    });

    it('남의 댓글에 답글: 그 댓글 쓴 사람에게 답글 알림, 글 주인에게 댓글 알림', async () => {
        const db = fakeDb(post([{ id: 'c9', userId: 'u2', userName: '둘', text: 'hi' }]));
        const result = await call(db, 'u1', { postId: 'p1', text: '고마워요', replyToCommentId: 'c9' });
        expect(result.comment.replyTo).toEqual({ id: 'c9', userId: 'u2', userName: '둘' });
        expect(notificationsOf(db)).toEqual([{ to: 'u2', type: 'gallery_reply' }, { to: 'owner', type: 'gallery_comment' }]);
    });

    it('글 주인 댓글에 답글이면 글 주인에게 한 번(답글)만', async () => {
        const db = fakeDb(post([{ id: 'c1', userId: 'owner', userName: '주인', text: 'hi' }]));
        await call(db, 'u1', { postId: 'p1', text: '네 좋아요', replyToCommentId: 'c1' });
        expect(notificationsOf(db)).toEqual([{ to: 'owner', type: 'gallery_reply' }]);
    });

    it('글 주인이 남의 댓글에 답하면 그 사람에게만 알린다(포인트는 없다 — 내 글)', async () => {
        const db = fakeDb({ 'gallery_posts/p1': { userId: 'owner', comments: [{ id: 'c1', userId: 'u1', userName: '해빛' }] }, 'users/owner': {} });
        const result = await call(db, 'owner', { postId: 'p1', text: '고마워요!', replyToCommentId: 'c1' });
        expect(notificationsOf(db)).toEqual([{ to: 'u1', type: 'gallery_reply' }]);
        expect(result.pointsAwarded).toBe(0);
    });

    it('없어진 댓글에 답하면 그냥 댓글이 된다', async () => {
        const db = fakeDb(post());
        const result = await call(db, 'u1', { postId: 'p1', text: '안녕하세요', replyToCommentId: 'gone' });
        expect(result.comment.replyTo).toBeUndefined();
        expect(notificationsOf(db)).toEqual([{ to: 'owner', type: 'gallery_comment' }]);
    });

    it('포인트는 글마다 한 번, 하루 5번까지, 4글자 이상만', async () => {
        const again = fakeDb({ ...post(), 'reaction_point_ledger/comment_p1_u1': { kind: 'comment' } });
        expect((await call(again, 'u1', { postId: 'p1', text: '또 왔어요' })).pointsAwarded).toBe(0);

        const capped = fakeDb({ ...post(), 'comment_point_daily/u1_2026-11-22': { count: server.COMMENT_POINT_DAILY_LIMIT } });
        expect((await call(capped, 'u1', { postId: 'p1', text: '오늘 여섯 번째' })).pointsAwarded).toBe(0);

        const short = fakeDb(post());
        expect((await call(short, 'u1', { postId: 'p1', text: '굿 👍' })).pointsAwarded).toBe(0);
        expect(server.countVisibleChars('멋져요 👏')).toBe(4);
        expect((await call(fakeDb(post()), 'u1', { postId: 'p1', text: '멋져요 👏' })).pointsAwarded).toBe(1);
    });

    it('글이 없으면 not-found, 로그인 없으면 unauthenticated, 이상한 id 는 invalid-argument', async () => {
        await expect(call(fakeDb({ 'users/u1': {} }), 'u1', { postId: 'gone', text: 'hi' })).rejects.toMatchObject({ code: 'not-found' });
        await expect(call(fakeDb(), null, { postId: 'p1', text: 'hi' })).rejects.toMatchObject({ code: 'unauthenticated' });
        await expect(call(fakeDb(), 'u1', { postId: 'a/b', text: 'hi' })).rejects.toMatchObject({ code: 'invalid-argument' });
    });

    it('콜드 스타트 때 runtime.js 를 읽지 않고 이 함수만 내보낸다', () => {
        const out = execFileSync(process.execPath, ['-e', `
            const exported = require('./index.js');
            const loadedRuntime = Object.keys(require.cache).some((p) => p.endsWith('runtime.js') && !p.includes('node_modules'));
            process.stdout.write(JSON.stringify({ keys: Object.keys(exported), loadedRuntime }));
        `], {
            cwd: resolve(ROOT_DIR, 'functions'),
            encoding: 'utf8',
            env: { ...process.env, FUNCTION_TARGET: 'addGalleryComment', GCLOUD_PROJECT: 'demo-test' },
        });
        expect(JSON.parse(out)).toEqual({ keys: ['addGalleryComment'], loadedRuntime: false });
    }, 30000);

    it('배포 목록(전체)에 댓글 함수와 푸시 트리거가 있다', () => {
        const index = read('functions/index.js');
        expect(index.split('} else {')[1]).toContain('addGalleryComment,');
        const runtime = read('functions/runtime.js');
        expect(runtime).not.toContain('exports.addGalleryComment');
        expect(runtime).toContain('exports.sendGalleryCommentPush = onDocumentCreated(');
        expect(read('functions/gallery-comments.js')).not.toContain('require("./runtime")');
    });

    it('탈퇴하면 댓글 포인트 하루 횟수도 지운다', () => {
        expect(read('functions/account-deletion.js')).toContain('["comment_point_daily", "uid"]');
    });
});

// ── 푸시: 보낼지와 무엇을 보낼지 ───────────────────────────────────────
describe('댓글 푸시', () => {
    const push = functionsRequire('./gallery-comment-push.js');
    const notification = { type: 'gallery_comment', fromUserId: 'u1', fromUserName: '해빛', postId: 'p1', commentId: 'c1', preview: '맛있어 보여요' };
    const noonKst = Date.parse('2026-11-22T03:00:00Z');
    const lateKst = Date.parse('2026-11-22T14:30:00Z'); // 23:30 KST
    const earlyKst = Date.parse('2026-11-21T22:00:00Z'); // 07:00 KST

    it('보통은 보낸다', () => {
        expect(push.decideGalleryCommentPush({ notification, recipient: {}, now: noonKst }).action).toBe('send');
    });

    it('차단한 회원의 댓글이면 알림 문서까지 지운다', () => {
        expect(push.decideGalleryCommentPush({ notification, recipient: { blockedUsers: ['u1'] }, now: noonKst }).action).toBe('delete');
    });

    it('설정에서 껐으면 보내지 않는다', () => {
        expect(push.decideGalleryCommentPush({ notification, recipient: { settings: { commentPushOptOut: true } }, now: noonKst }))
            .toEqual({ action: 'skip', reason: 'opt-out' });
    });

    it('밤 10시~아침 8시(회원 시각)에는 깨우지 않는다', () => {
        expect(push.decideGalleryCommentPush({ notification, recipient: {}, now: lateKst }).reason).toBe('quiet-hours');
        expect(push.decideGalleryCommentPush({ notification, recipient: {}, now: earlyKst }).reason).toBe('quiet-hours');
        // 뉴욕 회원에게 한국 23:30 은 오전 9:30 — 보낸다.
        expect(push.decideGalleryCommentPush({ notification, recipient: { timeZone: 'America/New_York' }, now: lateKst }).action).toBe('send');
    });

    it('알림: 한국어·영어, 같은 글은 tag 가 같고, 「답글 달기」는 답글 입력칸을 준비하는 주소', () => {
        const buildPath = (locale, tab, extras) => `${locale === 'en' ? '/en' : '/'}?tab=${tab}&${new URLSearchParams(extras)}`;
        const ko = push.buildGalleryCommentPushPayload('ko', notification, buildPath);
        expect(ko.title).toBe('💬 해빛님이 댓글을 남겼어요');
        expect(ko.body).toBe('맛있어 보여요');
        expect(ko.tag).toBe('gallery-comment-p1');
        expect(ko.url).toContain('focus=gallery-post');
        expect(ko.url).toContain('post=p1');
        expect(ko.url).not.toContain('reply=1');
        expect(ko.actions[0]).toMatchObject({ action: 'reply', title: '답글 달기' });
        expect(ko.actions[0].url).toContain('reply=1');
        const en = push.buildGalleryCommentPushPayload('en', { ...notification, type: 'gallery_reply' }, buildPath);
        expect(en.title).toBe('↩️ 해빛 replied to your comment');
        expect(en.actions.map((a) => a.title)).toEqual(['Reply', 'View']);
    });
});
