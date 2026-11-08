import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-11-08: 이틀 사이 소모임 규칙이 바뀌었는데(4주 14번·자동 승인·참가비 환불·한 모임) 기존 회원은 안내를 받지 못했다.
describe('members who were moved to the new 4-week round hear about it once', () => {
    const app = read('js/app-core.js');

    it('shows only to members whose round was reset, until 11/21, until they tap OK', () => {
        const fn = app.split('function shouldShowHabitGroupRuleNotice(')[1].split('\n}\n')[0];
        expect(fn).toContain('progress?.fourWeekResetAt');
        expect(fn).toContain('todayStr > HABIT_GROUP_RULE_NOTICE_LAST_DAY');
        expect(app).toContain("const HABIT_GROUP_RULE_NOTICE_LAST_DAY = '2026-11-21';");
        expect(app).toContain("localStorage.setItem(getHabitGroupRuleNoticeKey(uid), 'seen')");
    });

    it('sits at the top of the joined group card', () => {
        expect(app).toContain('${ruleNoticeHtml}\n            ${summaryHtml}');
    });

    it('says the four changes in both languages', () => {
        for (const file of ['js/i18n-ko.js', 'js/i18n-en.js']) {
            const dict = read(file);
            for (const key of ['title', 'round', 'auto', 'refund', 'oneGroup', 'oneGroupKept', 'ok']) {
                expect(dict).toContain(`'habitGroup.ruleNotice.${key}'`);
            }
        }
        expect(read('js/i18n-ko.js')).toContain('예전 참가비 200P는 돌려드렸어요');
    });
});
