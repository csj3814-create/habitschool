import { describe, expect, it } from 'vitest';
import emailModule from '../functions/reengagement-email.js';
import { readRepoFile } from './source-helpers.js';

// 2026-09-30: 9/19~26 가입자 15명 중 기록을 남긴 분이 0명이었다. 재참여 메일은
// 마지막 기록일로 대상을 고르므로 이분들께 아무것도 가지 않았다.

const { buildFirstRecordEmailTemplate } = emailModule;
const RUNTIME = readRepoFile('functions/runtime.js');
const FN = RUNTIME.split('exports.sendFirstRecordNudge = onCall(')[1].split('\n);')[0];

describe('first record letter', () => {
    it('promises only the points people actually get', () => {
        const got = buildFirstRecordEmailTemplate({ name: '해빛', welcomeBonusGiven: true, appBaseUrl: 'https://h' });
        const pending = buildFirstRecordEmailTemplate({ name: '해빛', welcomeBonusGiven: false, appBaseUrl: 'https://h' });
        expect(got.html).toContain('보너스 35P');
        expect(got.html).toContain('가입 축하 200P는 이미 들어와 있습니다');
        expect(pending.html).toContain('습관을 하나 고르시면 가입 축하 200P를 드립니다');
        expect(got.subject).toBe('해빛님, 첫 기록 하나만 남겨 보세요');
        expect(got.html).toContain('https://h/?utm_source=email&utm_medium=onboarding&utm_campaign=first_record');
        expect(got.html).toContain('답장');
    });

    it('matches the first-day milestone rewards it quotes', () => {
        const config = readRepoFile('js/firebase-config.js');
        expect(config).toContain("{ id: 'streak1', emoji: '🌟', name: '시작', desc: '첫 기록 달성', target: 1, reward: 20 }");
        expect(config).toContain("{ id: 'diet1', emoji: '🥗', name: '식단 시작', desc: '첫 식단 기록', target: 1, reward: 15 }");
    });
});

describe('sendFirstRecordNudge', () => {
    it('is admin only, previews by default, and sends each person once', () => {
        expect(FN).toContain('await assertAdminRequest(request);');
        expect(FN).toContain('const preview = request.data?.preview !== false;');
        expect(FN).toContain('firstRecordNudge?.sentAt');
    });

    it('only picks recent signups with no record', () => {
        expect(FN).toContain('.where("createdAt", ">=", new Date(oldestMs))');
        expect(FN).toContain('if (!logSnap.empty) {');
        expect(RUNTIME).toContain('const FIRST_RECORD_NUDGE_MAX_DAYS = 30;');
    });

    it('has a button in the console that confirms before sending', () => {
        const admin = readRepoFile('admin.html');
        expect(admin).toContain('onclick="sendFirstRecordNudge()"');
        const caller = admin.split('window.sendFirstRecordNudge = async function() {')[1].split('\n    };')[0];
        expect(caller.indexOf('if (!confirm(')).toBeLessThan(caller.indexOf('preview: false'));
    });
});
