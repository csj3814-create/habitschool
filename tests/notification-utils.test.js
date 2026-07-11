import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    normalizeReminderPreference,
    getKstHour,
    buildNotificationLedgerId,
    getReminderTarget,
} = require('../functions/notification-utils.js');

describe('notification-utils', () => {
    it('normalizes the first-record reminder preference', () => {
        expect(normalizeReminderPreference({
            settings: { reminderPreference: { enabled: true, category: 'sleep', hourKst: 21 } }
        })).toEqual({ enabled: true, category: 'sleep', hourKst: 21 });
        expect(normalizeReminderPreference({ settings: { reminderPreference: { hourKst: 99 } } }))
            .toEqual({ enabled: false, category: 'diet', hourKst: 20 });
    });

    it('calculates the wall-clock hour in KST', () => {
        expect(getKstHour(new Date('2026-07-10T11:30:00.000Z'))).toBe(20);
        expect(getKstHour(new Date('2026-07-10T18:30:00.000Z'))).toBe(3);
    });

    it('creates a stable user/date/kind ledger key', () => {
        expect(buildNotificationLedgerId('user/1', '2026-07-10', 'habit-reminder'))
            .toBe('user_1_2026-07-10_habit-reminder');
        expect(() => buildNotificationLedgerId('', '2026-07-10', 'habit')).toThrow();
    });

    it('routes reminders to the exact record surface', () => {
        expect(getReminderTarget('diet')).toEqual({ tab: 'diet', focus: 'upload' });
        expect(getReminderTarget('exercise')).toEqual({ tab: 'exercise', focus: 'record' });
        expect(getReminderTarget('sleep')).toEqual({ tab: 'sleep', focus: 'record' });
    });
});
