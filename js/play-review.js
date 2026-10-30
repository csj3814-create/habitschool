import { t } from './i18n.js?v=562';

/**
 * 플레이 앱 회원에게 평점을 부탁한다 (2026-10-30).
 *
 * 최근 30일 가입 31명 중 12명이 플레이 앱으로 왔는데 스토어 평점은 아직 비어 있다.
 * 기분 좋은 순간 — 연속 기록 보상(3·7·14·30일)을 받은 직후 — 에 부탁한다.
 *
 * - 1.0.12(15) 이상 셸: 앱 안 평점 창 (habitschool://review/request → ReviewActivity).
 *   띄울지는 구글이 정한다. 그래서 단추에 걸지 않고 보상 직후에 저절로 부른다.
 * - 그 전 셸: 앱 안 창이 없으니 스토어로 보내는 카드를 보여 준다.
 * - 웹·아이폰(셸 밖)에서는 아무것도 하지 않는다.
 *
 * 다시 부탁하기 (2026-10-30 대표): 실수로 넘기거나 나중에 추천하고 싶어질 수 있으니,
 * 반응하지 않은 회원에게는 다음 연속 기록 보상 때 한 번 더 부탁한다.
 * - 카드에서 "평가하기"를 눌러 스토어로 간 회원에게는 더 부탁하지 않는다.
 *   (스토어에서 실제로 남겼는지는 알 수 없다 — 간 것을 반응으로 본다.)
 * - 앱 안 평점 창은 회원이 남겼는지 구글이 알려 주지 않는다. 그래서 보상마다 부르고,
 *   이미 남긴 사람·최근에 본 사람에게 다시 띄울지는 구글의 횟수 제한에 맡긴다.
 * - 같은 보상으로는 한 번만, 하루에는 한 번만 — 밀린 보상(3일·7일)을 한꺼번에 받아도
 *   부탁이 겹치지 않는다.
 *
 * 플레이 정책: 평점의 대가로 포인트를 주지 않는다. "앱이 마음에 드세요?" 처럼 먼저
 * 물어 좋다는 사람만 보내지도 않는다. 카드 문구에 보상 얘기를 넣지 않는 것도 그래서다.
 *
 * 부탁한 기록은 그 기기에만 남긴다(규칙 변경 없이).
 */

export const IN_APP_REVIEW_MIN_NATIVE_VERSION = 15;
export const PLAY_REVIEW_MILESTONE_IDS = ['streak3', 'streak7', 'streak14', 'streak30'];
const PLAY_PACKAGE = 'com.habitschool.app';
export const PLAY_STORE_LISTING_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;
// 크롬이 플레이 스토어 앱으로 넘기고, 못 넘기면 스토어 웹 페이지를 연다.
export const PLAY_STORE_INTENT_URL = `intent://details?id=${PLAY_PACKAGE}#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_LISTING_URL)};end`;
const STATE_KEY_PREFIX = 'habitschoolPlayReview:';
const PROMPT_DELAY_MS = 1500;

function todayKst() {
    return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

/**
 * state: { asked: { [milestoneId]: 'yyyy-mm-dd' }, lastAskedDate, wentToStore }
 * 돌려주는 값: 'in-app' | 'store-card' | null
 */
export function decidePlayReviewPrompt({ milestoneId, nativeSource, nativeVersion, state = {}, today = todayKst() } = {}) {
    const id = String(milestoneId || '');
    if (!PLAY_REVIEW_MILESTONE_IDS.includes(id)) return null;
    if (!String(nativeSource || '').trim()) return null;
    if (state.wentToStore) return null;
    if (state.asked?.[id]) return null;
    if (state.lastAskedDate === today) return null;
    const version = Number.parseInt(nativeVersion, 10);
    return Number.isFinite(version) && version >= IN_APP_REVIEW_MIN_NATIVE_VERSION ? 'in-app' : 'store-card';
}

export function recordPlayReviewAsked(state = {}, milestoneId, today = todayKst()) {
    return { ...state, asked: { ...(state.asked || {}), [milestoneId]: today }, lastAskedDate: today };
}

function readState(uid) {
    try {
        const parsed = JSON.parse(localStorage.getItem(STATE_KEY_PREFIX + uid) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function writeState(uid, state) {
    try { localStorage.setItem(STATE_KEY_PREFIX + uid, JSON.stringify(state)); } catch (_) { }
}

export function buildInAppReviewUrl(milestoneId) {
    const url = new URL('habitschool://review/request');
    url.searchParams.set('source', `milestone-${milestoneId}`);
    return url.toString();
}

function showStoreCard(uid) {
    document.querySelector('.play-review-card')?.remove();
    const card = document.createElement('div');
    card.className = 'play-review-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-labelledby', 'play-review-title');

    const title = document.createElement('div');
    title.className = 'play-review-title';
    title.id = 'play-review-title';
    title.textContent = t('playReview.title');

    const body = document.createElement('p');
    body.className = 'play-review-body';
    body.textContent = t('playReview.body');

    const actions = document.createElement('div');
    actions.className = 'play-review-actions';
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'play-review-later';
    later.textContent = t('playReview.later');
    later.addEventListener('click', () => card.remove());
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'play-review-open';
    open.textContent = t('playReview.open');
    open.addEventListener('click', () => {
        card.remove();
        writeState(uid, { ...readState(uid), wentToStore: true });
        window.location.href = PLAY_STORE_INTENT_URL;
    });
    actions.append(later, open);

    card.append(title, body, actions);
    document.body.appendChild(card);
    open.focus({ preventScroll: true });
}

/** 연속 기록 보상을 받은 직후에 부른다. 대상이 아니면 아무것도 하지 않는다. */
export function maybePromptPlayReview({ uid, milestoneId, nativeSource, nativeVersion }) {
    if (!uid) return null;
    const state = readState(uid);
    const how = decidePlayReviewPrompt({ milestoneId, nativeSource, nativeVersion, state });
    if (!how) return null;
    writeState(uid, recordPlayReviewAsked(state, milestoneId));
    // 보상 알림을 먼저 읽게 한 뒤에 띄운다.
    setTimeout(() => {
        if (how === 'in-app') {
            window.location.href = buildInAppReviewUrl(milestoneId);
        } else {
            showStoreCard(uid);
        }
    }, PROMPT_DELAY_MS);
    return how;
}
