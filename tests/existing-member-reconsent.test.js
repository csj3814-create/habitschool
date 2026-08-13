import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 문서가 바뀌면 기존 회원은 새 문서에 동의한 적이 없는 상태가 된다. CONSENT_DOC_VERSION
// 만 올리고 넘어가면 "동의를 받았다"고 말할 근거가 그 사람들에게는 없다.
// 신규 가입자만 age14 를 기록하고 있었으므로, 이번 개정(만 14세·제3자 제공·완전 삭제)에
// 대해 기존 회원의 동의는 어디에도 없었다.

const AUTH = readRepoFile('js/auth.js');
const INDEX = readRepoFile('index.html');
const EN_INDEX = readRepoFile('en/index.html');
const I18N = readRepoFile('js/i18n.js');

describe('an existing member is asked again when the documents change', () => {
    it('treats a missing or outdated consent as needing a refresh', () => {
        expect(AUTH).toContain('function needsConsentRefresh(userData = {})');
        const fn = AUTH.split('function needsConsentRefresh(userData = {}) {')[1].split('\n}')[0];
        expect(fn).toContain('if (!consents || typeof consents !== \'object\') return true;');
        expect(fn).toContain('entry.agreed !== true || entry.version !== CONSENT_DOC_VERSION');
    });

    it('checks every required consent, not just one', () => {
        expect(AUTH).toContain("const RECONSENT_REQUIRED_KEYS = ['terms', 'privacy', 'age14'];");
    });

    it('does not pester someone who just signed up', () => {
        // 방금 가입한 사람은 이미 현재 문서에 동의했다.
        expect(AUTH).toContain('if (!isNewUser && needsConsentRefresh({ ...resolvedUserData, ...updateData })) {');
    });

    it('does not open twice over itself', () => {
        const fn = AUTH.split('function openReconsentModal(user, userData = {}) {')[1].split('\n}')[0];
        expect(fn).toContain("if (!modal || modal.style.display === 'flex') return;");
    });
});

describe('the record it writes matches the one signup writes', () => {
    it('goes through the shared builder rather than a second copy', () => {
        // 동의 기록 모양이 두 벌이 되면 언젠가 갈라진다.
        expect(AUTH).toContain('function buildConsentRecordFromSelection(selection = {})');
        expect(AUTH).toContain('buildConsentRecordFromSelection(collectReconsentSelection())');
        expect(AUTH).toContain('buildConsentRecordFromSelection(resolveConsentSelection())');
    });

    it('maps the modal ids onto the same canonical keys', () => {
        const map = AUTH.split('const RECONSENT_ID_BY_KEY = {')[1].split('};')[0];
        for (const key of ['consent-terms', 'consent-privacy', 'consent-age', 'consent-sensitive']) {
            expect(map).toContain(`'${key}'`);
        }
    });

    it('persists before it claims to have accepted anything', () => {
        const fn = AUTH.split('window.submitReconsent = async function submitReconsent() {')[1].split('\n};')[0];
        const writeAt = fn.indexOf("await setDoc(doc(db, 'users', user.uid), { consents: record }, { merge: true });");
        const rememberAt = fn.indexOf('rememberAcceptedConsent(collectReconsentSelection());');
        expect(writeAt).toBeGreaterThan(-1);
        expect(rememberAt).toBeGreaterThan(writeAt);
    });

    it('re-enables the button if the write fails, instead of stranding the member', () => {
        const fn = AUTH.split('window.submitReconsent = async function submitReconsent() {')[1].split('\n};')[0];
        expect(fn).toContain('if (submit) submit.disabled = false;');
        expect(fn).toContain('return;');
    });
});

describe('an optional refusal survives the re-consent', () => {
    it('restores the previous health-data choice rather than defaulting to yes', () => {
        const fn = AUTH.split('function openReconsentModal(user, userData = {}) {')[1].split('\n}')[0];
        expect(fn).toContain('sensitiveBox.checked = userData?.consents?.sensitive?.agreed === true;');
        // 필수 항목은 반대로 매번 새로 받아야 한다.
        expect(fn).toContain("['reconsent-terms', 'reconsent-privacy', 'reconsent-age', 'reconsent-all'].forEach");
    });

    it('applies the resulting gate immediately', () => {
        expect(AUTH).toContain('window._sensitiveConsentAgreed = record.sensitive.agreed === true;');
        expect(AUTH).toContain('window.applySensitiveConsentGate?.();');
    });
});

describe('the modal works however it is shown', () => {
    it('binds its checkboxes at load, not only when opened', () => {
        // 여는 쪽에서만 묶으면 다른 경로로 뜬 순간 아무 반응 없는 상자가 된다.
        expect(AUTH).toContain('function bindConsentUi()');
        expect(AUTH).toContain('bindReconsentListeners();');
        const fn = AUTH.split('function bindConsentUi() {')[1].split('\n}')[0];
        expect(fn).toContain('bindSignupConsentListeners();');
        expect(fn).toContain('bindReconsentListeners();');
    });

    it('keeps the continue button locked until every required box is ticked', () => {
        const fn = AUTH.split('function syncReconsentState() {')[1].split('\n}')[0];
        expect(fn).toContain('submit.disabled = !required.every(el => el.checked);');
    });
});

describe('declining logs out rather than silently continuing', () => {
    it('sends the member through the normal logout', () => {
        expect(AUTH).toContain('window.declineReconsent = function declineReconsent()');
        expect(AUTH).toContain('window.logoutAndReset?.();');
    });

    it('cannot be dismissed by clicking outside', () => {
        // 다른 모달들은 바깥 클릭으로 닫힌다. 이건 닫히면 안 된다.
        const modal = INDEX.split('id="reconsent-modal"')[0].split('<div class="modal-overlay"').pop();
        expect(modal).not.toContain('onclick=');
    });
});

describe('the notice is shown in both languages', () => {
    it('ships in the English entry too', () => {
        expect(EN_INDEX).toContain('id="reconsent-modal"');
        expect(EN_INDEX).toContain('id="reconsent-age"');
    });

    it('translates every line of it', () => {
        for (const key of ['reconsent.badge', 'reconsent.title', 'reconsent.copy', 'reconsent.note',
            'reconsent.later', 'reconsent.agree',
            'reconsent.change1', 'reconsent.change2', 'reconsent.change3', 'reconsent.change4']) {
            expect(I18N, `${key} needs an English string`).toContain(`'${key}':`);
            expect(INDEX, `${key} must be referenced in the markup`).toContain(key);
        }
    });

    it('uses the html-aware attribute for the lines that contain markup', () => {
        // data-i18n 은 textContent 라 <strong> 이 글자로 새어 나온다.
        for (const i of [1, 2, 3, 4]) {
            expect(INDEX).toContain(`data-i18n-html="reconsent.change${i}"`);
        }
    });
});
