/**
 * 프로필 묶음 — 건강 정보 / 친구·초대 / 설정·안내.
 *
 * 프로필에 카드가 열 장 넘게 한 줄로 쌓여 무엇이 어디 있는지 찾기 어려웠다(2026-11-12 제보).
 * 묶음은 index.html 의 <details class="profile-group"> 이고, 여기서는
 *   - 열고 닫은 상태를 기기에 기억하고
 *   - 위쪽 바로가기 줄에서 묶음으로 건너뛴다.
 *
 * 처음에는 건강 정보와 친구·초대를 펴 두고 설정만 접는다. 초대는 접어 두면 아무도 안 본다.
 */

export const PROFILE_GROUPS_KEY = 'hs_profile_groups_v1';

export function readProfileGroupState(storage) {
    try {
        const parsed = JSON.parse(storage?.getItem(PROFILE_GROUPS_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
}

/** 기억해 둔 값이 있으면 그 값, 없으면 화면에 적힌 기본값. */
export function resolveGroupOpen(state, key, defaultOpen) {
    return typeof state?.[key] === 'boolean' ? state[key] : defaultOpen;
}

function saveGroupState(key, open) {
    try {
        const state = readProfileGroupState(window.localStorage);
        state[key] = open;
        window.localStorage.setItem(PROFILE_GROUPS_KEY, JSON.stringify(state));
    } catch (_) {
        // 저장소가 막혀 있으면 이번에만 그렇게 보인다.
    }
}

export function initProfileGroups(doc = document) {
    const state = readProfileGroupState(window.localStorage);
    doc.querySelectorAll('details.profile-group[data-profile-group]').forEach((group) => {
        const key = group.dataset.profileGroup;
        group.open = resolveGroupOpen(state, key, group.hasAttribute('open'));
        group.addEventListener('toggle', () => saveGroupState(key, group.open));
    });
}

export function jumpToProfileGroup(key) {
    const group = document.getElementById(`profile-group-${key}`);
    if (!group) return;
    group.open = true;
    group.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.jumpToProfileGroup = jumpToProfileGroup;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initProfileGroups());
    } else {
        initProfileGroups();
    }
}
