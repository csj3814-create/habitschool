import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const INDEX = readRepoFile('index.html');
const AUTH = readRepoFile('js/auth.js');
const LE8 = readRepoFile('js/le8-score.js');

// 건강습관 점수의 빈 항목은 눌러서 해당 입력칸으로 갈 수 있다. 그런데 흡연·키·
// 콜레스테롤 칸은 건강정보 동의 전에는 통째로 hidden 이라, 데려가도 화면이 그대로였다.
// 감춰진 요소는 스크롤도 포커스도 받지 않는다 — 사용자에게는 "눌러도 입력이 안 되는" 앱.
describe('a blank score item never leads to a hidden field', () => {
    it('keeps the smoking and cholesterol fields inside the consent group', () => {
        // 이 결합이 사라지면 아래 우회로도 필요 없어진다. 지금은 있다는 사실을 못박아 둔다.
        const group = INDEX.split('id="sensitive-consent-cards"')[1].split('/#sensitive-consent-cards')[0];
        expect(group).toContain('id="smoking-status-group"');
        expect(group).toContain('id="prof-total-chol"');
        expect(group).toContain('id="prof-height"');
    });

    it('hands off to the gate when the field is not on screen', () => {
        const fn = LE8.split('function focusLE8Field(tab, focusId) {')[1].split('\n}\n')[0];
        expect(fn).toContain('el.offsetParent === null && window.revealSensitiveField?.(el)');
        // 넘긴 뒤에는 감춰진 칸을 향한 스크롤·포커스를 시도하지 않는다.
        const handoff = fn.indexOf('window.revealSensitiveField');
        expect(handoff).toBeGreaterThan(-1);
        expect(handoff).toBeLessThan(fn.indexOf('scrollIntoView'));
    });

    it('opens the consent notice instead of the locked field', () => {
        const fn = AUTH.split('window.revealSensitiveField = function (el) {')[1].split('\n};')[0];
        expect(fn).toContain('gate.hidden = false;');
        expect(fn).toContain('gate.open = true;');
        expect(fn).toContain('gate.scrollIntoView(');
        expect(fn).toContain("gate.classList.add('le8-needs-input');");
        // 왜 아무 칸도 열리지 않았는지 말해 준다. 조용히 끝내면 고장으로 읽힌다.
        expect(fn).toContain('showToast(');
    });

    it('stays out of the way when the field is hidden for another reason', () => {
        const fn = AUTH.split('window.revealSensitiveField = function (el) {')[1].split('\n};')[0];
        expect(fn).toContain('if (!cards.contains(el) || !cards.hidden) return false;');
        expect(fn).toContain('return true;');
    });

    it('says on the collapsed line that smoking and cholesterol are behind it', () => {
        // 잠긴 줄이 "체성분·약물·혈액검사"만 말하면, 흡연 칸을 찾는 사람은 여기를 열어 보지 않는다.
        const summary = INDEX.split('class="sensitive-gate-summary"')[1].split('</summary>')[0];
        expect(summary).toContain('흡연');
        expect(summary).toContain('콜레스테롤');
    });
});
