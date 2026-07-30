import { describe, expect, it } from 'vitest';
import {
    LEGACY_WINDOW_PRESET,
    INTERMITTENT_FASTING_METHOD_ID,
    parseEatingWindowPreset,
    resolveDietEatingWindow,
    formatDietWindowLabel,
    toReminderBucketMinutes,
    resolveDietReminderKindAt
} from '../functions/diet-window-utils.js';

const FASTING = { methodId: INTERMITTENT_FASTING_METHOD_ID, remindersEnabled: true };
const GENERAL = { methodId: 'low_carb', remindersEnabled: true };

describe('diet eating window (server)', () => {
    it('treats the legacy preset as "not set" so existing reminder times never shift', () => {
        // 기존 사용자는 메서드와 무관하게 '16_8_1200_2000'이 저장돼 있다.
        // 이 값을 사용자 선택으로 읽으면 비단식 사용자 알림이 11:30 → 12:00으로 밀린다.
        const fasting = resolveDietEatingWindow({ ...FASTING, fastingPreset: LEGACY_WINDOW_PRESET });
        expect([fasting.startMinutes, fasting.warningMinutes]).toEqual([720, 1170]); // 12:00 / 19:30

        const general = resolveDietEatingWindow({ ...GENERAL, fastingPreset: LEGACY_WINDOW_PRESET });
        expect([general.startMinutes, general.warningMinutes]).toEqual([690, 1050]); // 11:30 / 17:30
    });

    it('falls back to method defaults when the preset is missing or malformed', () => {
        expect(resolveDietEatingWindow(FASTING).startMinutes).toBe(720);
        expect(resolveDietEatingWindow({ ...GENERAL, fastingPreset: 'garbage' }).startMinutes).toBe(690);
        expect(parseEatingWindowPreset('garbage')).toBeNull();
        expect(parseEatingWindowPreset('')).toBeNull();
        expect(parseEatingWindowPreset('win_2500_2600')).toBeNull();
        expect(parseEatingWindowPreset('win_1200_1300')).toBeNull(); // 최소 4시간 미만
    });

    it('honors a user-set window in both formats', () => {
        expect(parseEatingWindowPreset('win_1030_1830')).toEqual({ startMinutes: 630, endMinutes: 1110 });
        // 레거시 4세그먼트 형식도 계속 읽는다(마지막 두 세그먼트만 신뢰).
        expect(parseEatingWindowPreset('15_8_1030_1830')).toEqual({ startMinutes: 630, endMinutes: 1110 });

        const window = resolveDietEatingWindow({ ...FASTING, fastingPreset: 'win_1030_1830' });
        expect([window.startMinutes, window.warningMinutes, window.endMinutes]).toEqual([630, 1080, 1110]);
    });

    it('lets a non-fasting user pick 12:00~20:00 without it reading as unset', () => {
        const window = resolveDietEatingWindow({ ...GENERAL, fastingPreset: 'win_1200_2000' });
        expect([window.startMinutes, window.endMinutes]).toEqual([720, 1200]);
    });

    it('formats labels and 30-minute buckets', () => {
        expect(formatDietWindowLabel(630)).toBe('10:30');
        expect(formatDietWindowLabel(0)).toBe('00:00');
        expect(formatDietWindowLabel(1170)).toBe('19:30');
        // 스케줄이 지연 실행돼도 같은 버킷으로 떨어져야 한다.
        expect(toReminderBucketMinutes(630)).toBe(630);
        expect(toReminderBucketMinutes(631)).toBe(630);
        expect(toReminderBucketMinutes(659)).toBe(630);
        expect(toReminderBucketMinutes(660)).toBe(660);
    });

    it('picks the reminder kind only at the start and 30-minutes-before-close buckets', () => {
        const prefs = { ...FASTING, fastingPreset: 'win_1030_1830' }; // 시작 10:30 / 마감임박 18:00
        expect(resolveDietReminderKindAt(prefs, 630)).toBe('start');
        expect(resolveDietReminderKindAt(prefs, 632)).toBe('start');   // 지연 실행
        expect(resolveDietReminderKindAt(prefs, 1080)).toBe('close');
        expect(resolveDietReminderKindAt(prefs, 660)).toBe('');
        expect(resolveDietReminderKindAt(prefs, 1110)).toBe('');       // 종료 시각엔 보내지 않음
    });

    it('keeps default users on the legacy reminder buckets', () => {
        const fasting = { ...FASTING, fastingPreset: LEGACY_WINDOW_PRESET };
        expect(resolveDietReminderKindAt(fasting, 720)).toBe('start');   // 12:00
        expect(resolveDietReminderKindAt(fasting, 1170)).toBe('close');  // 19:30

        const general = { ...GENERAL, fastingPreset: LEGACY_WINDOW_PRESET };
        expect(resolveDietReminderKindAt(general, 690)).toBe('start');   // 11:30
        expect(resolveDietReminderKindAt(general, 1050)).toBe('close');  // 17:30
        expect(resolveDietReminderKindAt(general, 720)).toBe('');
    });
});
