// 영어 앱 자산 탭 (해외 3단계 E3-1, 2026-10-21). 포인트·해빛 배지·투표·해빛 마켓·쿠폰 보관함·무료 3일 미니 챌린지를 연다.
// HBT 부분은 번역(E3-2)까지 플레이 앱(라이트)과 같은 모양으로 숨긴다. E3-2 에서 영어 웹은 HBT 를 연다(대표 결정).

import { afterEach, describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { getAllowedTabsForRoute, getRouteContext } from '../js/app-mode.js';
import { formatChallengeQualificationLabel } from '../js/blockchain-config.js';
import { describeRewardGap } from '../js/reward-pace.js';

const HANGUL = /[가-힣]/;
const EN_INDEX = readRepoFile('en/index.html');
const EN_CSS = readRepoFile('styles-en.css').replace(/\/\*[\s\S]*?\*\//g, '');

function onPath(pathname) {
    globalThis.window = { location: { pathname, origin: 'https://habitschool.web.app' } };
}
afterEach(() => { delete globalThis.window; });

describe('영어 앱에 자산 탭이 열린다', () => {
    it('탭 목록에 자산이 있고 탭 단추는 영어다', () => {
        expect(getAllowedTabsForRoute(getRouteContext('/en'))).toContain('assets');
        expect(EN_INDEX).toMatch(/data-i18n="tab\.assetsLabel">💰 Assets<\/button>/);
    });

    it('HBT 부분은 번역 전까지 영어에서 숨고, 라이트 안내 문구가 보인다', () => {
        for (const selector of ['#wallet-asset-hbt-item', '#wallet-minichart', '.wallet-convert-card', '.asset-advanced-details', '.wallet-halving-card', '.wallet-info-card', '.wallet-tx-card', '#tier-card-weekly', '#tier-card-master', '.play-hide-note']) {
            expect(EN_CSS, selector).toContain(`html.locale-en ${selector}`);
        }
        expect(EN_CSS).toMatch(/html\.locale-en \.play-only-note \{\s*display: block;/);
    });

    it('영어 자산 탭에서 보이는 정적 글자에 한글이 없다', () => {
        const start = EN_INDEX.indexOf('<div id="assets"');
        const end = EN_INDEX.indexOf('<div id="diet" class="content-section"', start);
        let section = EN_INDEX.slice(start, end).replace(/<!--[\s\S]*?-->/g, '');
        // 숨는 HBT 묶음(전환·반감기·지갑·거래 기록)은 E3-2 에서 다룬다.
        section = section.slice(0, section.indexOf('<div class="card wallet-convert-card">'))
            + section.slice(section.indexOf('<div class="card reward-market-card'), section.indexOf('<div class="card wallet-halving-card') > -1 ? section.indexOf('<div class="card wallet-halving-card') : section.length);
        const text = section.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
        const korean = text.split(' ').filter((w) => HANGUL.test(w));
        expect(korean).toEqual([]);
    });
});

describe('자산 탭 코드 문구', () => {
    it('챌린지 인정 기준', () => {
        onPath('/en');
        expect(formatChallengeQualificationLabel('mini')).toBe('A day counts when you log food, exercise and mind');
        expect(formatChallengeQualificationLabel('weekly')).toMatch(/^A day counts at \d+P or more$/);
        onPath('/');
        expect(formatChallengeQualificationLabel('mini')).toBe('식단·운동·마음을 모두 기록하면 1일 인정');
    });

    it('쿠폰까지 남은 거리', () => {
        const context = { dailyMaxPoints: 100, streak: 0, milestones: {} };
        onPath('/en');
        const en = describeRewardGap(500, context, 'P');
        if (en) expect(en.text).not.toMatch(HANGUL);
        onPath('/');
        const ko = describeRewardGap(500, context, 'P');
        if (ko) expect(ko.text).toContain('남았어요');
    });
});
