import { describe, expect, it } from 'vitest';
import emailModule from '../functions/reengagement-email.js';
import { readRepoFile } from './source-helpers.js';

const { buildReEngagementEmailTemplate } = emailModule;

describe('English locale plumbing', () => {
    it('sends locale with English-capable AI requests without changing callable names', () => {
        const clientSource = readRepoFile('js/diet-analysis.js');
        const runtimeSource = readRepoFile('functions/runtime.js');

        expect(clientSource).toContain('return { ...extra, locale: getLocale() };');
        expect(clientSource).toContain("httpsCallable(functions, 'analyzeDiet')");
        expect(clientSource).toContain("httpsCallable(functions, 'analyzeSleepMind')");
        expect(clientSource).toContain("httpsCallable(functions, 'analyzeStepScreenshot')");

        expect(runtimeSource).toContain('const locale = normalizeLocale(rawLocale);');
        expect(runtimeSource).toContain('DIET_ANALYSIS_PROMPT_EN');
        expect(runtimeSource).toContain('SLEEP_MIND_ANALYSIS_PROMPT_EN');
        expect(runtimeSource).toContain('STEP_SCREENSHOT_PROMPT_EN');
        expect(runtimeSource).toContain('locale === "en" ? DIET_ANALYSIS_PROMPT_EN : DIET_ANALYSIS_PROMPT');
        expect(runtimeSource).toContain('locale === "en" ? SLEEP_MIND_ANALYSIS_PROMPT_EN : SLEEP_MIND_ANALYSIS_PROMPT');
        expect(runtimeSource).toContain('locale === "en" ? STEP_SCREENSHOT_PROMPT_EN : STEP_SCREENSHOT_PROMPT');
        expect(runtimeSource).toContain('model: "gemini-2.5-flash"');
        expect(runtimeSource).toContain('thinkingConfig: { thinkingBudget: 0 }');
    });

    it('allows users.locale while keeping existing shared user records', () => {
        const rules = readRepoFile('firestore.rules');
        const authSource = readRepoFile('js/auth.js');

        expect(rules).toMatch(/['"]locale['"]/);
        expect(authSource).toContain('locale: getLocale()');
    });

    it('builds English re-engagement email templates when requested', () => {
        const template = buildReEngagementEmailTemplate({
            days: 7,
            name: 'Alex',
            locale: 'en',
            appBaseUrl: 'https://habitschool.web.app/en',
            appIconUrl: 'https://habitschool.web.app/icons/icon-192.svg'
        });

        expect(template.locale).toBe('en');
        expect(template.subject).toContain('Habit School');
        expect(template.subject).toContain('Alex');
        expect(template.summary).toContain('7 days');
        expect(template.html).toContain('Return to Habit School');
        expect(template.html).toContain('https://habitschool.web.app/en');
        expect(template.html).not.toMatch(/[\u3131-\u318E\uAC00-\uD7A3]/);
    });
});
