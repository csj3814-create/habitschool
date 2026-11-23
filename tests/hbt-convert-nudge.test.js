import { describe, expect, it } from 'vitest';
import {
    HBT_CONVERT_NUDGE_MIN_POINTS,
    HBT_CONVERT_NUDGE_SNOOZE_DAYS,
    shouldShowHbtConvertNudge
} from '../js/hbt-convert-nudge.js';
import { readRepoFile } from './source-helpers.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 23);

// 2026-11-23 대표: 포인트가 쌓인 웹 회원에게 HBT 전환을 눈에 띄게. 플레이 앱에서는 절대 보이지 않는다.
describe('HBT convert nudge', () => {
    it('shows on the web from 1,000P', () => {
        expect(HBT_CONVERT_NUDGE_MIN_POINTS).toBe(1000);
        expect(shouldShowHbtConvertNudge({ coins: 999, nowMs: NOW })).toBe(false);
        expect(shouldShowHbtConvertNudge({ coins: 1000, nowMs: NOW })).toBe(true);
        expect(shouldShowHbtConvertNudge({ coins: 'x', nowMs: NOW })).toBe(false);
    });

    it('never shows in the Play app, the Android app, simple mode or the Runbickers app', () => {
        for (const flag of ['isPlay', 'isNativeApp', 'isSimple', 'isPartnerCover']) {
            expect(shouldShowHbtConvertNudge({ coins: 5000, [flag]: true, nowMs: NOW })).toBe(false);
        }
    });

    it('stays away for 14 days after "later"', () => {
        expect(HBT_CONVERT_NUDGE_SNOOZE_DAYS).toBe(14);
        expect(shouldShowHbtConvertNudge({ coins: 5000, dismissedAtMs: NOW - 13 * DAY, nowMs: NOW })).toBe(false);
        expect(shouldShowHbtConvertNudge({ coins: 5000, dismissedAtMs: NOW - 15 * DAY, nowMs: NOW })).toBe(true);
    });

    it('is hidden by the Play-mode stylesheet too, and the app passes every gate', () => {
        expect(readRepoFile('styles-base.css')).toContain('.play-mode .hbt-convert-nudge,');
        const app = readRepoFile('js/app-core.js');
        const fn = app.split('function renderHbtConvertNudge(coins) {')[1].split('\n}\n')[0];
        expect(fn).toContain('isPlay: isPlayModeActive()');
        expect(fn).toContain('isNativeApp: !!getRememberedNativeAppSource()');
        expect(fn).toContain('isSimple: isSimpleMode()');
        expect(fn).toContain("isPartnerCover: document.documentElement.classList.contains('partner-cover')");
    });

    it('starts hidden and opens the convert card on the assets tab', () => {
        const html = readRepoFile('index.html');
        expect(html).toContain('<div id="hbt-convert-nudge" class="hbt-convert-nudge" role="note" hidden>');
        expect(html).toContain('onclick="openHbtConvertFromNudge()"');
        const app = readRepoFile('js/app-core.js');
        expect(app).toContain("openTab('assets');");
        expect(app).toContain("document.querySelector('.wallet-convert-card')");
    });
});
