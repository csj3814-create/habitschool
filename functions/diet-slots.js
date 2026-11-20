/**
 * 식단 사진 칸 (2026-11-20 4칸 → 6칸). 앱 쪽 js/diet-slots.js 와 같은 목록이어야 한다
 * (tests/diet-slots.test.js 가 대조한다). 칸 목록은 서버에서도 여기 한 곳에만 적는다.
 */
const DIET_SLOTS = Object.freeze(["breakfast", "lunch", "dinner", "snack", "meal5", "meal6"]);
const DIET_URL_KEYS = Object.freeze(DIET_SLOTS.map((slot) => `${slot}Url`));

module.exports = { DIET_SLOTS, DIET_URL_KEYS };
