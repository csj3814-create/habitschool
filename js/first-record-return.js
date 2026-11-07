// 첫 기록 뒤 다음 끼니에 돌아올 길 하나를 기기에 맞춰 고른다(가입 안내의 "다음 끼니" 칸은 2026-11-07 에 지웠다).
//
// 2026-11-02: 최근 60일 가입자 중 웹만 쓴 사람의 첫 기록은 8%, 플레이 앱은 63% 였다. 웹에는 돌아올 길이
// 없었다 — 홈 화면 아이콘도 없고, 알림 허락은 3%, 첫 기록 안내 메일은 43명 중 1명을 데려왔다.
// 같은 날 대표: "바탕화면 앱 설치하기를 더 우선 권유해야겠지", "PWA를 사용중인 유저를 구글 플레이스토어 앱을
// 깔으라고 권유하는 건 아닌 듯. HBT 빠진 마이너 버전으로 가라는 것과 같을테니." 그래서 웹에서는 웹 앱 설치만
// 권한다. 같은 브라우저·같은 로그인이라 스토어를 거치지 않는다(플레이 앱 권유를 누른 9명 중 앱을 연 사람은 0명).
// 설계: tasks/2026-11-02_가입_안내_끝_첫기록_설계.md

/**
 * @returns {'notify'|'install'|null}
 *   notify  — 플레이 앱 안: 알림을 허락받아 식사 시간에 부른다
 *   install — 웹: 웹 앱을 바탕화면·홈 화면에 설치하게 한다(어느 기기든)
 *   null    — 이미 설치한 웹 앱으로 열었다
 */
export function resolveReturnPath({ inPlayApp = false, standalone = false } = {}) {
    if (inPlayApp) return 'notify';
    if (standalone) return null;
    return 'install';
}

// 다음 끼니 시각. 습관 알림(settings.reminderPreference.hourKst, 회원 시각)은 하루 한 번 이 시각에,
// 그날 기록이 없을 때만 간다.
export function nextMealReminderHour(hour) {
    const h = Number(hour);
    if (h < 11) return 12;
    if (h < 17) return 18;
    return 12;
}
