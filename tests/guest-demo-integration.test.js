import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

describe('guest demo app integration', () => {
    it('keeps an in-progress demo when the login prompt is dismissed back to experience mode', () => {
        const source = readAppSource();

        expect(source).toContain('if (isGuestDemoActive()) {');
        expect(source).toContain("const activeTab = normalizeDemoTab(guestDemoController.getSession()?.activeTab || tab);");
        expect(source).toContain("if (loginModal) loginModal.style.display = 'none';");
        expect(source).toContain('openTab(activeTab, false);');
    });

    it('keeps the six-tab navigation visible after each guest tab change', () => {
        const source = readAppSource();

        expect(source).toContain("window.scrollTo({ top: 0, left: 0, behavior: 'auto' });");
        expect(source).not.toContain("host?.scrollIntoView({ block: 'start' });");
    });

    it('uses contrast-safe guest header and tab colors without shipping audit-only code', () => {
        const styles = readRepoFile('styles-guest-demo.css');
        const html = readRepoFile('index.html');

        expect(styles).toContain('html.guest-demo-active #user-greeting');
        expect(styles).toContain('color: #8a4700;');
        expect(styles).toContain('color: #616161;');
        expect(styles).toContain('color: #6f625b;');
        expect(html).not.toContain('local-accessibility-audit');
        expect(html).not.toContain('local-axe-audit-result');
    });
});
