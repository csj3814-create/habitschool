/**
 * utils.test.js
 * 유틸리티 함수 테스트 (날짜, JSON 직렬화 등)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// === getKstDateString (ui-helpers.js) ===
function getKstDateString() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function getKstDateObj() {
    return new Date(getKstDateString() + 'T12:00:00Z');
}

function getDatesInfo() {
    const todayStr = getKstDateString();
    const todayNoon = new Date(todayStr + 'T12:00:00Z');
    const yesNoon = new Date(todayNoon.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesNoon.toISOString().split('T')[0];
    const dayOfWeek = todayNoon.getUTCDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayNoon = new Date(todayNoon.getTime() + diffToMon * 24 * 60 * 60 * 1000);
    let weekStrs = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(mondayNoon.getTime() + i * 24 * 60 * 60 * 1000);
        weekStrs.push(d.toISOString().split('T')[0]);
    }
    return { todayStr, yesterdayStr, weekStrs };
}

// === sanitize (data-manager.js) ===
function sanitize(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
}

describe('getKstDateString', () => {
    it('YYYY-MM-DD 형식 반환', () => {
        const result = getKstDateString();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('getKstDateObj', () => {
    it('Date 객체 반환', () => {
        const result = getKstDateObj();
        expect(result).toBeInstanceOf(Date);
        expect(result.getTime()).not.toBeNaN();
    });
});

describe('getDatesInfo', () => {
    it('todayStr는 YYYY-MM-DD 형식', () => {
        const { todayStr } = getDatesInfo();
        expect(todayStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('yesterdayStr는 오늘보다 하루 전', () => {
        const { todayStr, yesterdayStr } = getDatesInfo();
        const today = new Date(todayStr + 'T12:00:00Z');
        const yesterday = new Date(yesterdayStr + 'T12:00:00Z');
        const diff = today.getTime() - yesterday.getTime();
        expect(diff).toBe(24 * 60 * 60 * 1000);
    });

    it('weekStrs는 7개 날짜 (월~일)', () => {
        const { weekStrs } = getDatesInfo();
        expect(weekStrs).toHaveLength(7);
        weekStrs.forEach(d => {
            expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
    });

    it('weekStrs[0]은 월요일', () => {
        const { weekStrs } = getDatesInfo();
        const monday = new Date(weekStrs[0] + 'T12:00:00Z');
        expect(monday.getUTCDay()).toBe(1); // 0=일, 1=월
    });

    it('weekStrs가 연속 7일', () => {
        const { weekStrs } = getDatesInfo();
        for (let i = 1; i < 7; i++) {
            const prev = new Date(weekStrs[i - 1] + 'T12:00:00Z');
            const curr = new Date(weekStrs[i] + 'T12:00:00Z');
            expect(curr.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
        }
    });
});

describe('sanitize (undefined → null 변환)', () => {
    it('undefined 값을 null로 변환', () => {
        const input = { a: 1, b: undefined, c: 'hello' };
        const result = sanitize(input);
        expect(result).toEqual({ a: 1, b: null, c: 'hello' });
    });

    it('중첩 객체에서도 동작', () => {
        const input = { outer: { inner: undefined, value: 42 } };
        const result = sanitize(input);
        expect(result).toEqual({ outer: { inner: null, value: 42 } });
    });

    it('배열 내 undefined 처리', () => {
        const input = { arr: [1, undefined, 3] };
        const result = sanitize(input);
        expect(result).toEqual({ arr: [1, null, 3] });
    });

    it('모든 값이 정상이면 그대로 반환', () => {
        const input = { name: '홍길동', score: 85, active: true };
        const result = sanitize(input);
        expect(result).toEqual(input);
    });
});
