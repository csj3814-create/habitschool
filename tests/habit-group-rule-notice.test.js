import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-11-23: 완주 보상 1,000P → 500P(런비커스 제외). 지금 바퀴는 1,000P 그대로라는 것을 한 번 알린다.
describe('members of non-Runbickers groups hear about the 500P reward once', () => {
    const app = read('js/app-core.js');

    it('shows only to members of a group other than Runbickers, until 12/21, until they tap OK', () => {
        const fn = app.split('function shouldShowHabitGroupRuleNotice(')[1].split('\n}\n')[0];
        expect(fn).toContain('groupId !== RUNBICKERS_COVER_GROUP_ID');
        expect(fn).toContain('todayStr > HABIT_GROUP_RULE_NOTICE_LAST_DAY');
        expect(app).toContain("const HABIT_GROUP_RULE_NOTICE_LAST_DAY = '2026-12-21';");
        expect(app).toContain('habitGroupRuleNotice_20261123_');
        expect(app).toContain("localStorage.setItem(getHabitGroupRuleNoticeKey(uid), 'seen')");
    });

    it('sits at the top of the joined group card', () => {
        expect(app).toContain('${ruleNoticeHtml}\n            ${summaryHtml}');
    });

    it('says the new amount and that the current round keeps 1,000P, in both languages', () => {
        for (const file of ['js/i18n-ko.js', 'js/i18n-en.js']) {
            const dict = read(file);
            for (const key of ['title', 'reward', 'currentRound', 'ok']) {
                expect(dict).toContain(`'habitGroup.ruleNotice.${key}'`);
            }
        }
        expect(read('js/i18n-ko.js')).toContain('처음 약속대로 1,000P');
    });
});
