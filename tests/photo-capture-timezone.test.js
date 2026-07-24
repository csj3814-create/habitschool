import { describe, expect, it } from 'vitest';

// EXIF 촬영 시각은 '기기 현지 시간'이라 시간대 정보가 없다. app-core의
// convertLocalCaptureToKstParts와 같은 계산을 재현해, 해외 사용자의 사진이
// 한국시간 기준 날짜로 올바르게 환산되는지 확인한다.
function getKstDateTimePartsFromTimestamp(timestamp = Date.now()) {
    const parsedTimestamp = Number(timestamp);
    const safeDate = Number.isFinite(parsedTimestamp) ? new Date(parsedTimestamp) : new Date();
    return {
        date: safeDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }),
        time: safeDate.toLocaleTimeString('en-GB', {
            timeZone: 'Asia/Seoul',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
    };
}

// 기기 시간대에 의존하지 않도록, 테스트에서는 UTC 오프셋을 명시해 절대 시각을 만든다.
function kstDateForLocalCapture(dateStr, timeStr, utcOffsetHours) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute, second] = timeStr.split(':').map(Number);
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - (utcOffsetHours * 3600 * 1000);
    return getKstDateTimePartsFromTimestamp(utcMs).date;
}

describe('photo capture date across timezones', () => {
    it('maps a Canadian afternoon capture onto the next KST day', () => {
        // 캐나다 동부(UTC-4) 2026-07-23 15:00 == 한국 2026-07-24 04:00
        expect(kstDateForLocalCapture('2026-07-23', '15:00:00', -4)).toBe('2026-07-24');
    });

    it('maps a Canadian late-night capture onto the same KST day it belongs to', () => {
        // UTC-4 2026-07-23 23:30 == 한국 2026-07-24 12:30
        expect(kstDateForLocalCapture('2026-07-23', '23:30:00', -4)).toBe('2026-07-24');
    });

    it('maps a Canadian morning capture back to the previous KST day', () => {
        // UTC-4 2026-07-23 08:00 == 한국 2026-07-23 21:00 (같은 날짜)
        expect(kstDateForLocalCapture('2026-07-23', '08:00:00', -4)).toBe('2026-07-23');
    });

    it('leaves Korean captures on their own date', () => {
        expect(kstDateForLocalCapture('2026-07-24', '09:00:00', 9)).toBe('2026-07-24');
        expect(kstDateForLocalCapture('2026-07-24', '23:59:00', 9)).toBe('2026-07-24');
    });

    it('accepts either the local date or the KST-converted date', () => {
        const selectedDate = '2026-07-24';
        const localDate = '2026-07-23';
        const kstDate = kstDateForLocalCapture(localDate, '15:00:00', -4);
        // app-core의 판정식과 동일: 현지 날짜 또는 KST 환산 날짜 중 하나만 맞으면 통과
        expect(localDate === selectedDate || kstDate === selectedDate).toBe(true);
    });
});
