import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const ADMIN = readRepoFile('admin.html');

// 관제탑은 한 자리에서 여러 건을 연달아 처리하는 화면이다. 결과를 알려주려고
// 페이지 전체를 멈춰 세우는 대화상자는 그 자체가 작업 비용이고, 브라우저 자동화에서는
// 아예 화면을 잠가 버린다. 알림은 화면 안에서 뜨고 스스로 사라진다.
describe('the control tower reports results without blocking the page', () => {
    it('has no alert() left in it', () => {
        expect(ADMIN).not.toContain('alert(');
    });

    it('has somewhere for the notices to land', () => {
        expect(ADMIN).toContain('id="toast-host"');
        expect(ADMIN).toContain('aria-live="polite"');
        expect(ADMIN).toContain('window.adminToast = function (message, type =');
    });

    it('keeps a long notice on screen longer than a short one', () => {
        // "완료" 한 줄과 열 줄짜리 집계 결과가 같은 시간만 떠 있으면 둘 중 하나는 틀렸다.
        const fn = ADMIN.split('window.adminToast = function (message, type =')[1].split('\n    };')[0];
        expect(fn).toContain('text.length');
        expect(fn).toContain('el.onclick = () => el.remove();');
        // 알림 자리를 못 찾았다고 알림을 삼키지 않는다.
        expect(fn).toContain('console.log(`[toast:${type}]`, text);');
    });

    it('marks a failure as a failure', () => {
        // 색과 스크린리더 역할이 둘 다 달라야 한다. 실패가 성공과 같은 모습이면 안 된다.
        expect(ADMIN).toContain('.toast.error { border-left-color: var(--danger); }');
        expect(ADMIN).toContain("el.setAttribute('role', type === 'error' ? 'alert' : 'status');");
        expect(ADMIN).toContain("adminToast('조정 실패: ' + (e.message || e), 'error');");
    });

    it('still asks before doing something irreversible', () => {
        // confirm 은 답을 받아야 하는 자리다. 토스트로 바꾸면 묻지도 않고 지워 버리게 된다.
        expect(ADMIN).toContain('if (!confirm(');
    });
});
