// 해빛 배지 카드 — 포인트로 배지 사기, 해외 회원은 해외 기프트카드 투표까지.
// 자산 탭의 해빛 마켓 바로 위에 스크립트가 만들어 넣는다(index.html 에는 없다).
//   국내 접속(시간대 서울): 해빛 배지 카드를 접어 둔다. 펼치기 전에는 서버를 부르지 않는다.
//   해외 접속(시간대가 서울이 아님): 해빛 배지를 펼치고, 해빛 마켓을 접어 둔다.
// 배지마다 활동 기준이 있다(못 넘으면 🔒). 가진 배지 하나를 대표로 달면 갤러리 글·댓글과 카톡 단톡방 챗봇 순위에서
// 이름 앞에 붙는다. 배지마다 보유자 수를 보여 준다.
// 해빛 마켓의 내용·교환 흐름은 건드리지 않는다. 접고 펴는 class 와 버튼만 붙인다.
// 서버: functions/global-rewards.js, 설계: tasks/2026-10-16_해외_2단계_보상_조사와_설계.md
import { auth, functions } from './firebase-config.js?v=542';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { showToast } from './ui-helpers.js?v=542';
import { isEnglishLocale } from './i18n.js?v=542';
import { getActiveMemberTimeZone } from './member-time.js?v=542';
import {
    GLOBAL_GIFT_CARD_VOTE_COUNTRIES,
    describeBadgeRequirement,
    describeVoteProgress,
    getVoteCountryLabel,
    isOverseasTimeZone,
} from './global-rewards-core.js?v=542';

const CARD_ID = 'global-reward-card';
const MARKET_TOGGLE_ID = 'reward-market-collapse-toggle';
const COLLAPSED_CLASS = 'is-collapsed';

let getGlobalRewardSnapshotFn = null;
let purchaseGlobalBadgeFn = null;
let setDisplayBadgeFn = null;
let voteGlobalGiftCardFn = null;
let loadSequence = 0;
let busy = false;
let lastSnapshot = null;
// 접힘 상태. 자산 탭이 다시 그려져도 회원이 바꾼 상태를 지킨다. 회원·국내/해외가 바뀌면 기본값으로.
let collapse = { key: '', badge: false, market: false };

function ensureFunctions() {
    if (getGlobalRewardSnapshotFn) return;
    getGlobalRewardSnapshotFn = httpsCallable(functions, 'getGlobalRewardSnapshot');
    purchaseGlobalBadgeFn = httpsCallable(functions, 'purchaseGlobalBadge');
    setDisplayBadgeFn = httpsCallable(functions, 'setDisplayBadge');
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

function toggleLabel(collapsed) {
    return collapsed ? copy('펼치기', 'Expand') : copy('접기', 'Collapse');
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
    const marketCard = section.querySelector('.reward-market-card');
    if (marketCard) {
        marketCard.before(card);
    } else {
        section.appendChild(card);
    }
    return card;
}

// 해외 접속이면 해빛 마켓에 접기 버튼을 붙이고, 국내 접속이면 마켓을 원래대로 둔다.
function applyMarketCollapse(overseas) {
    const marketCard = document.querySelector('#assets .reward-market-card');
    if (!marketCard) return;
    let toggle = document.getElementById(MARKET_TOGGLE_ID);
    if (!overseas) {
        toggle?.remove();
        marketCard.classList.remove(COLLAPSED_CLASS);
        return;
    }
    if (!toggle) {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.id = MARKET_TOGGLE_ID;
        toggle.className = 'reward-card-collapse-toggle';
        toggle.addEventListener('click', () => {
            collapse.market = !collapse.market;
            applyMarketCollapse(true);
        });
        marketCard.querySelector('.reward-market-header')?.appendChild(toggle);
    }
    marketCard.classList.toggle(COLLAPSED_CLASS, collapse.market);
    toggle.textContent = toggleLabel(collapse.market);
    toggle.setAttribute('aria-expanded', String(!collapse.market));
}

function renderBadge(badge, coins, displayBadge) {
    const lang = isEnglishLocale() ? 'en' : 'ko';
    const name = escapeHtml(badge.name?.[lang] || badge.id);
    const desc = escapeHtml(badge.desc?.[lang] || '');
    const holders = Math.max(0, Number(badge.holders) || 0);
    const disabled = busy ? ' disabled' : '';
    let action;
    if (badge.owned && badge.id === displayBadge) {
        action = '<span class="global-reward-badge-actions">'
            + `<span class="global-reward-badge-owned">${escapeHtml(copy('대표 배지', 'Shown by my name'))}</span>`
            + `<button type="button" class="global-reward-badge-unpin" data-display-badge=""${disabled}>`
            + `${escapeHtml(copy('떼기', 'Remove'))}</button>`
            + '</span>';
    } else if (badge.owned) {
        action = `<button type="button" class="global-reward-badge-pin" data-display-badge="${escapeHtml(badge.id)}"${disabled}>`
            + `${escapeHtml(copy('대표로 달기', 'Show by my name'))}</button>`;
    } else {
        // 활동 기준을 못 넘었으면 포인트가 있어도 잠근다. 서버도 살 때 기록을 다시 세서 확인한다.
        const locked = badge.requirement ? !badge.requirement.met : false;
        const short = coins < badge.pointCost;
        action = `<button type="button" class="global-reward-badge-buy"`
            + ` data-badge-id="${escapeHtml(badge.id)}"${locked || short || busy ? ' disabled' : ''}>`
            + `${escapeHtml(formatPoints(badge.pointCost))}</button>`;
    }
    const requirementLine = !badge.owned && badge.requirement
        ? `<small class="global-reward-badge-requirement${badge.requirement.met ? ' is-met' : ''}">`
            + `${escapeHtml(`${badge.requirement.met ? '✓' : '🔒'} ${describeBadgeRequirement(badge.requirement, isEnglishLocale())}`)}</small>`
        : '';
    return `<li class="global-reward-badge${badge.owned ? ' is-owned' : ''}">`
        + `<span class="global-reward-badge-emoji" aria-hidden="true">${escapeHtml(badge.emoji)}</span>`
        + `<span class="global-reward-badge-text"><strong>${name}</strong><small>${desc}</small>`
        + requirementLine
        + `<small class="global-reward-badge-holders">${escapeHtml(copy(`보유 ${holders}명`, `${holders} own this`))}</small></span>`
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

function renderHeader() {
    return '<div class="global-reward-header">'
        + '<div>'
        + `<h3>🏅 ${escapeHtml(copy('해빛 배지', 'Haebit Badges'))}</h3>`
        + `<p class="reward-market-caption">${escapeHtml(copy(
            '포인트로 배지를 살 수 있어요. 배지 가격만큼 포인트가 빠져요.',
            'Use your points to buy badges. Each badge costs the points shown.'
        ))}</p>`
        + '</div>'
        + `<button type="button" class="reward-card-collapse-toggle" data-badge-toggle aria-expanded="${!collapse.badge}">`
        + `${escapeHtml(toggleLabel(collapse.badge))}</button>`
        + '</div>';
}

// 스냅샷이 없으면(접힌 채 아직 한 번도 펼치지 않음) 머리글만 그린다.
function render(snapshot) {
    const card = ensureCard();
    if (!card) return;
    card.classList.toggle(COLLAPSED_CLASS, collapse.badge);
    if (!snapshot) {
        card.innerHTML = renderHeader();
        return;
    }
    const badges = Array.isArray(snapshot.badges) ? snapshot.badges : [];
    const coins = Number(snapshot.coins) || 0;
    const ownedCount = badges.filter((badge) => badge.owned).length;
    const displayBadge = String(snapshot.displayBadge || '');
    const shown = badges.find((badge) => badge.id === displayBadge);
    card.innerHTML = renderHeader()
        + `<div class="global-reward-balance">${escapeHtml(copy('내 포인트', 'Your points'))} `
        + `<strong>${escapeHtml(formatPoints(coins))}</strong>`
        + ` · ${escapeHtml(copy(`배지 ${ownedCount}/${badges.length}`, `Badges ${ownedCount}/${badges.length}`))}</div>`
        + `<p class="global-reward-display-note">${escapeHtml(shown
            ? copy(`${shown.emoji} 대표 배지가 갤러리와 카톡 단톡방 순위에서 내 이름 앞에 보여요.`,
                `${shown.emoji} appears before your name in the gallery and in member rankings.`)
            : copy('배지를 하나 대표로 달면 갤러리와 카톡 단톡방 순위에서 내 이름 앞에 보여요.',
                'Pick a badge to show before your name in the gallery and in member rankings.'))}</p>`
        + `<ul class="global-reward-badges">${badges.map((badge) => renderBadge(badge, coins, displayBadge)).join('')}</ul>`
        + (snapshot.overseas && snapshot.vote ? renderVote(snapshot.vote) : '');
}

function errorMessage(error, fallbackKo, fallbackEn) {
    const reason = error?.details?.reason;
    if (reason === 'insufficient-points') return copy('포인트가 모자라요.', 'Not enough points yet.');
    if (reason === 'requirement-not-met') return copy('아직 이 배지의 활동 기준을 넘지 않았어요.', 'You have not reached this badge yet.');
    if (reason === 'not-overseas') return copy('해외 시간대 회원만 투표할 수 있어요.', 'Only members abroad can vote.');
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

async function fetchAndRender() {
    ensureFunctions();
    const sequence = ++loadSequence;
    try {
        const { data } = await getGlobalRewardSnapshotFn();
        if (sequence !== loadSequence) return;
        lastSnapshot = data;
        const shown = (data?.badges || []).find((badge) => badge.id === data?.displayBadge);
        window._userDisplayBadgeEmoji = shown?.emoji || '';
        render(data);
    } catch (error) {
        // 배지 카드 내용만 비고 다른 자산 화면은 그대로다. 다음 자산 탭 열기·펼치기 때 다시 시도한다.
        console.warn('haebit badges load failed:', error?.code || '', error?.message || error);
    }
}

async function purchaseBadge(badgeId) {
    await runAction(async () => {
        try {
            const { data } = await purchaseGlobalBadgeFn({ badgeId });
            if (Number.isFinite(Number(data?.coins))) {
                window.applyKnownCoinBalanceToUi?.(Number(data.coins));
            }
            await fetchAndRender();
            showToast(data?.alreadyOwned
                ? copy('이미 가진 배지예요.', 'You already have this badge.')
                : copy('배지를 받았어요.', 'Badge added.'));
        } catch (error) {
            console.warn('haebit badge purchase failed:', error?.code || '', error?.message || error);
            showToast(errorMessage(error, '배지를 사지 못했어요. 잠시 후 다시 해 주세요.', 'Could not buy the badge. Please try again.'));
        }
    });
}

async function changeDisplayBadge(badgeId) {
    await runAction(async () => {
        try {
            const { data } = await setDisplayBadgeFn({ badgeId });
            lastSnapshot = { ...lastSnapshot, displayBadge: data?.displayBadge || '' };
            window._userDisplayBadgeEmoji = data?.displayBadgeEmoji || '';
            showToast(data?.displayBadge
                ? copy('대표 배지로 달았어요.', 'Badge will show by your name.')
                : copy('대표 배지를 뗐어요.', 'Badge removed from your name.'));
        } catch (error) {
            console.warn('display badge change failed:', error?.code || '', error?.message || error);
            showToast(copy('대표 배지를 바꾸지 못했어요. 잠시 후 다시 해 주세요.', 'Could not change it. Please try again.'));
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
            console.warn('gift card vote failed:', error?.code || '', error?.message || error);
            showToast(errorMessage(error, '투표하지 못했어요. 잠시 후 다시 해 주세요.', 'Could not save your vote. Please try again.'));
        }
    });
}

function toggleBadgeCard() {
    collapse.badge = !collapse.badge;
    render(lastSnapshot);
    if (!collapse.badge && !lastSnapshot) fetchAndRender();
}

function handleClick(event) {
    if (event.target.closest?.('[data-badge-toggle]')) {
        toggleBadgeCard();
        return;
    }
    const pin = event.target.closest?.('[data-display-badge]');
    if (pin && !pin.disabled) {
        changeDisplayBadge(pin.dataset.displayBadge);
        return;
    }
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
    const uid = auth.currentUser?.uid;
    if (!uid) {
        removeCard();
        applyMarketCollapse(false);
        lastSnapshot = null;
        return;
    }

    const overseas = isOverseasTimeZone(zone);
    const key = `${uid}|${overseas ? 'overseas' : 'domestic'}`;
    if (collapse.key !== key) {
        // 국내: 배지 접고 마켓 펼침. 해외: 배지 펼치고 마켓 접음.
        collapse = { key, badge: !overseas, market: overseas };
        lastSnapshot = null;
    }
    installClickHandler();
    applyMarketCollapse(overseas);

    // 접혀 있으면 서버를 부르지 않는다. 한 번 펼쳤으면 그 뒤로는 자산 탭을 열 때마다 새로 받는다.
    if (collapse.badge && !lastSnapshot) {
        render(null);
        return;
    }
    if (!lastSnapshot) render(null);
    await fetchAndRender();
}
