// 해외 회원 보상 카드 — 포인트로 배지 사기 · 해외 기프트카드 투표.
// 해외 회원(시간대가 서울이 아님)일 때만 자산 탭에 카드를 만들어 넣는다.
// 한국 회원이면 서버를 부르지 않고 DOM 도 건드리지 않는다. 기프티쇼 마켓은 모두에게 그대로다.
// 서버: functions/global-rewards.js, 설계: tasks/2026-10-16_해외_2단계_보상_조사와_설계.md
import { auth, functions } from './firebase-config.js?v=518';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { showToast } from './ui-helpers.js?v=518';
import { isEnglishLocale } from './i18n.js?v=518';
import { getActiveMemberTimeZone } from './member-time.js?v=518';
import {
    GLOBAL_GIFT_CARD_VOTE_COUNTRIES,
    describeVoteProgress,
    getVoteCountryLabel,
    shouldShowGlobalRewards,
} from './global-rewards-core.js?v=518';

const CARD_ID = 'global-reward-card';

let getGlobalRewardSnapshotFn = null;
let purchaseGlobalBadgeFn = null;
let voteGlobalGiftCardFn = null;
let loadSequence = 0;
let busy = false;
let lastSnapshot = null;
// 마지막으로 카드를 그릴 때 쓴 시간대. 구매 뒤 다시 불러올 때 같은 기준을 쓴다.
let lastTimeZone;

function ensureFunctions() {
    if (getGlobalRewardSnapshotFn) return;
    getGlobalRewardSnapshotFn = httpsCallable(functions, 'getGlobalRewardSnapshot');
    purchaseGlobalBadgeFn = httpsCallable(functions, 'purchaseGlobalBadge');
    voteGlobalGiftCardFn = httpsCallable(functions, 'voteGlobalGiftCard');
}

function escapeHtml(value = '') {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function copy(ko, en) {
    return isEnglishLocale() ? en : ko;
}

function formatPoints(value) {
    return `${Number(value || 0).toLocaleString(isEnglishLocale() ? 'en-US' : 'ko-KR')}P`;
}

function removeCard() {
    document.getElementById(CARD_ID)?.remove();
}

function ensureCard() {
    let card = document.getElementById(CARD_ID);
    if (card) return card;
    const section = document.getElementById('assets');
    if (!section) return null;
    card = document.createElement('div');
    card.className = 'card global-reward-card';
    card.id = CARD_ID;
    // 해외 회원에게는 한국 쿠폰보다 이 카드가 먼저 쓸모 있다. 기프티쇼 카드 바로 앞에 둔다.
    const marketCard = section.querySelector('.reward-market-card');
    if (marketCard) {
        marketCard.before(card);
    } else {
        section.appendChild(card);
    }
    return card;
}

function renderBadge(badge, coins) {
    const lang = isEnglishLocale() ? 'en' : 'ko';
    const name = escapeHtml(badge.name?.[lang] || badge.id);
    const desc = escapeHtml(badge.desc?.[lang] || '');
    let action;
    if (badge.owned) {
        action = `<span class="global-reward-badge-owned">${escapeHtml(copy('보유 중', 'Owned'))}</span>`;
    } else {
        const short = coins < badge.pointCost;
        action = `<button type="button" class="global-reward-badge-buy"`
            + ` data-badge-id="${escapeHtml(badge.id)}"${short || busy ? ' disabled' : ''}>`
            + `${escapeHtml(formatPoints(badge.pointCost))}</button>`;
    }
    return `<li class="global-reward-badge${badge.owned ? ' is-owned' : ''}">`
        + `<span class="global-reward-badge-emoji" aria-hidden="true">${escapeHtml(badge.emoji)}</span>`
        + `<span class="global-reward-badge-text"><strong>${name}</strong><small>${desc}</small></span>`
        + action
        + '</li>';
}

function renderVote(vote = {}) {
    const isEnglish = isEnglishLocale();
    const selected = vote.voted ? vote.country : '';
    const options = GLOBAL_GIFT_CARD_VOTE_COUNTRIES
        .map((code) => `<option value="${code}"${code === selected ? ' selected' : ''}>`
            + `${escapeHtml(getVoteCountryLabel(code, isEnglish))}</option>`)
        .join('');
    const status = vote.voted
        ? copy(`투표했어요 · ${getVoteCountryLabel(vote.country, false)}`, `You voted · ${getVoteCountryLabel(vote.country, true)}`)
        : '';
    return '<div class="global-reward-vote">'
        + `<div class="global-reward-vote-title">${escapeHtml(copy('해외 기프트카드를 원하세요?', 'Want gift cards where you live?'))}</div>`
        + `<p class="global-reward-vote-copy">${escapeHtml(copy(
            '원하는 분이 충분히 모이면 해외에서 쓸 수 있는 기프트카드를 준비할게요.',
            'If enough members ask, we will add gift cards you can use in your country.'
        ))}</p>`
        + `<div class="global-reward-vote-progress">${escapeHtml(describeVoteProgress(vote, isEnglish))}</div>`
        + '<div class="global-reward-vote-form">'
        + `<label class="global-reward-vote-label" for="global-reward-vote-country">${escapeHtml(copy('사는 나라', 'Where you live'))}</label>`
        + `<select id="global-reward-vote-country" class="global-reward-vote-country"${busy ? ' disabled' : ''}>${options}</select>`
        + `<button type="button" class="global-reward-vote-btn" data-vote-action="vote"${busy ? ' disabled' : ''}>`
        + `${escapeHtml(vote.voted ? copy('나라 바꾸기', 'Update') : copy('원해요', 'I want this'))}</button>`
        + (vote.voted
            ? `<button type="button" class="global-reward-vote-withdraw" data-vote-action="withdraw"${busy ? ' disabled' : ''}>`
                + `${escapeHtml(copy('투표 취소', 'Remove vote'))}</button>`
            : '')
        + '</div>'
        + (status ? `<div class="global-reward-vote-status">${escapeHtml(status)}</div>` : '')
        + '</div>';
}

function render(snapshot) {
    const card = ensureCard();
    if (!card) return;
    const badges = Array.isArray(snapshot.badges) ? snapshot.badges : [];
    const coins = Number(snapshot.coins) || 0;
    const ownedCount = badges.filter((badge) => badge.owned).length;
    card.innerHTML = '<div class="global-reward-header">'
        + `<h3>🌍 ${escapeHtml(copy('해외 회원 보상', 'Rewards for members abroad'))}</h3>`
        + `<p class="reward-market-caption">${escapeHtml(copy(
            '포인트로 배지를 살 수 있어요. 배지 가격만큼 포인트가 빠져요.',
            'Use your points to buy badges. Each badge costs the points shown.'
        ))}</p>`
        + '</div>'
        + `<div class="global-reward-balance">${escapeHtml(copy('내 포인트', 'Your points'))} `
        + `<strong>${escapeHtml(formatPoints(coins))}</strong>`
        + ` · ${escapeHtml(copy(`배지 ${ownedCount}/${badges.length}`, `Badges ${ownedCount}/${badges.length}`))}</div>`
        + `<ul class="global-reward-badges">${badges.map((badge) => renderBadge(badge, coins)).join('')}</ul>`
        + renderVote(snapshot.vote);
}

function errorMessage(error, fallbackKo, fallbackEn) {
    const reason = error?.details?.reason;
    if (reason === 'insufficient-points') return copy('포인트가 모자라요.', 'Not enough points yet.');
    if (reason === 'not-overseas') return copy('해외 시간대 회원만 쓸 수 있어요.', 'Only members abroad can use this.');
    return copy(fallbackKo, fallbackEn);
}

async function runAction(action) {
    if (busy || !lastSnapshot) return;
    busy = true;
    render(lastSnapshot);
    try {
        await action();
    } finally {
        busy = false;
        if (lastSnapshot) render(lastSnapshot);
    }
}

async function purchaseBadge(badgeId) {
    await runAction(async () => {
        try {
            const { data } = await purchaseGlobalBadgeFn({ badgeId });
            if (Number.isFinite(Number(data?.coins))) {
                window.applyKnownCoinBalanceToUi?.(Number(data.coins));
            }
            await loadGlobalRewards({ timeZone: lastTimeZone });
            showToast(data?.alreadyOwned
                ? copy('이미 가진 배지예요.', 'You already have this badge.')
                : copy('배지를 받았어요.', 'Badge added.'));
        } catch (error) {
            console.warn('global badge purchase failed:', error?.code || '', error?.message || error);
            showToast(errorMessage(error, '배지를 사지 못했어요. 잠시 후 다시 해 주세요.', 'Could not buy the badge. Please try again.'));
        }
    });
}

async function vote(actionName) {
    // runAction 이 먼저 카드를 다시 그리면 고른 나라가 초기값으로 돌아간다. 그 전에 읽어 둔다.
    const country = document.getElementById('global-reward-vote-country')?.value || 'OTHER';
    await runAction(async () => {
        try {
            const { data } = await voteGlobalGiftCardFn(actionName === 'withdraw' ? { withdraw: true } : { country });
            lastSnapshot = { ...lastSnapshot, vote: data };
            showToast(actionName === 'withdraw'
                ? copy('투표를 취소했어요.', 'Vote removed.')
                : copy('투표했어요. 고마워요!', 'Thanks for voting!'));
        } catch (error) {
            console.warn('global gift card vote failed:', error?.code || '', error?.message || error);
            showToast(errorMessage(error, '투표하지 못했어요. 잠시 후 다시 해 주세요.', 'Could not save your vote. Please try again.'));
        }
    });
}

function handleClick(event) {
    const buy = event.target.closest?.('.global-reward-badge-buy');
    if (buy && !buy.disabled) {
        purchaseBadge(buy.dataset.badgeId);
        return;
    }
    const voteButton = event.target.closest?.('[data-vote-action]');
    if (voteButton && !voteButton.disabled) {
        vote(voteButton.dataset.voteAction);
    }
}

let clickHandlerInstalled = false;
function installClickHandler() {
    if (clickHandlerInstalled) return;
    clickHandlerInstalled = true;
    document.addEventListener('click', (event) => {
        if (event.target.closest?.(`#${CARD_ID}`)) handleClick(event);
    });
}

/**
 * 자산 탭을 그릴 때 부른다. timeZone 을 주지 않으면 지금 회원 시간대를 쓴다.
 */
export async function loadGlobalRewards({ timeZone } = {}) {
    const zone = timeZone === undefined ? getActiveMemberTimeZone() : timeZone;
    lastTimeZone = zone;
    if (!shouldShowGlobalRewards(zone) || !auth.currentUser) {
        removeCard();
        lastSnapshot = null;
        return;
    }
    ensureFunctions();
    installClickHandler();
    const sequence = ++loadSequence;
    try {
        const { data } = await getGlobalRewardSnapshotFn();
        if (sequence !== loadSequence) return;
        if (!data?.eligible) {
            removeCard();
            lastSnapshot = null;
            return;
        }
        lastSnapshot = data;
        render(data);
    } catch (error) {
        // 카드가 없을 뿐 다른 자산 화면은 그대로다. 다음 자산 탭 열기 때 다시 시도한다.
        console.warn('global rewards load failed:', error?.code || '', error?.message || error);
    }
}
