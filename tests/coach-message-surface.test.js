import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdminPrescriptionDrafts } from '../js/admin-utils.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const app = read('js/app-core.js');
const auth = read('js/auth.js');
const html = read('index.html');
const admin = read('admin.html');
const runtime = read('functions/runtime.js');

// 2026-09-15: "이렇게 긴 메세지가 앱에 다 표출이 돼? 메세지는 더 짧게, 보여주는 건
// 어디 어떻게 보여주고 어떻게 다시 볼 수 있게 할 건지도 설계해야 할 듯."
//
// 받는 쪽을 안 보고 만든 것이 맞았다. 카드는 대시보드 맨 위 한 칸이고, 3일 뒤
// 사라지며, 지난 메시지를 다시 볼 곳이 없었다.
describe('a coach message fits the card it lands in', () => {
    it('comes in two layers — a headline and a body', () => {
        const drafts = buildAdminPrescriptionDrafts({
            name: '루미나',
            logs: [{ date: '2026-09-12', metrics: { glucose: 141 } }],
            streak: 157,
            todayStr: '2026-09-15',
        });
        expect(drafts.length).toBeGreaterThan(0);
        for (const draft of drafts) {
            expect(draft.summary, draft.key).toBeTruthy();
            // 요약은 카드 머리 한 줄이다. 서버도 60자에서 자른다.
            expect(draft.summary.length, draft.key).toBeLessThanOrEqual(60);
            // 본문은 두 줄로 접힌다. 길면 '더 보기' 뒤로 숨어 안 읽힌다.
            expect(draft.message.length, draft.key).toBeLessThanOrEqual(200);
        }
    });

    it('lets the server take and store the headline', () => {
        const fn = runtime.split('exports.submitAdminFeedback')[1].split('\n);\n')[0];
        expect(fn).toContain('request.data?.summary');
        expect(fn).toContain('요약은 60자를 넘을 수 없습니다');
        expect(fn).toContain('adminFeedbackSummary: summary');
        // 보관함이 읽는 쪽에도 남아야 한다.
        expect(fn).toContain('summary,');
        // 예전 메시지에는 요약이 없다. 본문 첫 문장을 대신 쓴다.
        expect(fn).toContain('rawSummary || message.split');
    });

    it('gives the admin a place to write it', () => {
        expect(admin).toContain('id="fb-summary"');
        expect(admin).toContain('maxlength="60"');
        expect(admin).toContain('message: msg, summary, draftKey: pendingDraftKey }');
        // 초안을 누르면 두 칸이 함께 채워진다.
        expect(admin).toContain('quickMsg(draft.message, draft.summary, draft.key)');
    });
});

describe('the card shows a headline, two lines, and a way back', () => {
    it('clamps the body to two lines and offers the rest', () => {
        expect(html).toContain('id="admin-feedback-summary"');
        expect(html).toContain('class="coach-msg-text is-clamped"');
        expect(read('styles-features.css')).toContain('-webkit-line-clamp: 2;');
        // 두 줄에 다 들어가면 '더 보기'를 띄울 이유가 없다.
        const fn = app.split('window.showCoachMessage = function (')[1].split('\n};\n')[0];
        expect(fn).toContain('moreBtn.hidden = textEl.scrollHeight <= textEl.clientHeight + 1;');
    });

    it('falls back to the first sentence for messages sent before summaries existed', () => {
        const fn = app.split('window.showCoachMessage = function (')[1].split('\n};\n')[0];
        expect(fn).toContain("String(summary || '').trim() || bodyText.split(");
    });

    it('folds instead of vanishing when the member presses the close button', () => {
        // "다 읽고 x 누른 경우는 접어놓도록" — 사라지면 다시 부를 방법이 없다.
        const fn = app.split('window.hideFeedback = function () {')[1].split('\n};\n')[0];
        expect(fn).toContain("box.classList.toggle('is-collapsed')");
        expect(fn).not.toContain("style.display = 'none'");
        // 다시 펴면 표식도 지운다 — 접힘은 상태이지 삭제가 아니다.
        expect(fn).toContain('localStorage.removeItem(key)');
        const css = read('styles-features.css');
        expect(css).toContain('#admin-feedback-box.is-collapsed .coach-msg-body { display: none; }');
    });

    it('stays up for a week now that nothing is lost when it goes', () => {
        expect(auth).toContain('diffDays <= 7');
        expect(auth).not.toContain('diffDays <= 3');
        expect(admin).toContain('7일간 노출되고, 지난 메시지에 남습니다');
    });

    it('remembers the fold per message, not per member', () => {
        expect(auth).toContain('localStorage.getItem(`hide_fb_${user.uid}_${ud.feedbackDate}`)');
        expect(app).toContain('`hide_fb_${user.uid}_${feedbackDate}`');
    });
});

describe('past messages can be read again', () => {
    const fn = app.split('window.openCoachMessageArchive = async function () {')[1].split('\n};\n')[0];

    it('reads the collection the server was already filling', () => {
        // 새 컬렉션을 만들 이유가 없다. admin_feedback 이 발송마다 한 건씩 쌓고,
        // 규칙이 본인 읽기를 이미 허용한다.
        expect(fn).toContain("collection(db, 'admin_feedback')");
        expect(fn).toContain("where('targetUserId', '==', user.uid)");
        const rules = read('firestore.rules');
        expect(rules).toContain('resource.data.targetUserId == request.auth.uid');
    });

    it('sorts on screen so no composite index is needed', () => {
        expect(fn).not.toContain('orderBy(');
        expect(fn).toContain('items.sort(');
        expect(read('firestore.indexes.json')).not.toContain('admin_feedback');
    });

    it('tells an empty archive apart from a failed one', () => {
        expect(fn).toContain('아직 받은 메시지가 없습니다');
        expect(fn).toContain('메시지를 불러오지 못했습니다');
        expect(fn).toContain('console.error(');
    });

    it('is reachable from the card', () => {
        expect(html).toContain('onclick="openCoachMessageArchive()"');
        expect(html).toContain('id="coach-archive-modal"');
    });
});
