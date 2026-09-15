import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const APP = read('js/app-core.js');
const HTML = read('index.html');
const RULES = read('firestore.rules');
const RUNTIME = read('functions/runtime.js');

// 2026-09-15: 주간 처방 대기열의 제외 조건 중 하나가 "회원이 끈 경우" 다.
// 끌 방법이 없으면 그 조건은 코드에만 있고 실제로는 아무도 못 쓴다.
describe('a member can turn coach messages off', () => {
    it('gives them a switch where the other notification settings are', () => {
        expect(HTML).toContain('id="coach-messages-toggle"');
        expect(HTML).toContain('코치 메시지 받기');
        // 기본은 켜짐이다. 지금까지 받던 분들이 조용해지면 안 된다.
        expect(HTML).toContain('<input type="checkbox" id="coach-messages-toggle" checked>');
    });

    it('stores the flag inside settings, which the rules already allow', () => {
        // users/ 에는 hasOnly 화이트리스트가 있다. 새 최상위 필드를 쓰면 규칙을 함께
        // 배포해야 하고, 빠뜨리면 쓰기가 permission-denied 로 조용히 거부된다
        // — 2026-08-15 consents 사고가 정확히 그것이었다.
        const whitelist = RULES.split('function isAllowedUserField()')[1].split('}')[0];
        expect(whitelist).toContain("'settings'");
        expect(whitelist).not.toContain('coachMessagesOptOut');

        const fn = APP.split('window.handleCoachMessageToggle = async function (wantsMessages) {')[1].split('\n};')[0];
        expect(fn).toContain('settings: { coachMessagesOptOut: !wantsMessages }');
        expect(fn).toContain('{ merge: true }');
    });

    it('reads the saved value back when the member returns', () => {
        // 저장만 하고 못 읽으면 껐던 회원에게 켜진 것처럼 보인다.
        expect(APP).toContain('window.renderCoachMessagePreference?.(ud.settings)');
        const fn = APP.split('window.renderCoachMessagePreference = function (settings) {')[1].split('\n};')[0];
        expect(fn).toContain('!(settings && settings.coachMessagesOptOut === true)');
    });

    it('puts the switch back and says so when the save fails', () => {
        // 실패를 삼키면 껐다고 믿은 회원에게 다음 주에 메시지가 간다.
        const fn = APP.split('window.handleCoachMessageToggle = async function (wantsMessages) {')[1].split('\n};')[0];
        expect(fn).toContain('console.error(');
        expect(fn).toContain('el.checked = !wantsMessages');
        expect(fn).toContain('저장하지 못했습니다');
    });
});

describe('the queue honours the switch', () => {
    it('reads it from settings, not from a field the rules would block', () => {
        const fn = RUNTIME.split('async function buildAdminPrescriptionQueue(todayStr) {')[1].split('\n}\n')[0];
        expect(fn).toContain('user.settings && user.settings.coachMessagesOptOut === true');
        expect(fn).toContain('skipped.optedOut += 1');
        // 서버가 그 필드를 실제로 읽어 오는지. select 에 빠져 있으면 항상 undefined 다.
        expect(fn).toContain('"settings", "healthProfile"');
    });
});
