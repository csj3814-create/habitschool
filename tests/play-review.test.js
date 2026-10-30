import { describe, expect, it } from 'vitest';
import {
    IN_APP_REVIEW_MIN_NATIVE_VERSION,
    PLAY_STORE_INTENT_URL,
    buildInAppReviewUrl,
    decidePlayReviewPrompt,
    recordPlayReviewAsked,
} from '../js/play-review.js';
import { readRawRepoFile, readRepoFile } from './source-helpers.js';

const BASE = { milestoneId: 'streak7', nativeSource: 'android-shell', nativeVersion: '15', state: {}, today: '2026-10-30' };

describe('플레이 앱 평점 부탁', () => {
    it('1.0.12(15) 이상 셸은 앱 안 평점 창, 그 전 셸은 스토어 카드', () => {
        expect(IN_APP_REVIEW_MIN_NATIVE_VERSION).toBe(15);
        expect(decidePlayReviewPrompt(BASE)).toBe('in-app');
        expect(decidePlayReviewPrompt({ ...BASE, nativeVersion: '14' })).toBe('store-card');
        // 1.0.6 전 셸은 nativeVersion 을 붙이지 않는다.
        expect(decidePlayReviewPrompt({ ...BASE, nativeVersion: '' })).toBe('store-card');
    });

    it('셸 밖(웹·아이폰)과 연속 기록이 아닌 보상에서는 띄우지 않는다', () => {
        expect(decidePlayReviewPrompt({ ...BASE, nativeSource: '' })).toBeNull();
        expect(decidePlayReviewPrompt({ ...BASE, milestoneId: 'streak1' })).toBeNull();
        expect(decidePlayReviewPrompt({ ...BASE, milestoneId: 'streak60' })).toBeNull();
        expect(decidePlayReviewPrompt({ ...BASE, milestoneId: 'diet7' })).toBeNull();
        ['streak3', 'streak7', 'streak14', 'streak30'].forEach((milestoneId) => {
            expect(decidePlayReviewPrompt({ ...BASE, milestoneId })).toBe('in-app');
        });
    });

    it('반응하지 않으면 다음 연속 기록 보상 때 다시, 스토어로 갔으면 그만', () => {
        const after3 = recordPlayReviewAsked({}, 'streak3', '2026-10-27');
        expect(after3).toEqual({ asked: { streak3: '2026-10-27' }, lastAskedDate: '2026-10-27' });
        // 같은 보상으로는 한 번만
        expect(decidePlayReviewPrompt({ ...BASE, milestoneId: 'streak3', state: after3 })).toBeNull();
        // 넘겼으면 7일 보상 때 다시
        expect(decidePlayReviewPrompt({ ...BASE, state: after3 })).toBe('in-app');
        expect(decidePlayReviewPrompt({ ...BASE, nativeVersion: '14', state: after3 })).toBe('store-card');
        // 카드에서 스토어로 갔으면 더 묻지 않는다
        expect(decidePlayReviewPrompt({ ...BASE, state: { ...after3, wentToStore: true } })).toBeNull();
    });

    it('밀린 보상을 한꺼번에 받아도 하루에 한 번만 부탁한다', () => {
        const sameDay = recordPlayReviewAsked({}, 'streak3', '2026-10-30');
        expect(decidePlayReviewPrompt({ ...BASE, state: sameDay })).toBeNull();
        expect(decidePlayReviewPrompt({ ...BASE, state: sameDay, today: '2026-10-31' })).toBe('in-app');
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
        // 평점 창이 들어간 15 이상이면 된다 (1.0.13 = 16).
        expect(Number(gradle.match(/versionCode = (\d+)/)[1])).toBeGreaterThanOrEqual(15);
        expect(gradle).toContain('com.google.android.play:review-ktx');
    });
});
