import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-11-08: 10/7 이후 플레이 앱 회원 68명 중 알림이 연결된 사람은 2명, 식사 알림은 0명이었다.
// 앱이 POST_NOTIFICATIONS 도, 그것을 묻는 화면도 선언하지 않아서 안드로이드 13 이상에서는
// 웹이 알림을 물어도 크롬이 넘길 곳이 없었다. 허락 창 없이 "차단되어 있어요" 로 끝났다.

const MANIFEST = readRepoFile('android/app/src/main/AndroidManifest.xml');
const GRADLE = readRepoFile('android/app/build.gradle.kts');

describe('the Play app can ask Android for notification permission', () => {
    it('declares POST_NOTIFICATIONS', () => {
        expect(MANIFEST).toContain('<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />');
    });

    it('declares the screen Chrome opens to ask', () => {
        expect(MANIFEST).toContain('android:name="com.google.androidbrowserhelper.trusted.NotificationPermissionRequestActivity"');
    });

    it('keeps the delegation service that hands the question to the app', () => {
        const service = MANIFEST.split('com.google.androidbrowserhelper.trusted.DelegationService')[1].split('</service>')[0];
        expect(service).toContain('android.support.customtabs.trusted.TRUSTED_WEB_ACTIVITY_SERVICE');
        expect(service).toContain('android.support.customtabs.trusted.SMALL_ICON');
    });

    it('ships it as a new version', () => {
        expect(Number(GRADLE.match(/versionCode = (\d+)/)[1])).toBeGreaterThanOrEqual(17);
    });
});
