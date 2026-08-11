import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readRepo = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 개인정보 보호법 제22조는 "로그인하면 동의한 것으로 본다"를 동의로 인정하지 않고,
// 제23조는 건강정보 같은 민감정보를 다른 항목과 묶어서 받는 것을 금지한다.
// 예전 화면에는 "동의하는 것으로 간주합니다" 한 줄뿐이었다.
describe('signup consent', () => {
    const html = readRepo('index.html');
    const auth = readRepo('js/auth.js');

    it('asks instead of assuming', () => {
        expect(html).not.toContain('동의하는 것으로 간주합니다');
        expect(html).toContain('id="signup-consent-box"');
        expect(html).toContain('id="consent-terms"');
        expect(html).toContain('id="consent-privacy"');
    });

    it('keeps health data as its own separate consent', () => {
        // 민감정보는 별도 동의여야 하고, 거부해도 가입은 돼야 한다(선택).
        expect(html).toContain('id="consent-sensitive"');
        const sensitiveRow = html.split('id="consent-sensitive"')[1]?.split('</label>')[0] || '';
        expect(sensitiveRow).not.toContain('data-consent-required="true"');
        expect(sensitiveRow).toContain('건강정보');
        // 필수 두 개만 로그인을 막는다.
        expect(html).toContain('id="consent-terms" data-consent-required="true"');
        expect(html).toContain('id="consent-privacy" data-consent-required="true"');
    });

    it('locks the login button until the required boxes are ticked', () => {
        expect(html).toContain('id="loginBtn" aria-label="구글 계정으로 로그인" disabled');
        expect(auth).toContain('function syncSignupConsentState()');
        expect(auth).toContain("loginBtn.disabled = !ready;");
        // 로그인 대기 UI가 풀릴 때 무조건 열어 버리면 잠금이 무의미해진다.
        expect(auth).not.toContain('loginBtn.disabled = false;\n    loginBtn.removeAttribute');
        const pendingFn = auth.split('function setGoogleLoginPendingUi(')[1]?.split('\nfunction ')[0] || '';
        expect(pendingFn).toContain('syncSignupConsentState();');
    });

    it('records what was agreed to, when, and against which version', () => {
        expect(auth).toContain('const CONSENT_DOC_VERSION');
        expect(auth).toContain('function buildSignupConsentRecord()');
        expect(auth).toContain('updateData.consents = buildSignupConsentRecord();');
        // 동의 안 한 항목에는 시각을 남기지 않는다.
        expect(auth).toContain('at: agreed ? at : null');
        // 규칙에서 막히면 저장 자체가 안 된다.
        const rules = readRepo('firestore.rules');
        expect(rules.split('function isAllowedUserField()')[1]?.split('}')[0]).toContain("'consents'");
        expect(rules.split('function isAllowedUserCreate()')[1]?.split('}')[0]).toContain("'consents'");
    });
});

// 앱 지갑의 개인키는 users/{uid}에 암호화돼 있어 계정과 함께 사라진다.
// 체인 위의 HBT는 남지만 서명할 키가 없어 영영 꺼낼 수 없다.
describe('account deletion warns about losing the tokens', () => {
    const html = readRepo('index.html');
    const auth = readRepo('js/auth.js');

    it('says plainly that the tokens become unreachable', () => {
        expect(html).toContain('id="delete-account-modal"');
        expect(html).toContain('보유하신 HBT 토큰에 다시는 접근할 수 없습니다');
        // 같은 이메일로 다시 가입하면 복구된다고 오해하기 쉽다.
        expect(html).toContain('같은 이메일로 다시 가입해도 새 지갑이 만들어지므로 복구되지 않습니다');
    });

    it('shows the balance so the number is in front of them', () => {
        expect(html).toContain('id="delete-wallet-address"');
        expect(html).toContain('id="delete-wallet-balance"');
        expect(auth).toContain('async function fillDeleteWalletSummary()');
        expect(auth).toContain("parseFloat(balance?.balanceFormatted)");
        // 잔액 조회가 실패해도 '0'이라고 하면 안 된다.
        expect(auth).toContain("'조회 실패 (잔액이 있을 수 있음)'");
    });

    it('offers the way out before the door closes', () => {
        expect(html).toContain('id="delete-export-key-btn"');
        expect(auth).toContain('window.exportWalletBeforeDelete');
        expect(auth).toContain('window.openLegacyWalletExportModal()');
    });

    // 실제로 해 보니 Trust Wallet은 개인키 QR을 읽어 지갑을 열었고, MetaMask는
    // "이 QR 코드는 계정 주소나 연락처 주소와 연계되어 있지 않습니다"로 거부했다.
    // 메타마스크 스캐너가 주소를 기대하기 때문이다.
    // 되지도 않는 길을 안내하면 사용자는 자기가 잘못한 줄 안다.
    it('points each wallet at the method that works for it', () => {
        // 한 줄 안에 두 갈래가 다 있어야 한다 — 트러스트는 QR, 메타마스크는 복사.
        const desc = html.split('class="legacy-wallet-qr-desc"')[1]?.split('</p>')[0] || '';
        expect(desc).not.toBe('');
        expect(desc).toContain('Trust Wallet');
        expect(desc).toContain('MetaMask');
        expect(desc).toContain('복사');

        // 예전의 긴 '가져오기 순서' 목록은 사라진다. 휴대폰에서 너무 길었다.
        expect(html).not.toContain('legacy-wallet-import-guide');
    });

    it('requires an explicit acknowledgement, not just an OK', () => {
        expect(html).toContain('id="delete-ack-tokens"');
        expect(html).toContain('id="delete-ack-data"');
        expect(auth).toContain('function syncDeleteAckState()');
        expect(auth).toContain('window.confirmDeleteAccount');
        // 확인란을 다 채우기 전에는 삭제 버튼이 잠겨 있다.
        expect(html).toContain('id="delete-confirm-btn" disabled');
    });

    it('does not scare people who have no wallet', () => {
        // 지갑이 없으면 잃을 토큰도 없다.
        expect(auth).toContain("if (warningEl) warningEl.style.display = 'none';");
        expect(auth).toContain('tokensAck.disabled = true;');
    });
});

// 동의를 받아 놓고 기능을 그대로 열어 두면 동의 절차가 장식이 된다.
// 체성분·복용약물·혈액검사는 전부 건강정보라 같은 동의 아래에서만 열려야 한다.
describe('sensitive health features stay locked without consent', () => {
    const html = readRepo('index.html');
    const auth = readRepo('js/auth.js');
    const core = readRepo('js/app-core.js');

    it('marks all three health cards, not just the obvious one', () => {
        // 혈액검사만 떠올리기 쉬운데 체성분과 복용 약물도 건강정보다.
        expect(html).toContain('data-sensitive-card="체성분"');
        expect(html).toContain('data-sensitive-card="복용 약물"');
        expect(html).toContain('data-sensitive-card="혈액검사"');
    });

    it('hides the inputs rather than merely dimming them', () => {
        const css = readRepo('styles-features.css');
        expect(css).toContain('[data-sensitive-card].is-locked > *:not(h3):not(.sensitive-gate)');
        expect(css).toContain('display: none !important;');
        expect(auth).toContain("card.classList.toggle('is-locked', !agreed);");
    });

    it('treats an account with no consent record as not consented', () => {
        // 기존 가입자는 consents 자체가 없다. 없는 동의를 있다고 보면 안 된다.
        expect(auth).toContain("window._sensitiveConsentAgreed = ud?.consents?.sensitive?.agreed === true;");
        expect(auth).toContain('window._sensitiveConsentAgreed = false;');
    });

    it('checks again at save time, not just in the UI', () => {
        // 화면을 가리는 것만으로는 수집을 막은 것이 아니다.
        // 두 저장 경로의 앞부분(가드가 있어야 할 자리)만 잘라서 본다.
        const saveHead = core.split('window.saveHealthProfile = async function () {')[1]?.slice(0, 600) || '';
        expect(saveHead).not.toBe('');
        expect(saveHead).toContain('hasSensitiveDataConsent');

        const uploadHead = core.split('async function uploadBloodTestPhoto(inputEl) {')[1]?.slice(0, 900) || '';
        expect(uploadHead).not.toBe('');
        expect(uploadHead).toContain('hasSensitiveDataConsent');
        // 막을 때 고른 파일도 비워야 다음 시도가 깨끗하다.
        expect(uploadHead).toContain("inputEl.value = '';");
    });

    it('lets consent be taken back', () => {
        // 개인정보 보호법상 동의 철회는 동의만큼 쉬워야 한다.
        expect(auth).toContain('window.grantSensitiveConsent');
        expect(auth).toContain('window.revokeSensitiveConsent');
        expect(auth).toContain('sensitive-revoke-btn');
        // 철회하면 동의 시각도 비운다 — 철회했는데 동의 시각이 남으면 기록이 거짓이 된다.
        expect(auth).toContain('at: agreed ? new Date().toISOString() : null');
    });
});
