import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const INDEX = readRepoFile('index.html');
const AUTH = readRepoFile('js/auth.js');

// 체성분·복용 약물·혈액검사는 전부 같은 하나의 선택 동의로 열린다. 그런데 카드마다
// 잠금 안내가 따로 붙어, 쓰지 않기로 한 사람에게 같은 말이 세 번 나오며 프로필의
// 큰 부분을 차지했다. 하나로 묶는다.
describe('the three health-data cards share one gate', () => {
    it('wraps them in a single group', () => {
        expect(INDEX).toContain('id="sensitive-consent-group"');
        expect(INDEX).toContain('id="sensitive-group-gate"');
        expect(INDEX).toContain('id="sensitive-consent-cards"');
    });

    it('keeps all three inside that group', () => {
        const group = INDEX.split('id="sensitive-consent-cards"')[1].split('/#sensitive-consent-cards')[0];
        for (const label of ['체성분', '복용 약물', '혈액검사']) {
            expect(group, `${label} should be inside the group`).toContain(`data-sensitive-card="${label}"`);
        }
    });

    it('names all three in the one collapsed line', () => {
        // 접힌 줄만 보고도 무엇이 잠겨 있는지 알아야 한다.
        expect(INDEX).toContain('체성분 · 복용 약물 · 혈액검사');
    });

    it('opens the whole group rather than card by card', () => {
        const fn = AUTH.split('window.applySensitiveConsentGate = function () {')[1].split('\n};')[0];
        expect(fn).toContain('groupGate.hidden = agreed;');
        expect(fn).toContain('groupCards.hidden = !agreed;');
    });

    it('shows one revoke button, not three', () => {
        const fn = AUTH.split('window.applySensitiveConsentGate = function () {')[1].split('\n};')[0];
        expect(fn).toContain("let revoke = group.querySelector(':scope > .sensitive-revoke-row');");
        // 묶음 안의 카드는 개별 게이트를 만들지 않는다.
        expect(fn).toContain('if (groupCards && groupCards.contains(card)) {');
        expect(fn).toContain('card.classList.remove(\'is-locked\');');
    });

    it('does not leave the notice expanded after consenting', () => {
        const fn = AUTH.split('window.applySensitiveConsentGate = function () {')[1].split('\n};')[0];
        expect(fn).toContain('if (agreed) groupGate.open = false;');
    });

    it('still handles a sensitive card left outside the group', () => {
        // 나중에 묶음 밖에 카드가 생겨도 조용히 노출되지 않도록 예전 경로를 남긴다.
        const fn = AUTH.split('window.applySensitiveConsentGate = function () {')[1].split('\n};')[0];
        expect(fn).toContain("document.querySelectorAll('[data-sensitive-card]').forEach((card) => {");
        expect(fn).toContain('gate = buildSensitiveGateElement(label);');
    });
});
