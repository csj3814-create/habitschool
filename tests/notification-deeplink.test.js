import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

describe('notification deeplink routing', () => {
    it('reuses a shared target-url handler for launch queue and service worker notifications', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("function handleIncomingAppTargetUrl(targetUrl = '') {");
        expect(appSource).toContain("navigator.serviceWorker.addEventListener('message'");
        expect(appSource).toContain("if (data.type !== 'habitschool-notification-open') return;");
        expect(appSource).toContain('scheduleAppEntryDeepLink(nextTab);');
    });

    it('supports diet reminder focus values beyond upload', () => {
        const appSource = readAppSource();
        const functionsSource = readRepoFile('functions/runtime.js');

        expect(appSource).toContain("const DIET_DEEP_LINK_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];");
        expect(appSource).toContain("function handleDietRecordDeepLink(focus = 'upload') {");
        expect(appSource).toContain("if ((params.tab === 'diet' || initialTab === 'diet') && params.focus) {");
        expect(appSource).toContain('await ensureTodayDietDateSelected();');
        expect(functionsSource).toContain('focus: "lunch"');
        expect(functionsSource).toContain('focus: "dinner"');
    });
});
