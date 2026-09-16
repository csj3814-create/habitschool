import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const APP = read('js/app-core.js');
const ADMIN = read('admin.html');
const RUNTIME = read('functions/runtime.js');
const RULES = read('firestore.rules');
const ROUTES = read('android/app/src/main/java/com/habitschool/app/AppRoutes.kt');

// 2026-09-16: Play 프로덕션 액세스가 두 번 반려됐고, 두 번 다 첫 사유가
// "비공개 테스트 중에 테스터가 앱에 참여하지 않았습니다" 였다.
//
// 그런데 몇 명이 앱을 실제로 여는지 볼 방법이 없었다. 안드로이드 셸은 항상
// ?native=... 를 붙여 열지만, 웹은 그 값을 URL 정리에만 쓰고 버렸다.
// 그래서 두 번 다 모르는 채로 신청하고 2주씩 잃었다.
describe('an app open leaves a trace we can count', () => {
    it('relies on the marker the Android shell actually sends', () => {
        // 이 값이 없어지면 측정이 통째로 조용히 멈춘다.
        expect(ROUTES).toContain('"native" to nativeSource');
        expect(ROUTES).toContain('nativeSource: String = "android-shell"');
        expect(APP).toContain("params.get('native')");
    });

    it('records the open on the user document', () => {
        const fn = APP.split('async function recordNativeAppOpen(user, settings) {')[1].split('\n}')[0];
        expect(fn).toContain('getRememberedNativeAppSource()');
        expect(fn).toContain('lastAppOpenDate: today');
        expect(fn).toContain('lastAppOpenSource: source');
        expect(APP).toContain('recordNativeAppOpen(user, ud.settings)');
    });

    it('writes nothing for a web visit', () => {
        const fn = APP.split('async function recordNativeAppOpen(user, settings) {')[1].split('\n}')[0];
        expect(fn).toContain('if (!user || !source) return;');
    });

    it('writes once a day, not once an open', () => {
        const fn = APP.split('async function recordNativeAppOpen(user, settings) {')[1].split('\n}')[0];
        expect(fn).toContain('if (settings && settings.lastAppOpenDate === today) return;');
    });

    it('keeps the field inside settings, which the rules already allow', () => {
        // 새 최상위 필드는 firestore.rules 를 함께 배포해야 하고, 빠뜨리면 쓰기가
        // permission-denied 로 조용히 거부된다(2026-08-15 consents).
        const whitelist = RULES.split('function isAllowedUserField()')[1].split('}')[0];
        expect(whitelist).toContain("'settings'");
        expect(whitelist).not.toContain('lastAppOpenDate');
        const fn = APP.split('async function recordNativeAppOpen(user, settings) {')[1].split('\n}')[0];
        expect(fn).toContain('settings: { lastAppOpenDate: today');
        expect(fn).toContain('{ merge: true }');
    });

    it('logs a failed write instead of swallowing it', () => {
        // 삼키면 다음 심사 때도 모르는 채로 신청하게 된다.
        const fn = APP.split('async function recordNativeAppOpen(user, settings) {')[1].split('\n}')[0];
        expect(fn).toContain('console.warn(');
    });
});

describe('the admin can see the number Play is judging', () => {
    it('counts only the last fourteen days, against the twelve-tester bar', () => {
        expect(RUNTIME).toContain('const PLAY_CLOSED_TEST_MIN_TESTERS = 12;');
        expect(RUNTIME).toContain('const PLAY_CLOSED_TEST_WINDOW_DAYS = 14;');
        const fn = RUNTIME.split('exports.getAdminAppUsage = onCall(')[1].split('\n);')[0];
        expect(fn).toContain('await assertAdminRequest(request)');
        expect(fn).toContain('.where("settings.lastAppOpenDate", ">=", since)');
    });

    it('needs no composite index for that query', () => {
        // 중첩 필드는 단일 필드 색인이 자동으로 붙는다. 색인 배포가 없어야 한다.
        expect(read('firestore.indexes.json')).not.toContain('lastAppOpenDate');
    });

    it('says plainly whether an application would pass right now', () => {
        const fn = ADMIN.split('window.loadAppUsage = async function loadAppUsage() {')[1].split('\n    };')[0];
        expect(fn).toContain('명 모자랍니다. 지금 신청하면 같은 사유로 또 반려됩니다.');
        expect(fn).toContain('요건을 채우고 있습니다');
    });

    it('warns that the history starts at deploy, not before', () => {
        // 배포 전 기록은 없다. 0명을 보고 "아무도 안 쓴다" 고 읽으면 안 된다.
        const fn = ADMIN.split('window.loadAppUsage = async function loadAppUsage() {')[1].split('\n    };')[0];
        expect(fn).toContain('이 기능을 배포한 날 이후부터 쌓입니다');
    });

    it('is loaded with the system tab', () => {
        expect(ADMIN).toContain('id="appusage-count"');
        expect(ADMIN).toContain('loadBloodTestQuality(), loadAppUsage()');
    });

    it('reports a failure instead of showing a silent zero', () => {
        const fn = ADMIN.split('window.loadAppUsage = async function loadAppUsage() {')[1].split('\n    };')[0];
        expect(fn).toContain('console.error(');
        expect(fn).toContain('불러오지 못했습니다');
    });
});
