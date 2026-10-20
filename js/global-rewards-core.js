// 해빛 배지 카드의 순수 계산. Firebase 를 부르지 않아 테스트에서 바로 불러 쓴다.
// 서버 판정은 functions/global-rewards.js 의 isOverseasMember 가 기준이고, 여기는 같은 규칙으로
// 국내/해외 접속을 가른다 — 기본 접힘(국내: 배지, 해외: 해빛 마켓)과 투표 표시에 쓴다.
import { DEFAULT_TIME_ZONE, isSupportedTimeZone, normalizeTimeZone } from './member-time.js?v=527';

// functions/global-rewards.js 의 GLOBAL_GIFT_CARD_VOTE_COUNTRIES 와 같아야 한다.
export const GLOBAL_GIFT_CARD_VOTE_COUNTRIES = Object.freeze(['US', 'CA', 'GB', 'AU', 'JP', 'OTHER']);

const COUNTRY_LABELS = Object.freeze({
    US: { ko: '미국', en: 'United States' },
    CA: { ko: '캐나다', en: 'Canada' },
    GB: { ko: '영국', en: 'United Kingdom' },
    AU: { ko: '호주', en: 'Australia' },
    JP: { ko: '일본', en: 'Japan' },
    OTHER: { ko: '그 밖의 나라', en: 'Somewhere else' },
});

export function isOverseasTimeZone(timeZone) {
    if (!isSupportedTimeZone(timeZone)) return false;
    return normalizeTimeZone(timeZone) !== DEFAULT_TIME_ZONE;
}

// 갤러리 글·댓글 이름 앞의 배지. 배지 칸(userBadge)은 서버만 쓰지만, 화면에서도 글자·숫자가 섞인
// 값이나 긴 값은 배지로 보지 않는다. 돌려주는 값은 HTML 이 아닌 글자 — 부르는 쪽이 escape 한다.
export function formatBadgedName(name, badge) {
    const label = String(name ?? '');
    const emoji = String(badge ?? '').trim();
    if (!emoji || emoji.length > 8 || /[\p{L}\p{N}]/u.test(emoji)) return label;
    return `${emoji} ${label}`;
}

// 배지 활동 기준 한 줄. metric 은 functions/global-rewards.js 의 requirement.metric 과 같다.
export function describeBadgeRequirement(requirement = {}, isEnglish = false) {
    const target = Math.max(0, Number(requirement.target) || 0);
    const current = Math.max(0, Number(requirement.current) || 0);
    switch (requirement.metric) {
    case 'bestStreak':
        return isEnglish ? `${target}-day streak (best ${current})` : `${target}일 연속 기록 (최고 ${current}일)`;
    case 'dietDays':
        return isEnglish ? `${target} days of meals (now ${current})` : `식단 기록 ${target}일 (지금 ${current}일)`;
    case 'exerciseDays':
        return isEnglish ? `${target} days of exercise (now ${current})` : `운동 기록 ${target}일 (지금 ${current}일)`;
    case 'mindDays':
        return isEnglish ? `${target} days of sleep & mind (now ${current})` : `마음 기록 ${target}일 (지금 ${current}일)`;
    default:
        return isEnglish ? `${target} days logged (now ${current})` : `기록한 날 ${target}일 (지금 ${current}일)`;
    }
}

export function normalizeVoteCountry(value) {
    const code = String(value || '').trim().toUpperCase();
    return GLOBAL_GIFT_CARD_VOTE_COUNTRIES.includes(code) ? code : 'OTHER';
}

export function getVoteCountryLabel(code, isEnglish) {
    const label = COUNTRY_LABELS[normalizeVoteCountry(code)];
    return isEnglish ? label.en : label.ko;
}

// 회원에게는 몇 명이 원하는지만 보여 준다. 개발을 검토하는 기준(30명)은 관제탑에만 보인다
// (2026-10-17 대표 요청으로 기준 인원 안내 문구를 뺐다).
export function describeVoteProgress({ total = 0 } = {}, isEnglish = false) {
    const count = Math.max(0, Number(total) || 0);
    return isEnglish ? `${count} members want this` : `${count}명이 원해요`;
}
