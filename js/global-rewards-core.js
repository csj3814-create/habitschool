// 해빛 배지 카드의 순수 계산. Firebase 를 부르지 않아 테스트에서 바로 불러 쓴다.
// 서버 판정은 functions/global-rewards.js 의 isOverseasMember 가 기준이고, 여기는 같은 규칙으로
// 국내/해외 접속을 가른다 — 기본 접힘(국내: 배지, 해외: 해빛 마켓)과 투표 표시에 쓴다.
import { DEFAULT_TIME_ZONE, isSupportedTimeZone, normalizeTimeZone } from './member-time.js?v=518';

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

export function normalizeVoteCountry(value) {
    const code = String(value || '').trim().toUpperCase();
    return GLOBAL_GIFT_CARD_VOTE_COUNTRIES.includes(code) ? code : 'OTHER';
}

export function getVoteCountryLabel(code, isEnglish) {
    const label = COUNTRY_LABELS[normalizeVoteCountry(code)];
    return isEnglish ? label.en : label.ko;
}

export function describeVoteProgress({ total = 0, threshold = 0 } = {}, isEnglish = false) {
    const count = Math.max(0, Number(total) || 0);
    const goal = Math.max(0, Number(threshold) || 0);
    if (count >= goal) {
        return isEnglish
            ? `${count} members want this · we are reviewing it now`
            : `${count}명이 원해요 · 준비를 검토하고 있어요`;
    }
    return isEnglish
        ? `${count} members want this · we start building at ${goal}`
        : `${count}명이 원해요 · ${goal}명이 모이면 준비를 시작해요`;
}
