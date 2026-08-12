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
        const record = AUTH.split('function buildSignupConsentRecord() {')[1].split('\n}')[0];
        expect(record).toContain('const selection = resolveConsentSelection();');
        // DOM 을 직접 읽으면 리디렉트 뒤에 전부 false 가 된다.
        expect(record).not.toContain('readConsentCheckbox(');
    });

    it('records every consent from the same resolved selection', () => {
        const record = AUTH.split('function buildSignupConsentRecord() {')[1].split('\n}')[0];
        for (const key of ['consent-terms', 'consent-privacy', 'consent-age', 'consent-sensitive']) {
            expect(record).toContain(`selection['${key}'] === true`);
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

describe('someone who already agreed is not asked again', () => {
    it('remembers acceptance once the sign-in completes', () => {
        expect(AUTH).toContain('function rememberAcceptedConsent()');
        expect(AUTH).toContain('rememberAcceptedConsent();');
        // 역할이 끝난 임시 스냅샷은 치운다.
        expect(AUTH).toContain('clearConsentSelectionSnapshot();');
    });

    it('hides the box but leaves it in the DOM', () => {
        // 없애 버리면 buildSignupConsentRecord 가 읽을 것이 사라져 동의 기록이 빈다.
        const restore = AUTH.split('function restoreConsentSelection() {')[1].split('\n}\n')[0];
        expect(restore).toContain('box.hidden = true;');
        expect(restore).toContain("box.setAttribute('aria-hidden', 'true');");
        expect(restore).not.toContain('.remove()');
    });

    it('keeps the optional choice as it was, rather than assuming yes', () => {
        // 필수는 되살리되 민감정보는 거부했으면 거부한 대로 둔다.
        const restore = AUTH.split('function restoreConsentSelection() {')[1].split('\n}\n')[0];
        expect(restore).toContain('box.querySelectorAll(\'input[data-consent-required="true"]\').forEach((el) => { el.checked = true; });');
        expect(restore).toContain('sensitiveBox.checked = accepted.sensitive === true;');
    });

    it('asks again when the documents change', () => {
        // 저장된 버전이 현재 문서 버전과 다르면 없는 것으로 친다.
        expect(AUTH).toContain('function readAcceptedConsent()');
        const read = AUTH.split('function readAcceptedConsent() {')[1].split('\n}')[0];
        expect(read).toContain('stored.version !== CONSENT_DOC_VERSION');
    });
});
