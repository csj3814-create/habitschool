import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const ADMIN = readRepoFile('admin.html');
const RUNTIME = readRepoFile('functions/runtime.js');

// 제보를 읽은 자리에서 답할 수 없으면, 회원 목록에서 그 사람을 다시 찾아 상세를
// 열어야 한다. 그 사이에 답장이 미뤄진다.
describe('제보 카드에서 바로 답장', () => {
    it('회원을 알 수 있는 제보에만 버튼이 붙는다', () => {
        expect(ADMIN).toContain('window.toggleBugReply');
        expect(ADMIN).toContain('window.sendBugReply');
        // uid 가 없는 제보에는 버튼도 입력칸도 만들지 않는다.
        expect(ADMIN).toContain("${v.uid ? `<button type=\"button\" onclick=\"toggleBugReply(");
    });

    it('이미 있는 회원 메시지 경로를 쓴다', () => {
        // 새 전송 수단을 만들지 않는다 — 앱의 해빛 메시지로 그대로 간다.
        expect(ADMIN).toContain('submitAdminFeedbackCallable({ targetUid: item.uid, message })');
        expect(RUNTIME).toContain('exports.submitAdminFeedback = onCall(');
    });

    it('빈 내용과 1,000자 초과를 보내지 않는다', () => {
        const fn = ADMIN.split('window.sendBugReply = async function(id) {')[1];
        expect(fn).toContain("if (!message) { adminToast('보낼 내용을 입력해 주세요.', 'error')");
        expect(fn).toContain('if (message.length > 1000)');
    });

    it('실패를 삼키지 않는다', () => {
        const fn = ADMIN.split('window.sendBugReply = async function(id) {')[1].split('};')[0];
        expect(fn).toContain("adminToast('보내지 못했습니다: '");
        expect(fn).toContain("console.error('[sendBugReply] 실패:', e)");
    });

    it('보내고 처리 완료까지 한 번에 할 수 있다', () => {
        expect(ADMIN).toContain('input[data-close]');
        expect(ADMIN).toContain("await setBugReportStatus(id, 'done');");
    });
});
