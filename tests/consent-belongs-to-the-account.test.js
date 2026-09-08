import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const AUTH = readRepoFile('js/auth.js');
const INDEX = readRepoFile('index.html');

// 2026-09-08: 동의를 로그인 **앞**에서 받다가 **뒤**로 옮겼다.
//
// 로그인 화면은 정의상 아직 누구인지 모르는 화면이라, 거기서 받은 동의는
// 계정이 아니라 브라우저에 붙는다. 그 표시는 로그아웃해도 남아서, 같은 기기에서
// 다음 사람이 가입하면 동의 화면을 아예 못 보고 **앞사람의 선택으로 그 사람의
// 동의 기록이 만들어졌다.**
//
// 이제 구글 로그인을 먼저 하고, 그 계정의 Firestore `consents` 를 보고 필요할 때만
// 동의 창을 띄운다. 같은 계정은 한 번만 묻고, 브라우저를 바꾸거나 로그아웃해도
// 다시 묻지 않는다.
describe('consent belongs to the account, not the browser', () => {
    it('has no consent box on the login screen at all', () => {
        expect(INDEX).not.toContain('id="signup-consent-box"');
        // 로그인 버튼은 더 이상 동의로 잠기지 않는다.
        expect(INDEX).toContain('<button class="google-btn" id="loginBtn"');
    });

    it('keeps no browser-level record of who agreed', () => {
        // 이 키들이 사라진 것이 이번 변경의 핵심이다. 되살리면 같은 사고가 난다.
        expect(AUTH).not.toContain('habitschool-consent-accepted');
        expect(AUTH).not.toContain('habitschool-consent-selection');
        expect(AUTH).not.toContain('function rememberAcceptedConsent');
        expect(AUTH).not.toContain('function restoreConsentSelection');
        expect(AUTH).not.toContain('function syncSignupConsentState');
    });

    it('does not write a consent record from the login screen', () => {
        // 예전에는 가입 문서를 만들 때 로그인 화면의 체크박스를 읽어 consents 를
        // 채웠다. 그 체크박스가 없어졌으므로 이 경로도 없어야 한다.
        expect(AUTH).not.toContain('buildSignupConsentRecord');
        const newUserBlock = AUTH.split('if (isNewUser) {')[1].split('}')[0];
        expect(newUserBlock).not.toContain('updateData.consents');
    });

    it('decides from the account record, for new and existing members alike', () => {
        // isNewUser 로 갈라 놓으면 신규는 이 관문을 지나지 않는다.
        expect(AUTH).not.toContain('!isNewUser && needsConsentRefresh');
        expect(AUTH).toContain('if (needsConsentRefresh({ ...resolvedUserData, ...updateData })) {');
        expect(AUTH).toContain('function needsConsentRefresh(userData = {})');
        // 판단 근거는 Firestore 의 consents 뿐이다.
        const refresh = AUTH.split('function needsConsentRefresh(userData = {}) {')[1].split('\n}')[0];
        expect(refresh).toContain('userData?.consents');
        expect(refresh).toContain('entry.version !== CONSENT_DOC_VERSION');
    });

    it('writes the record from the consent screen itself', () => {
        const submit = AUTH.split('window.submitReconsent = async function submitReconsent() {')[1].split('\n};')[0];
        expect(submit).toContain("setDoc(doc(db, 'users', user.uid), { consents: record }, { merge: true })");
        expect(submit).toContain('buildConsentRecordFromSelection(collectReconsentSelection())');
    });

    it('lets someone leave without agreeing, and does not delete their account', () => {
        // 동의 전에는 앱에 못 들어간다. 붙잡아 두는 대신 로그아웃으로 보낸다.
        const decline = AUTH.split('window.declineReconsent = function declineReconsent() {')[1].split('\n};')[0];
        expect(decline).toContain('window.logoutAndReset?.()');
        expect(decline).not.toContain('delete');
    });

    it('says the right thing to someone who is here for the first time', () => {
        // "약관이 바뀌었어요"는 처음 온 사람에게 무슨 소린지 알 수 없다.
        expect(INDEX).toContain('id="reconsent-head-signup"');
        expect(INDEX).toContain('id="reconsent-head-refresh"');
        expect(AUTH).toContain('function openReconsentModal(user, userData = {}, { firstTime = false } = {})');
        expect(AUTH).toContain('if (signupHead) signupHead.hidden = !firstTime;');
        expect(AUTH).toContain('if (changes) changes.hidden = !!firstTime;');
    });

    it('tells people which boxes are missing instead of a dead grey button', () => {
        // disabled 인 버튼은 클릭 이벤트가 안 와서 이유를 말할 기회가 없다.
        expect(INDEX).toContain('id="reconsent-submit"');
        expect(INDEX).not.toContain('id="reconsent-submit" class="wallet-modal-btn confirm" onclick="submitReconsent()" disabled');
        expect(AUTH).toContain("submit.setAttribute('aria-disabled', ready ? 'false' : 'true');");
        expect(AUTH).toContain('function reportMissingReconsent()');
        expect(AUTH).toContain('if (reportMissingReconsent()) return;');
        expect(AUTH).toContain('빨갛게 표시된 필수 항목');
        // 여기서 돌아선 사람은 로그인은 했지만 앱에 못 들어온다. 따로 세지 않으면 안 보인다.
        expect(AUTH).toContain("trackProductEvent('auth_consent_blocked'");
    });
});

// 2026-09-08 실기기: 동의 창이 잠깐 보였다가 온보딩(습관 고르기)이 그 위를 덮었다.
// 둘 다 로그인 직후에 독립적으로 뜨느라 경쟁했다. 동의가 먼저다.
describe('consent comes before the onboarding modal, not alongside it', () => {
    const CORE = readRepoFile('js/app-core.js');

    it('marks the gate while the consent screen is up', () => {
        expect(AUTH).toContain('window.__HABITSCHOOL_CONSENT_GATE_OPEN__ = true;');
        expect(AUTH).toContain('window.__HABITSCHOOL_CONSENT_GATE_OPEN__ = false;');
    });

    it('makes onboarding stand down while that gate is open', () => {
        // 호출부 한 곳만 막으면 다른 경로로 또 덮인다. 함수 자체가 물러나야 한다.
        expect(CORE).toContain('if (window.__HABITSCHOOL_CONSENT_GATE_OPEN__) return;');
        expect(AUTH).toContain('if (window.__HABITSCHOOL_CONSENT_GATE_OPEN__) return;');
    });

    it('picks onboarding back up once consent is given', () => {
        // 미루기만 하고 다시 부르지 않으면 신규 회원이 습관을 고르는 화면을 영영 못 본다.
        const submit = AUTH.split('window.submitReconsent = async function submitReconsent() {')[1].split('\n};')[0];
        expect(submit).toContain('window.checkOnboarding?.()');
    });

    it('keeps the modal heading out of sight rather than printing 동의 above the box', () => {
        // .sr-only 는 styles-dashboard.css 에 실제로 있는 클래스다. 없는 클래스를
        // 쓰면 제목이 그대로 화면에 찍힌다(실기기에서 그렇게 나왔다).
        expect(INDEX).toContain('<h3 id="reconsent-title" class="sr-only">동의</h3>');
        expect(readRepoFile('styles-dashboard.css')).toContain('.sr-only {');
    });
});

// 2026-09-08 실기기: 로그아웃한 뒤 새로고침 전까지 "구글로 시작하기" 가 잠겨 있었다.
// 대기 표시를 세울 때 disabled 를 걸어 놓고, 거둘 때는 풀지 않았기 때문이다.
// 예전에는 이 자리의 syncSignupConsentState() 가 우연히 풀어 주고 있었는데,
// 동의를 로그인 뒤로 옮기며 그 함수를 지우자 푸는 곳이 사라졌다.
describe('the login button unlocks itself when the pending state clears', () => {
    it('re-enables the button in the same function that disabled it', () => {
        const fn = AUTH.split('function setGoogleLoginPendingUi(loginBtn, isPending) {')[1].split('\n}')[0];
        expect(fn).toContain('loginBtn.disabled = true;');
        expect(fn).toContain('loginBtn.disabled = false;');
    });

    it('clears the pending state on logout without waiting for the shell to redraw', () => {
        // 동의 창의 '그만두기' 도 이 길로 온다. onAuthStateChanged 가 셸을 다시
        // 그릴 때까지 기다리면 그 사이 시작 버튼이 잠긴 채로 보인다.
        const logout = AUTH.split('window.logoutAndReset = async function () {')[1].split('\n};')[0];
        expect(logout).toContain("setGoogleLoginPendingUi(document.getElementById('loginBtn'), false);");
    });

    it('does not lean on a consent helper to do it', () => {
        // 그 헬퍼는 이제 없다. 다시 기대면 같은 자리에서 또 잠긴다.
        const fn = AUTH.split('function setGoogleLoginPendingUi(loginBtn, isPending) {')[1].split('\n}')[0];
        expect(fn).not.toContain('syncSignupConsentState();');
        expect(AUTH).not.toContain('function syncSignupConsentState');
    });
});
