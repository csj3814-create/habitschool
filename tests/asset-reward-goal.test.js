import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 자산 탭의 '가장 가까운 보상' 카드가 1,835P 를 가진 화면에서도
// '현재 포인트를 확인하고 있어요 / 2,000P 남음' 으로 남아 있었다.
//
// 원인은 타이밍이 아니라 구조였다. 포인트 숫자를 화면에 쓰는 곳이 다섯 군데인데
// 그중 하나만 진행바를 함께 갱신했다. 캐시로 숫자만 올라온 화면에서는 카드가
// index.html 에 박힌 초기 문구 그대로 남았다.
const app = readRepoFile('js/app-core.js');
const html = readRepoFile('index.html');

// 본문의 여는 중괄호부터 센다. 파라미터의 구조분해({ a = 0 })를 본문 시작으로
// 오해하면 시그니처만 잘라 온다.
const sliceFn = (source, header) => {
    const start = source.indexOf(header);
    if (start < 0) return '';
    const bodyStart = source.indexOf(') {', start);
    if (bodyStart < 0) return '';
    let depth = 0;
    for (let i = bodyStart + 2; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    }
    return '';
};

// 배포되는 소스에서 함수를 그대로 떼어내 가짜 DOM 위에서 돌린다.
function runUpdateAssetRewardGoal(coins) {
    const els = {
        'asset-reward-goal-copy': { textContent: '' },
        'asset-reward-remaining': { textContent: '' },
        'asset-reward-estimate': { hidden: false, textContent: '' },
    };
    const progressbar = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    els['asset-reward-progress-fill'] = { style: {}, parentElement: progressbar };
    const document = { getElementById: (id) => els[id] || null };
    const body = sliceFn(app, 'function updateAssetRewardGoal(coins, logs = null)');
    if (!body) throw new Error('updateAssetRewardGoal 을 찾지 못했다');
    // logs 를 넘기지 않으므로 날짜 헬퍼 경로는 타지 않는다.
    // eslint-disable-next-line no-new-func
    new Function('document', `${body}\nupdateAssetRewardGoal(${JSON.stringify(coins)});`)(document);
    return {
        copy: els['asset-reward-goal-copy'].textContent,
        remaining: els['asset-reward-remaining'].textContent,
        width: els['asset-reward-progress-fill'].style.width,
        valuenow: progressbar.attrs['aria-valuenow'],
    };
}

describe('보상 진행바 계산', () => {
    it('신고된 화면(1,835P)에서 남은 포인트를 제대로 낸다', () => {
        const r = runUpdateAssetRewardGoal(1835);
        // 화면에 있던 '2,000P 남음' 은 renderer 가 만들 수 없는 값이었다
        expect(r.remaining).toBe('165P 남음');
        expect(r.remaining).not.toBe('2,000P 남음');
        expect(r.copy).toContain('1,835P');
        expect(r.copy).not.toContain('확인하고 있어요');
        expect(r.width).toBe(`${(1835 / 2000) * 100}%`);
        expect(r.valuenow).toBe('1835');
    });

    it('목표를 채우면 교환 가능으로 바뀐다', () => {
        const r = runUpdateAssetRewardGoal(2400);
        expect(r.remaining).toBe('지금 교환 가능');
        expect(r.width).toBe('100%');
        expect(r.valuenow).toBe('2000');
    });

    it('0P 여도 초기 문구가 아니라 계산된 문구가 나온다', () => {
        const r = runUpdateAssetRewardGoal(0);
        expect(r.remaining).toBe('2,000P 남음');
        // 숫자는 같아도 설명은 반드시 갱신돼야 한다 — 이게 초기 상태와의 구분점이다
        expect(r.copy).toContain('현재 0P');
    });
});

describe('포인트를 쓰는 모든 경로가 진행바도 갱신한다', () => {
    // 이 목록에서 하나라도 빠지면 "숫자는 보이는데 진행바만 초기 상태" 가 재발한다.
    const writers = [
        'function applyCachedPointBalanceFromStorage(',
        'function applyPointBalanceSnapshot(',
        'function applyKnownCoinBalanceToUi(',
    ];

    it.each(writers)('%s 가 진행바를 함께 갱신한다', (header) => {
        const body = sliceFn(app, header);
        expect(body).not.toBe('');
        expect(body).toMatch(/updateAssetRewardGoal\(|applyKnownCoinBalanceToUi\(/);
    });

    it('캐시 표시 경로가 공용 writer 를 거친다', () => {
        const body = sliceFn(app, 'function applyCachedAssetDisplay(uid)');
        expect(body).toContain('applyKnownCoinBalanceToUi(pointsValue)');
    });

    it('포인트를 HBT 로 바꾸면 남은 포인트도 다시 계산된다', () => {
        const body = sliceFn(app, 'window.applyOptimisticConversionResult = function');
        expect(body).toContain('updateAssetRewardGoal(nextPoints)');
    });
});

describe('자산 재조회를 건너뛰는 경로', () => {
    it('30초 캐시 히트에서도 진행바를 맞춘다', () => {
        const display = sliceFn(app, 'window.updateAssetDisplay = async function');
        const cacheHit = display.slice(display.indexOf('_assetCache.uid === user.uid'));
        const untilReturn = cacheHit.slice(0, cacheHit.indexOf('return;'));
        expect(untilReturn).toContain('ensureAssetRewardGoalRendered(user.uid)');
    });

    it('사용자 문서를 못 받아도 캐시 잔액으로 진행바를 채운다', () => {
        expect(app).toContain('ensureAssetRewardGoalRendered(user.uid)');
        expect(app.match(/ensureAssetRewardGoalRendered\(user\.uid\)/g) || []).toHaveLength(2);
    });

    it('ensureAssetRewardGoalRendered 는 성공 경로와 같은 순서로 잔액을 찾는다', () => {
        const body = sliceFn(app, 'function ensureAssetRewardGoalRendered(uid)');
        expect(body).toContain('readAssetDisplayCache(uid)');
        expect(body).toContain("parseDisplayedAssetNumber('asset-points-display')");
        expect(body).toContain('updateAssetRewardGoal(coins)');
        // 잔액을 모르면 아무것도 하지 않아야 한다(0 으로 덮어쓰면 안 됨)
        expect(body).toContain('if (coins == null) return false;');
    });
});

describe('초기 마크업', () => {
    it('초기 문구가 여전히 화면 기본값으로 존재한다 — 갱신되지 않으면 이게 보인다', () => {
        expect(html).toContain('현재 포인트를 확인하고 있어요.');
        expect(html).toContain('id="asset-reward-remaining"');
    });
});
