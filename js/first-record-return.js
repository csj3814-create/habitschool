// 첫 기록 뒤(또는 가입 안내에서 "아직 안 먹었어요" 뒤) 다음 끼니·내일 돌아올 길 하나를 기기에 맞춰 고른다.
//
// 2026-11-02: 최근 60일 가입자 중 웹만 쓴 사람의 첫 기록은 8%, 플레이 앱은 63% 였다. 웹에는 돌아올 길이
// 없었다 — 홈 화면 아이콘도 없고, 알림 허락은 3%, 첫 기록 안내 메일은 43명 중 1명을 데려왔다.
// 설계: tasks/2026-11-02_가입_안내_끝_첫기록_설계.md

/**
 * @returns {'notify'|'play-app'|'home-screen'|'phone'|null}
 *   notify      — 플레이 앱 안: 알림을 허락받아 식사 시간에 부른다
 *   play-app    — 안드로이드 웹: 플레이 앱으로 이어서 하게 한다
 *   home-screen — 아이폰 웹: 홈 화면에 추가하게 한다
 *   phone       — 컴퓨터: 휴대폰에서 이어서 하라고 알린다
 */
export function resolveReturnPath({ inPlayApp = false, platform = '', standalone = false, playStoreListed = false } = {}) {
    if (inPlayApp) return 'notify';
    if (platform === 'android') return playStoreListed ? 'play-app' : null;
    if (platform === 'ios') return standalone ? null : 'home-screen';
    if (platform === 'desktop') return 'phone';
    return null;
}

// 다음 끼니 시각. 습관 알림(settings.reminderPreference.hourKst, 회원 시각)은 하루 한 번 이 시각에,
// 그날 기록이 없을 때만 간다.
export function nextMealReminderHour(hour) {
    const h = Number(hour);
    if (h < 11) return 12;
    if (h < 17) return 18;
    return 12;
}
