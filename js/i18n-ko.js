// 한국어 사전. 키 모양은 '화면.요소'. js/i18n.js 의 t() 가 읽는다.
// 해외 3단계(2026-10-21): 언어마다 파일 하나. 새 언어는 이 파일을 본떠 하나 더 만든다.

export const KO_MESSAGES = {
    'common.save': '저장하기',
    'common.logout': '로그아웃',
    'common.loading': '확인 중...',
    'auth.loginRequired': '로그인이 필요합니다.',
    'auth.startWithGoogle': 'Google로 시작하기',
    'profile.languageKorean': '한국어',
    'profile.languageEnglish': 'English',
    'notification.enable': '알림 켜기',
    'toast.aiFailed': 'AI 분석에 실패했습니다. 다시 시도해 주세요.',
    'toast.analysisFailed': '분석 중 오류가 발생했습니다.',
    'toast.notHealthScreenshot': '건강/만보기 앱 캡처가 아닌 것 같습니다.',
    'analysis.signedOut': '로그인이 풀렸어요. 다시 로그인한 뒤 시도해 주세요.',
    'analysis.tooSlow': '분석이 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.',
    'analysis.busy': '요청이 몰려 있어요. 잠시 후 다시 시도해 주세요.',
    'analysis.offline': '연결이 끊겼어요. 네트워크를 확인한 뒤 다시 시도해 주세요.',
    'kst.badge': 'KST',
    'kst.badgeAria': '날짜 기준 안내 (한국시간)',
    'kst.title': '날짜 기준: 한국시간(KST)',
    'kst.body': '해빛스쿨의 하루는 한국시간(KST) 기준이에요.\n지금 한국은 {now}입니다.\n\n보상 한도는 한국시간 오전 9시에 초기화돼요.\n사진의 촬영 시각도 한국시간으로 환산해 인정하니, 현지 날짜와 달라 보여도 그대로 올리시면 됩니다.',
    // 회원별 시간대(2026-10-16) — 기록 기준이 한국이 아닌 회원과, 기기 시간대로 바꾸기
    'tz.badgeAria': '날짜 기준 안내 (내 시간대)',
    'tz.title': '날짜 기준: {zone}',
    'tz.body': '회원님의 하루는 {zone} 기준이에요.\n지금은 {now}입니다.\n\n보상 한도는 한국시간 오전 9시(UTC 0시)에 초기화돼요.\n사진의 촬영 시각도 이 시간대로 환산해 인정해요.',
    'tz.switchConfirm': '기록 날짜 기준을 이 기기의 시간대 {device}(으)로 바꿀까요?\n바꾸면 30일 동안 다시 바꿀 수 없어요.',
    'tz.switched': '이제 {zone} 기준으로 하루를 셉니다.',
    'tz.cooldown': '시간대는 30일에 한 번 바꿀 수 있어요. {date}부터 다시 바꿀 수 있어요.',
    'tz.failed': '시간대를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.',
    // 첫 가입 동의 화면에서 나가는 버튼 — "로그아웃"과 다른 뉘앙스
    'reconsent.signup.later': '그만두기'
};
