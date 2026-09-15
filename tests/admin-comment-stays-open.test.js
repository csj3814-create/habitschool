import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = readFileSync(resolve(ROOT_DIR, 'admin.html'), 'utf8');

const submitFb = ADMIN.split('window.submitFb = async function() {')[1].split('\n    };')[0];
const closeModal = ADMIN.split('window.closeModal = function() {')[1].split('\n    };')[0];

// 2026-09-15 요청: "코멘트 전송하고 나서 다른 코멘트 보낼 수 있게 그 창에 있어줘.
// 지금은 밖으로 빠져나가게 되어 있음."
//
// 한 회원에게 이어서 더 쓸 일이 잦은데, 전송하면 모달이 닫히고 목록으로 나갔다.
// 같은 회원을 다시 찾아 들어와야 했다.
describe('sending a comment leaves the admin where they were', () => {
    it('does not close the modal on a successful send', () => {
        expect(submitFb).not.toContain('closeModal()');
        // 다음 코멘트를 바로 쓸 수 있게 두 칸을 비우고 본문으로 커서를 옮긴다.
        expect(submitFb).toContain("document.getElementById('fb-text').value = '';");
        expect(submitFb).toContain("document.getElementById('fb-summary').value = '';");
        expect(submitFb).toContain("document.getElementById('fb-text').focus();");
    });

    it('defers the member-list reload until the modal actually closes', () => {
        // 전송할 때마다 목록을 다시 읽으면 모달 뒤에서 표가 새로 그려진다.
        expect(submitFb).not.toContain('loadMembers()');
        expect(submitFb).toContain('membersNeedReload = true;');
        expect(closeModal).toContain('if (membersNeedReload)');
        expect(closeModal).toContain('loadMembers();');
        expect(closeModal).toContain("tabLoaded['members'] = false;");
    });

    it('shows what already went out so the same thing is not sent twice', () => {
        expect(ADMIN).toContain('<div id="fb-sent" class="fb-sent" hidden></div>');
        expect(submitFb).toContain('appendSentFeedback(summary, msg);');
        expect(ADMIN).toContain('function appendSentFeedback(summary, message) {');
        // 회원이 쓴 값이 그대로 들어가는 자리다.
        expect(ADMIN).toContain('escapeHtml(message)');
        expect(ADMIN).toContain("escapeHtml(summary || '(요약 없음)')");
    });

    it('never carries one member\'s sent list over to the next', () => {
        const openDetail = ADMIN.split('window.openDetail = async function(uid) {')[1].split('\n        try {')[0];
        expect(openDetail).toContain('clearSentFeedback();');
        expect(closeModal).toContain('clearSentFeedback();');
    });

    it('still reports a failure instead of pretending it sent', () => {
        expect(submitFb).toContain("adminToast('전송 실패: '+e.message, 'error')");
        // 실패했는데 입력이 지워지면 다시 쓸 수 없다 — 비우는 일은 성공 경로에만 있어야 한다.
        const success = submitFb.split('catch(e)')[0];
        const failure = submitFb.split('catch(e)')[1];
        expect(success).toContain("document.getElementById('fb-text').value = '';");
        expect(failure).not.toContain("document.getElementById('fb-text').value = '';");
    });
});
