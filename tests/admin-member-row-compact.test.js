import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = readFileSync(resolve(ROOT_DIR, 'admin.html'), 'utf8');

// 2026-09-14 요청: "회원당 깔끔하게 한줄에 나오게 해 줘. 미활동 이메일 정보 다
// 보여줄 필요 없잖아?" — 목록 칸이 제목·요약·본문 HTML 미리보기까지 그리고 있어서
// 회원 한 명이 화면 한 통을 차지했다. 같은 내용이 상세 모달에 이미 다 있었다.
describe('one member, one row', () => {
    it('shows only whether a mail went out and when', () => {
        const fn = ADMIN.split('function renderMemberEmailCell(')[1].split('\n    }\n')[0];
        expect(fn).toContain('renderMemberEmailTag');
        // 목록에서 제목·요약·본문을 다시 그리지 않는다.
        expect(fn).not.toContain('entry.html');
        expect(fn).not.toContain('entry.summary');
        expect(fn).not.toContain('<details');

        const tag = ADMIN.split('function renderMemberEmailTag(')[1].split('\n    }\n')[0];
        expect(tag).toContain('entry.days');
        // 자세한 것은 마우스를 올리면 나온다 — 줄을 늘리지 않고도 알 수 있다.
        expect(tag).toContain('title="${escapeHtml(title)}"');
        expect(tag).toContain('entry.subject');
    });

    it('still keeps the full history one click away', () => {
        // 목록에서 덜어낸 것은 없애는 게 아니라 상세로 옮긴 것이다.
        expect(ADMIN).toContain('📧 3일 / 7일 미활동 이메일 이력');
        expect(ADMIN).toContain('renderEmailAuditCard(normalizedLog.byDays.day3, 3, email)');
        expect(ADMIN).toContain('renderEmailAuditCard(normalizedLog.byDays.day7, 7, email)');
    });

    it('says nothing sent instead of leaving the cell blank', () => {
        const fn = ADMIN.split('function renderMemberEmailCell(')[1].split('\n    }\n')[0];
        expect(fn).toContain("'<span class=\"member-cell-empty\">–</span>'");
        expect(ADMIN).toContain('.member-cell-empty');
    });

    it('lets no cell wrap onto a second line', () => {
        // '206일 경과' 가 한 글자씩 세로로 쌓이고 '🔍 상세' 도 두 줄이 됐다.
        expect(ADMIN).toContain('#member-tbody td { white-space: nowrap; }');
        expect(ADMIN).toContain('#member-tbody .badge { white-space: nowrap; }');
        expect(ADMIN).toContain('#member-tbody .btn-view { white-space: nowrap; }');
    });

    it('clips a long name and address instead of folding them', () => {
        for (const cls of ['.member-name-cell', '.member-email-address']) {
            const rule = ADMIN.split(`${cls} {`)[1].split('}')[0];
            expect(rule, cls).toContain('overflow: hidden');
            expect(rule, cls).toContain('text-overflow: ellipsis');
            expect(rule, cls).toContain('max-width');
        }
        // 잘린 글자는 마우스를 올리면 전부 보인다.
        expect(ADMIN).toContain('<td class="member-name-cell" title="${escapeHtml(r.name)}">');
        expect(ADMIN).toContain('<td class="member-email-address" title="${escapeHtml(r.email)}">');
    });

    it('drops the badge that said the same thing twice', () => {
        // 이름 옆 📧N일전 배지는 '미활동 이메일' 칸과 같은 말이고, 이름 칸을 늘렸다.
        expect(ADMIN).not.toContain('emailBadge');
    });

    it('leaves no dead renderer behind', () => {
        // 안 쓰는 함수를 남겨 두면 다음 사람이 '이게 쓰이나' 를 다시 확인해야 한다.
        expect(ADMIN).not.toContain('renderMemberEmailItem');
        expect(ADMIN).not.toContain('member-email-stack');
        expect(ADMIN).not.toContain('member-email-preview');
    });

    it('keeps the header and the loading colspan in step', () => {
        // 관제탑에는 표가 여럿이다. 회원 표의 헤더만 본다.
        const beforeBody = ADMIN.split('id="member-tbody"')[0];
        const head = beforeBody.split('<thead><tr>').pop().split('</tr></thead>')[0];
        const columns = (head.match(/<th/g) || []).length;
        expect(columns).toBe(13);
        expect(ADMIN).toContain('colspan="13"');
    });
});

// 2026-09-15 요청: "스크롤 바 안 생기게 해 봐"
// nowrap 을 걸었더니 표가 1175px 를 요구했다. .wrap(1200) 에서 .box 여백(40)을 빼면
// 자리는 1160px 뿐이라 가로 스크롤바가 생겼다. 브라우저에서 직접 재며 줄였다 —
// 여백 3px(칸 13개 = 78px), 헤더 글자, 이름·이메일 최대 너비. 최소 1125px 이 됐다.
describe('the member table fits without a horizontal scrollbar', () => {
    it('gives this table its own tighter padding', () => {
        expect(ADMIN).toContain('<table id="member-table">');
        expect(ADMIN).toContain('#member-table th, #member-table td { padding: 7px 6px; }');
    });

    it('shortens headers that were wider than anything under them', () => {
        const head = ADMIN.split('id="member-tbody"')[0].split('<thead><tr>').pop().split('</tr></thead>')[0];
        for (const label of ['기록일 ↕', '포인트 ↕', '발행 HBT ↕', '온체인', '혈당 ↕', '재참여 메일']) {
            expect(head, label).toContain(`>${label}<`);
        }
        for (const gone of ['최근 기록일 ↕', '현재 포인트 ↕', '누적 발행 HBT ↕', '온체인 HBT', '공복혈당 ↕', '미활동 이메일<']) {
            expect(head, gone).not.toContain(gone);
        }
    });

    it('keeps the meaning in a tooltip when the label is cut', () => {
        const head = ADMIN.split('id="member-tbody"')[0].split('<thead><tr>').pop().split('</tr></thead>')[0];
        expect(head).toContain('title="현재 보유 포인트"');
        expect(head).toContain('title="지갑의 실제 온체인 잔액"');
        expect(head).toContain('title="공복혈당"');
        expect(head).toContain('title="3일 / 7일 미활동 재참여 메일 발송 기록"');
        // 발행 HBT 의 설명은 원래 있던 것을 그대로 지킨다.
        expect(head).toContain('앱이 발행해 준 누계입니다');
    });

    it('caps the two widest cells so the table stays inside the page', () => {
        // 측정: 이 두 칸이 표에서 가장 넓다. 여기서 넘치면 스크롤바가 돌아온다.
        expect(ADMIN).toContain('.member-name-cell { font-weight: bold; max-width: 110px;');
        expect(ADMIN).toContain('.member-email-address { font-size: 11px; color: #888; max-width: 150px;');
    });

    it('still scrolls rather than breaking on a narrow window', () => {
        // 좁은 화면에서까지 안 생기게 만들 수는 없다. 그때는 잘리지 말고 스크롤돼야 한다.
        expect(ADMIN).toContain('.box { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); overflow-x: auto;');
    });
});
