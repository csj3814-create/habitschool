// 영어 앱 자산 탭 (해외 3단계 E3-1, 2026-10-21). 포인트·해빛 배지·투표·해빛 마켓·쿠폰 보관함·무료 3일 미니 챌린지를 연다.
// E3-2(같은 날): HBT 를 번역하고 영어 웹에 연다(대표 결정). 플레이 앱만 계속 숨긴다.

import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readRawRepoFile, readRepoFile } from './source-helpers.js';
import { ROOT_DIR } from './korean-text-inventory.mjs';
import { EN_MESSAGES } from '../js/i18n-en.js';
import { KO_MESSAGES } from '../js/i18n-ko.js';
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

    it('영어 웹은 HBT 를 숨기지 않는다 (E3-2, 대표 결정). 플레이 앱은 .play-mode 규칙이 숨긴다', () => {
        expect(EN_CSS).not.toMatch(/html\.locale-en [^{]*(#wallet-asset-hbt-item|\.wallet-convert-card|\.wallet-halving-card|\.wallet-tx-card|#tier-card-weekly)/);
        const baseCss = readRawRepoFile('styles-base.css');
        for (const selector of ['#wallet-asset-hbt-item', '#wallet-minichart', '.wallet-convert-card', '.asset-advanced-details', '#tier-card-weekly', '#tier-card-master']) {
            expect(baseCss, selector).toContain(`.play-mode ${selector}`);
        }
    });

    it('영어 자산 탭·HBT 창에서 보이는 정적 글자에 한글이 없다 (HBT 카드 포함)', () => {
        const visibleKorean = (start, end) => {
            const from = EN_INDEX.indexOf(start);
            const section = EN_INDEX.slice(from, EN_INDEX.indexOf(end, from))
                .replace(/<!--[\s\S]*?-->/g, '')
                .replace(/<script[\s\S]*?<\/script>/g, '');
            const attrs = [...section.matchAll(/\s(?:placeholder|aria-label|alt)="([^"]*)"/g)].map((m) => m[1]).join(' ');
            const text = `${section.replace(/<[^>]*>/g, ' ')} ${attrs}`.replace(/\s+/g, ' ');
            return text.split(' ').filter((w) => HANGUL.test(w));
        };
        // 전환 확인 창(#convert-confirm-modal)은 자산 구역 안에 있다.
        expect(visibleKorean('<div id="assets"', '<div id="diet" class="content-section"')).toEqual([]);
        expect(visibleKorean('id="legacy-wallet-export-modal"', '</div>\n    </div>\n')).toEqual([]);
    });
});

describe('해빛 마켓 안의 한글 (2026-10-21 스테이징에서 대표가 찾음)', () => {
    // 코드에 '바로 ...' 처럼 기호로 적힌 한글은 한글 검색에 걸리지 않아 E3-1 때 빠졌다.
    it('js 파일에 한글을 \\u 기호로 숨겨 적지 않는다', () => {
        const hidden = readdirSync(join(ROOT_DIR, 'js'))
            .filter((name) => name.endsWith('.js'))
            .filter((name) => /(\\u[a-d][0-9a-f]{3}){2,}/i.test(readRawRepoFile(`js/${name}`)));
        expect(hidden).toEqual([]);
    });

    it('상품마다 영어 브랜드·상품 이름이 사전에 있다', () => {
        const skus = [...readRawRepoFile('functions/reward-market.js')
            .split('const DEFAULT_REWARD_CATALOG')[1].split(']);')[0]
            .matchAll(/sku: "([^"]+)"/g)].map((m) => m[1]);
        expect(skus.length).toBeGreaterThan(0);
        for (const sku of skus) {
            for (const field of ['brandName', 'displayName']) {
                const value = EN_MESSAGES[`market.catalog.${sku}.${field}`];
                expect(value, `${sku}.${field}`).toBeTruthy();
                expect(value).not.toMatch(HANGUL);
            }
        }
    });

    it('상품 이름은 한국어 사전에 없어서 한국어 화면은 기프티쇼 이름 그대로다', () => {
        expect(Object.keys(KO_MESSAGES).filter((key) => key.startsWith('market.catalog.'))).toEqual([]);
    });
});

describe('HBT 코드 문구 (E3-2)', () => {
    // 주석·console 을 뺀 뒤 남은 한국어는 서버 오류 글자와 비교하는 msg.includes('...') 뿐이어야 한다.
    it('js/blockchain-manager.js 에 화면으로 나가는 한국어가 없다', () => {
        const leftovers = readRawRepoFile('js/blockchain-manager.js')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .map((line) => line.replace(/(^|\s)\/\/.*$/, '').trim())
            .filter((line) => HANGUL.test(line))
            .filter((line) => !/^console\.(log|warn|error|info|debug)\(/.test(line))
            .filter((line) => !/msg\.includes\('[^']*[가-힣]/.test(line));
        expect(leftovers).toEqual([]);
    });

    it('체인 이름은 언어를 따른다', async () => {
        const { BSC_CONFIG } = await import('../js/blockchain-config.js');
        onPath('/en');
        expect(BSC_CONFIG.mainnet.label).toBe('BSC Mainnet');
        onPath('/');
        expect(BSC_CONFIG.mainnet.label).toBe('BSC 메인넷');
        expect(BSC_CONFIG.testnet.label).toBe('BSC 테스트넷');
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
