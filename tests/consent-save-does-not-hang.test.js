import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUTH = readFileSync(resolve(ROOT_DIR, 'js/auth.js'), 'utf8');
const HELPERS = readFileSync(resolve(ROOT_DIR, 'js/ui-helpers.js'), 'utf8');

// ui-helpers 는 파이어베이스 CDN 을 import 하므로 시험에서 직접 들여올 수 없다.
// 실제 구현을 소스에서 떼어 그대로 돌린다 — 흉내 낸 것으로는 이 시험이 의미 없다.
const withAsyncTimeout = Function(`
    ${'async function withAsyncTimeout' + HELPERS.split('export async function withAsyncTimeout')[1].split('\n}')[0]}
}
    return withAsyncTimeout;`)();

// 2026-09-18 제보: "동의 화면이 왜 계속 뜨지? 업데이트마다 다시 받나?"
// 그리고 이어진 지적: "매일 들어가는 내 계정인데 동의를 한 번도 안 했다니
// 말도 안되는 소리."
//
// 맞는 말이었다. 서버를 뒤져도 consents 를 지우는 경로는 없었다(앱·서버·챗봇
// 모두 merge 쓰기뿐). 그러면 지워진 것이 아니라 **닿은 적이 없는** 것이다.
//
// Firestore 쓰기는 서버가 받았을 때 약속이 풀린다. 연결이 끊긴 동안에는 로컬에만
// 적어 두고 약속을 붙들고 있으므로, await 가 거부되지도 끝나지도 않는다. 버튼은
// 잠긴 채, 토스트도 없이, 창만 떠 있다. 새로고침으로 빠져나가면 기록은 남지
// 않고, 다음 로그인에 같은 창이 또 뜬다 — "계속 뜨지" 가 이것이다.
//
// 같은 날 들어온 다른 제보(이번 주 운동 0분)가 이 기기의 연결이 실제로 끊기고
// 있었음을 보여 준다.

function createSubmitHarness({ writeBehaviour }) {
    const body = AUTH
        .split('window.submitReconsent = async function submitReconsent() {')[1]
        .split('\n};')[0];

    const calls = { toasts: [], closed: 0, thanked: 0 };
    const submitButton = { disabled: false };
    const setDoc = vi.fn(() => writeBehaviour());

    const submit = Function(
        'reportMissingReconsent', 'auth', 'document', 'buildConsentRecordFromSelection',
        'collectReconsentSelection', 'setDoc', 'doc', 'db', 'withAsyncTimeout',
        'CONSENT_SAVE_TIMEOUT_MS', 'showToast', 'closeReconsentModal', 'window',
        'console', 'setTimeout', '_reconsentUser', '_reconsentPriorConsents',
        `return (async function submitReconsent() {${body}});`
    )(
        () => false,
        { currentUser: { uid: 'user-1' } },
        { getElementById: (id) => (id === 'reconsent-submit' ? submitButton : null) },
        () => ({ terms: { agreed: true }, sensitive: { agreed: false } }),
        () => ({}),
        setDoc,
        () => ({}),
        {},
        withAsyncTimeout,
        40,
        (message) => { calls.toasts.push(message); },
        () => { calls.closed += 1; },
        { applySensitiveConsentGate: () => {}, checkOnboarding: () => {} },
        { error: () => {} },
        (fn) => fn(),
        null,
        {}
    );

    return { submit, calls, submitButton, setDoc };
}

describe('a consent write that never lands does not look like success', () => {
    it('gives up waiting instead of holding the button forever', async () => {
        // 끝나지 않는 약속 — 연결이 끊긴 Firestore 쓰기가 정확히 이 모양이다.
        const { submit, calls, submitButton } = createSubmitHarness({
            writeBehaviour: () => new Promise(() => {}),
        });
        await submit();
        expect(submitButton.disabled).toBe(false);
        expect(calls.closed).toBe(0);
        expect(calls.toasts.join(' ')).toContain('연결이 불안정해');
    });

    it('never thanks the member for something that was not saved', async () => {
        const { submit, calls } = createSubmitHarness({
            writeBehaviour: () => new Promise(() => {}),
        });
        await submit();
        expect(calls.toasts.join(' ')).not.toContain('감사');
    });

    it('still closes and thanks when the server does answer', async () => {
        const { submit, calls, submitButton } = createSubmitHarness({
            writeBehaviour: () => Promise.resolve(),
        });
        await submit();
        expect(calls.closed).toBe(1);
        expect(calls.toasts.join(' ')).toContain('감사');
        expect(submitButton.disabled).toBe(true);
    });

    it('keeps naming permission-denied for what it is', async () => {
        // 규칙 문제는 기다린다고 풀리지 않는다. 연결 탓으로 뭉뚱그리면 안 된다.
        const denied = Object.assign(new Error('Missing or insufficient permissions.'), {
            code: 'permission-denied',
        });
        const { submit, calls } = createSubmitHarness({
            writeBehaviour: () => Promise.reject(denied),
        });
        await submit();
        expect(calls.toasts.join(' ')).toContain('permission-denied');
        expect(calls.toasts.join(' ')).not.toContain('연결이 불안정해');
    });
});

describe('the timeout helper lives where both files can reach it', () => {
    it('is shared, not copied into each file', () => {
        const core = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');
        expect(AUTH).toContain('withAsyncTimeout } from \'./ui-helpers.js');
        expect(core).toContain('withAsyncTimeout } from \'./ui-helpers.js');
        // 두 벌로 두면 언젠가 갈라진다.
        expect(core).not.toContain('async function withAsyncTimeout(task');
    });

    it('waits a bounded time, and says which wait it was', () => {
        expect(AUTH).toContain('const CONSENT_SAVE_TIMEOUT_MS =');
        expect(AUTH).toContain("'consent_save_timeout'");
    });
});
