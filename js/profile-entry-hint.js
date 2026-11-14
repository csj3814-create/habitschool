/**
 * "이름을 누르면 프로필" 을 알려 주는 말풍선.
 *
 * 프로필은 탭 줄에 없고 왼쪽 위 이름에만 있다. 이름이 제목 글자처럼 보여서 누르는 것인 줄
 * 모르는 회원이 많다(2026-11-12 제보). 이름은 버튼처럼 보이게 하고(styles-base.css 의
 * .profile-entry), 여기서는 앱을 열 때 말풍선을 몇 번만 띄운다.
 *
 * - 프로필을 한 번이라도 열면 다시 띄우지 않는다.
 * - 열지 않아도 세 번까지만 띄운다. 계속 뜨는 안내는 잔소리다.
 * - 다른 창이 이름을 가리고 있으면 띄우지 않고, 횟수도 세지 않는다.
 */
import { isEnglishLocale } from './i18n.js?v=605';

export const PROFILE_HINT_KEY = 'hs_profile_entry_hint_v1';
export const PROFILE_HINT_MAX_SHOWS = 3;
const SHOW_DELAY_MS = 2500;
const VISIBLE_MS = 8000;

export function readProfileHintState(storage) {
    try {
        const parsed = JSON.parse(storage?.getItem(PROFILE_HINT_KEY) || '{}') || {};
        return { done: parsed.done === true, shows: Number(parsed.shows) || 0 };
    } catch (_) {
        return { done: false, shows: 0 };
    }
}

function writeProfileHintState(storage, state) {
    try {
        storage?.setItem(PROFILE_HINT_KEY, JSON.stringify(state));
    } catch (_) {
        // 저장소가 막혀 있으면 이번에만 보여 주고 만다.
    }
}

export function shouldShowProfileHint(state) {
    return !state.done && state.shows < PROFILE_HINT_MAX_SHOWS;
}

let hintTimer = null;
let shownThisSession = false;

function removeHint() {
    document.getElementById('profile-entry-hint')?.remove();
}

function showHintNow() {
    const anchor = document.querySelector('#user-greeting.profile-entry');
    if (!anchor || document.getElementById('profile-entry-hint')) return false;

    const state = readProfileHintState(window.localStorage);
    if (!shouldShowProfileHint(state)) return false;

    // 로그인 창이나 안내 창이 이름을 가리고 있으면 말풍선이 그 위에 엉뚱하게 뜬다.
    const rect = anchor.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (!top || !anchor.contains(top)) return false;

    const bubble = document.createElement('button');
    bubble.type = 'button';
    bubble.id = 'profile-entry-hint';
    bubble.className = 'profile-entry-hint';
    bubble.textContent = isEnglishLocale()
        ? 'Tap your name to open your profile'
        : '이름을 누르면 내 프로필이 열려요';
    bubble.style.top = `${Math.round(rect.bottom + 8)}px`;
    bubble.style.left = `${Math.max(8, Math.round(rect.left))}px`;
    bubble.addEventListener('click', () => {
        removeHint();
        window.openTab?.('profile');
    });
    document.body.append(bubble);

    shownThisSession = true;
    writeProfileHintState(window.localStorage, { done: false, shows: state.shows + 1 });
    setTimeout(removeHint, VISIBLE_MS);
    return true;
}

/** 로그인해서 이름이 그려진 뒤에 부른다. 앱을 한 번 여는 동안 한 번만 뜬다. */
export function scheduleProfileEntryHint() {
    if (shownThisSession || hintTimer) return;
    hintTimer = setTimeout(() => {
        hintTimer = null;
        showHintNow();
    }, SHOW_DELAY_MS);
}

/** 프로필을 열었다. 이제 알고 있으니 다시 알리지 않는다. */
export function noteProfileOpened() {
    removeHint();
    const state = readProfileHintState(window.localStorage);
    if (!state.done) writeProfileHintState(window.localStorage, { done: true, shows: state.shows });
}

if (typeof window !== 'undefined') {
    window.scheduleProfileEntryHint = scheduleProfileEntryHint;
    window.noteProfileOpened = noteProfileOpened;
}
