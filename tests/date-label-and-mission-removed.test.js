import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readRepoFile } from './source-helpers.js';
import { formatRecordDateLabel } from '../js/date-label.js';
import { FEATURE_BADGES } from '../js/feature-unlock.js';

// 2026-11-13 대표:
//  - 날짜를 "11. 13. (금)" 처럼 연도 없이. "이거 좋다 그러면 이름과 해빛 로고 좀 더 키워도 되겠다"
//  - "캡쳐에 보듯 화면밝기 찌그러져서 나와."
//  - 주간 미션: "빼자" (최근 4주에 쓴 회원 8명)

const require = createRequire(import.meta.url);
const SERVER_BADGES = require('../functions/feature-badges.js');

const INDEX = readRepoFile('index.html');
const APP = readRepoFile('js/app-core.js');
const BASE_CSS = readRepoFile('styles-base.css');
const FEATURE_CSS = readRepoFile('styles-features.css');
const LABEL = readRepoFile('js/date-label.js');

describe('the header date is short', () => {
    it('drops the year for this year and adds the weekday', () => {
        expect(formatRecordDateLabel('2026-11-13', '2026-11-13')).toBe('11. 13. (금)');
        expect(formatRecordDateLabel('2026-01-05', '2026-11-13')).toBe('1. 5. (월)');
        expect(formatRecordDateLabel('2026-11-13', '2026-11-13', true)).toBe('Nov 13 (Fri)');
    });

    it('keeps the year when looking at another year', () => {
        expect(formatRecordDateLabel('2025-12-31', '2026-11-13')).toBe('25. 12. 31. (수)');
        expect(formatRecordDateLabel('2025-12-31', '2026-11-13', true)).toBe('Dec 31, 2025 (Wed)');
    });

    it('writes nothing for a value that is not a date', () => {
        expect(formatRecordDateLabel('', '2026-11-13')).toBe('');
        expect(formatRecordDateLabel('13/11/2026', '2026-11-13')).toBe('');
    });

    it('keeps the real date box on top, see-through, so a tap still opens the calendar', () => {
        expect(INDEX).toMatch(/<span class="date-label" id="selected-date-label" aria-hidden="true"><\/span>\s*<input type="date" id="selected-date"/);
        expect(BASE_CSS).toMatch(/\.date-label:not\(:empty\) \+ \.date-input \{[^}]*position: absolute;[^}]*opacity: 0;/);
    });

    it('follows the date when code sets it without an event', () => {
        // 날짜는 여러 곳에서 input.value = ... 로 바뀐다. 그때는 change 가 나지 않는다.
        expect(LABEL).toContain("Object.defineProperty(input, 'value', {");
        expect(LABEL).toContain("input.addEventListener('change', render);");
    });

    it('gives the room to a bigger name and logo', () => {
        expect(BASE_CSS).toMatch(/\.header #user-greeting \{ font-size: 17px;/);
        expect(BASE_CSS).toMatch(/\.header #user-greeting img \{ width: 28px !important; height: 28px !important;/);
    });
});

describe('the screen brightness row is not squeezed', () => {
    it('keeps the title on one line and the button at its own width', () => {
        expect(FEATURE_CSS).toContain('.profile-theme-row .profile-notification-title { flex: none; white-space: nowrap; }');
        expect(FEATURE_CSS).toContain('.profile-theme-row .profile-notification-btn { flex: none; width: auto; margin: 0; }');
    });
});

describe('weekly missions are off the screen', () => {
    it('hides the card without deleting what members saved', () => {
        expect(FEATURE_CSS).toContain('.mission-card-enhanced { display: none !important; }');
        // 기록을 읽고 쓰는 코드는 그대로다. 되살릴 때 데이터가 남아 있어야 한다.
        expect(APP).toContain('weeklyMissionData');
        expect(INDEX).toContain('class="card metrics-card mission-card-enhanced"');
    });

    it('no longer promises missions with the 7-day badge, on the app or the server', () => {
        const habit = FEATURE_BADGES.find((badge) => badge.id === 'habit');
        expect(habit.features).toEqual(['challenge']);
        const serverSource = readRepoFile('functions/feature-badges.js');
        expect(serverSource).toContain('{ id: "habit", days: 7, cost: 100, features: Object.freeze(["challenge"]) }');
        expect(typeof SERVER_BADGES.claimFeatureBadge).toBe('function');
    });

    it('takes a member who just got that badge to the challenge, not to a hidden card', () => {
        expect(APP).toContain("habit: ['#assets .wallet-challenge-card'],");
        expect(APP).toContain("openTab(badgeId === 'habit' ? 'assets' : 'dashboard');");
    });
});
