import { describe, expect, it } from 'vitest';
import {
    IN_APP_REVIEW_MIN_NATIVE_VERSION,
    PLAY_STORE_INTENT_URL,
    buildInAppReviewUrl,
    decidePlayReviewPrompt,
} from '../js/play-review.js';
import { readRawRepoFile, readRepoFile } from './source-helpers.js';

const BASE = { milestoneId: 'streak7', nativeSource: 'android-shell', nativeVersion: '15', alreadyAsked: false };

describe('플레이 앱 평점 부탁', () => {
    it('1.0.12(15) 이상 셸은 앱 안 평점 창, 그 전 셸은 스토어 카드', () => {
        expect(IN_APP_REVIEW_MIN_NATIVE_VERSION).toBe(15);
        expect(decidePlayReviewPrompt(BASE)).toBe('in-app');
        expect(decidePlayReviewPrompt({ ...BASE, nativeVersion: '14' })).toBe('store-card');
        // 1.0.6 전 셸은 nativeVersion 을 붙이지 않는다.
        expect(decidePlayReviewPrompt({ ...BASE, nativeVersion: '' })).toBe('store-card');
    });

    it('셸 밖(웹·아이폰), 이미 부탁한 기기, 다른 보상에서는 띄우지 않는다', () => {
        expect(decidePlayReviewPrompt({ ...BASE, nativeSource: '' })).toBeNull();
        expect(decidePlayReviewPrompt({ ...BASE, alreadyAsked: true })).toBeNull();
        expect(decidePlayReviewPrompt({ ...BASE, milestoneId: 'streak3' })).toBeNull();
        expect(decidePlayReviewPrompt({ ...BASE, milestoneId: 'diet7' })).toBeNull();
        expect(decidePlayReviewPrompt({ ...BASE, milestoneId: 'streak14' })).toBe('in-app');
        expect(decidePlayReviewPrompt({ ...BASE, milestoneId: 'streak30' })).toBe('in-app');
    });

    it('앱 안 창 주소와 스토어 주소', () => {
        expect(buildInAppReviewUrl('streak7')).toBe('habitschool://review/request?source=milestone-streak7');
        expect(PLAY_STORE_INTENT_URL).toContain('scheme=market;package=com.android.vending');
        expect(PLAY_STORE_INTENT_URL).toContain('S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.habitschool.app');
    });

    it('연속 기록 보상을 받은 직후에 부른다', () => {
        expect(readRawRepoFile('js/app-core.js')).toMatch(
            /showToast\(t\('milestone\.bonusPaid', \{ n: reward \}\)\);\s*maybePromptPlayReview\(\{\s*uid: currentUser\.uid,\s*milestoneId,\s*nativeSource: getRememberedNativeAppSource\(\),\s*nativeVersion: getRememberedNativeAppVersion\(\),/
        );
        expect(readRepoFile('sw.js')).toContain("'./js/play-review.js?v=");
    });

    it('카드 문구에 보상 얘기가 없다 (플레이 정책)', () => {
        for (const file of ['js/i18n-ko.js', 'js/i18n-en.js']) {
            const lines = readRawRepoFile(file).split('\n').filter((line) => line.includes("'playReview."));
            expect(lines).toHaveLength(4);
            lines.forEach((line) => expect(line).not.toMatch(/P\b|포인트|point|reward|보상/i));
        }
    });

    it('셸 1.0.12 에 평점 창 주소가 있다', () => {
        const manifest = readRepoFile('android/app/src/main/AndroidManifest.xml');
        const entry = readRepoFile('android/app/src/main/java/com/habitschool/app/NativeEntryActivity.kt');
        const gradle = readRepoFile('android/app/build.gradle.kts');
        expect(manifest).toContain('android:host="review"');
        expect(manifest).toContain('android:name=".ReviewActivity"');
        expect(entry).toContain('data.host == "review"');
        expect(gradle).toContain('versionCode = 15');
        expect(gradle).toContain('com.google.android.play:review-ktx');
    });
});
