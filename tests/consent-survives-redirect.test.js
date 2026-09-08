import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 증상: 동의 네 줄은 잘 나오는데 로그인이 안 되고, "로그인 확인 중..." 뒤에 다시
// 로그인 화면으로 돌아온다.
//
// 리디렉트 로그인은 구글을 다녀오면서 페이지를 통째로 새로 띄운다. 돌아온 화면의
// 체크박스는 전부 풀려 있고, 그 상태에서 두 가지가 벌어졌다.
//  1) 신규 회원의 동의 기록이 바로 그 시점에 만들어진다. 분명히 동의하고 가입한
//     사람의 기록에 '동의 안 함'이 박힌다. 법적 기록이 거짓이 된다.
//  2) 필수 체크가 풀렸으니 시작 버튼이 잠긴 채로 남아, 되돌아온 것처럼 보인다.

const AUTH = readRepoFile('js/auth.js');

describe('a consent choice survives the trip to Google and back', () => {
    it('is saved before the redirect takes the page away', () => {
        expect(AUTH).toContain('function persistConsentSelectionSnapshot()');
        // 저장은 반드시 signInWithRedirect 보다 앞서야 한다. 뒤면 이미 늦는다.
        const handler = AUTH.split("loginBtn.addEventListener('click', () => {")[1].split('\n    });')[0];
        const saveAt = handler.indexOf('persistConsentSelectionSnapshot();');
        const redirectAt = handler.indexOf('signInWithRedirect(');
        expect(saveAt).toBeGreaterThan(-1);
        expect(redirectAt).toBeGreaterThan(-1);
        expect(saveAt).toBeLessThan(redirectAt);
    });

    it('is what the consent record is built from when the page came back empty', () => {
        expect(AUTH).toContain('function resolveConsentSelection()');
        // 화면에 하나라도 체크돼 있으면 그게 방금 한 선택이고, 전부 비었으면 리디렉트를
        // 다녀온 것이다.
        expect(AUTH).toContain('if (Object.values(live).some(Boolean)) return live;');
        expect(AUTH).toContain('return readConsentSelectionSnapshot() || live;');
        // 기록 만들기는 가입과 개정 재동의가 함께 쓰는 buildConsentRecordFromSelection
        // 으로 뽑았다. 가입 경로는 여전히 스냅샷으로 되살린 선택을 넘긴다.
        const record = AUTH.split('function buildSignupConsentRecord() {')[1].split('\n}')[0];
        expect(record).toContain('buildConsentRecordFromSelection(resolveConsentSelection())');
        // DOM 을 직접 읽으면 리디렉트 뒤에 전부 false 가 된다.
        expect(record).not.toContain('readConsentCheckbox(');
    });

    it('records every consent from the same resolved selection', () => {
        const builder = AUTH.split('function buildConsentRecordFromSelection(selection = {}) {')[1].split('\n}')[0];
        for (const key of ['consent-terms', 'consent-privacy', 'consent-age', 'consent-sensitive']) {
            expect(builder).toContain(`selection['${key}'] === true`);
        }
    });

    it('restores the checkboxes so the start button is not left locked', () => {
        expect(AUTH).toContain('function restoreConsentSelection()');
        expect(AUTH).toContain('restoreConsentSelection();');
        const restore = AUTH.split('function restoreConsentSelection() {')[1].split('\n}\n')[0];
        expect(restore).toContain('readConsentSelectionSnapshot()');
        expect(restore).toContain('syncSignupConsentState();');
    });

    it('is version-stamped, so a snapshot from an older document is ignored', () => {
        expect(AUTH).toContain('if (!stored || stored.version !== CONSENT_DOC_VERSION) return null;');
    });
});

describe('the login screen always asks, because it cannot know who is signing in', () => {
    // 2026-09-08: 예전에는 "이미 동의한 브라우저" 표시가 있으면 상자를 감추고
    // 필수 항목을 미리 체크했다. 그 표시는 localStorage 에 브라우저 단위로 남고
    // 로그아웃해도 지워지지 않았다. 그래서 로그아웃한 기기에서 다른 사람이
    // 가입하면 동의 화면을 아예 못 보고, **앞사람의 선택으로 그 사람의 동의
    // 기록이 만들어졌다.** 화면이 비는 것보다 기록이 거짓인 쪽이 더 큰 문제다.
    it('never hides the consent box on the login screen', () => {
        const restore = AUTH.split('function restoreConsentSelection() {')[1].split('\n}\n')[0];
        expect(restore).not.toContain('box.hidden = true;');
        expect(restore).not.toContain("box.setAttribute('aria-hidden', 'true');");
    });

    it('never pre-ticks the required boxes from a stored flag', () => {
        // 미리 체크된 동의는 본인이 한 동의가 아니다.
        const restore = AUTH.split('function restoreConsentSelection() {')[1].split('\n}\n')[0];
        expect(restore).not.toContain('readAcceptedConsent()');
        expect(restore).not.toContain('el.checked = true;');
    });

    it('clears the browser-level flag on sign-out', () => {
        // 다음에 로그인할 사람이 같은 사람이라는 보장이 없다.
        expect(AUTH).toContain('function clearAcceptedConsent()');
        const logout = AUTH.split('window.logoutAndReset = async function () {')[1].split('\n};')[0];
        expect(logout).toContain('clearAcceptedConsent();');
        expect(logout).toContain('clearConsentSelectionSnapshot();');
    });

    it('still records that acceptance happened, stamped with the document version', () => {
        // 기록은 남긴다 — 언제 어느 판본에 동의했는지는 나중에 확인할 수 있어야 한다.
        expect(AUTH).toContain('function rememberAcceptedConsent(selection = null)');
        expect(AUTH).toContain('rememberAcceptedConsent();');
        expect(AUTH).toContain('version: CONSENT_DOC_VERSION,');
        expect(AUTH).toContain('clearConsentSelectionSnapshot();');
    });
});
