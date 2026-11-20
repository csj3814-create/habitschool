/**
 * 식단 사진 칸 (2026-11-20 4칸 → 6칸).
 *
 * 회원 의견 "식단 최대 4개로는 모자라다". 칸 이름은 시간(아침·점심)이 아니라
 * 순서다 — 화면도 「① 첫 번째 식사」…「⑥ 여섯 번째 식사」. 앞의 넷은 예전 기록과
 * 이름이 같아야 해서 그대로 두고, 새 두 칸만 meal5·meal6.
 *
 * 칸 목록은 **여기 한 곳**에만 적는다. 예전에는 같은 넷이 35곳에 따로 적혀 있어
 * 한 곳만 빠뜨려도 그 칸 사진이 조용히 저장·표시·삭제에서 빠졌다.
 * 서버는 functions/diet-slots.js — 두 목록이 같은지는 tests/diet-slots.test.js 가 본다.
 */
export const DIET_SLOTS = Object.freeze(['breakfast', 'lunch', 'dinner', 'snack', 'meal5', 'meal6']);

/** diet 문서의 사진 칸 이름 (breakfastUrl …) */
export const DIET_URL_KEYS = Object.freeze(DIET_SLOTS.map((slot) => `${slot}Url`));
