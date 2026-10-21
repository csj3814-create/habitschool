// 영어 앱 프로필 = 한국어 앱 프로필을 번역한 것 (해외 3단계 E2 2부, 2026-10-21).
// 한국어 화면은 tests/korean-app-unchanged-i18n.test.js 가 지킨다. 여기는 영어 쪽에 한글이 남지 않는지 본다.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { calculateLE8Score, renderLE8ScoreCard } from '../js/le8-score.js';

const HANGUL = /[가-힣]/;
const EN_INDEX = readRepoFile('en/index.html');
const EN_CSS = readRepoFile('styles-en.css').replace(/\/\*[\s\S]*?\*\//g, '');

function visibleText(html) {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

function onPath(pathname) {
    globalThis.window = { location: { pathname, origin: 'https://habitschool.web.app' } };
}

describe('영어 HTML 의 프로필 정적 글자', () => {
    it('프로필 구역의 보이는 글자에 한글이 없다 (한국 전용 카드와 코드가 채우는 칸은 뺀다)', () => {
        const start = EN_INDEX.indexOf('<div id="profile" class="content-section"');
        const end = EN_INDEX.indexOf('<div id="assets"', start);
        let profile = EN_INDEX.slice(start, end).replace(/<!--[\s\S]*?-->/g, '');
        // 한국어 심플 모드 전용 묶음(영어에서는 보이지 않는다)
        profile = profile.slice(0, profile.indexOf('<div class="simple-profile-shell"'))
            + profile.slice(profile.indexOf('<div class="english-profile-shell"'));
        // 영어에서 숨는 한국 전용 카드
        for (const cls of ['chatbot-link-card', 'profile-update-card', 'version-switch-card']) {
            const i = profile.indexOf(`class="card ${cls}`);
            expect(i, cls).toBeGreaterThan(-1);
            const next = profile.indexOf('<div class="card', i + 10);
            profile = profile.slice(0, profile.lastIndexOf('<', i)) + profile.slice(next > -1 ? next : profile.length);
        }
        const leftovers = visibleText(profile).split(/(?<=[.!?])\s|\s{2,}/).filter((s) => HANGUL.test(s));
        // 남는 것은 코드가 덮어쓰는 자리(id 가 있는 칸)의 자리 글자와 데이터 값뿐이어야 한다.
        const allowed = [
            /한국어/, // 언어 카드의 한국어 단추
            /카카오톡/, // 영어에서 숨는 카카오톡 초대 단추
        ];
        const unexpected = leftovers.filter((s) => !allowed.some((re) => re.test(s)));
        expect(unexpected).toEqual([]);
    });

    it('한국 전용 카드는 영어에서 숨는다', () => {
        for (const selector of ['.chatbot-link-card', '.profile-update-card', '.version-switch-card', `button[onclick="shareReferralLink('kakao')"]`]) {
            expect(EN_CSS, selector).toContain(`html.locale-en ${selector}`);
        }
    });
});

describe('건강습관 점수 카드 (js/le8-score.js)', () => {
    afterEach(() => { delete globalThis.window; });

    const profile = { heightCm: 172, weight: 70, smokingStatus: 'never', totalCholesterol: 190, hdl: 50, meds: ['고혈압약'] };
    const logs = [1, 2, 3].map((d) => ({
        date: `2026-10-0${d}`,
        metrics: { weight: 70, glucose: 104, bpSystolic: 128, bpDiastolic: 82 },
        dietAnalysis: { breakfast: { grade: 'B' }, lunch: { grade: 'C' } },
        sleepAndMind: { sleepHours: 6.5 },
        exercise: { steps: 6000 },
    }));

    function render(path, data) {
        onPath(path);
        const container = { innerHTML: '', style: {} };
        renderLE8ScoreCard(container, data ?? calculateLE8Score(profile, logs, {}, null));
        return container.innerHTML;
    }

    it('영어 화면에는 한글이 없다 (점수가 나올 때와 모자랄 때 모두)', () => {
        const full = render('/en');
        const empty = render('/en', (onPath('/en'), calculateLE8Score({}, [], {}, null)));
        for (const html of [full, empty]) {
            expect(visibleText(html)).not.toMatch(HANGUL);
            expect(html).not.toMatch(/le8\.[a-z]/); // 키 이름이 새지 않는다
        }
        expect(full).toContain('My health habit score');
        expect(empty).toContain('Log 2 more habits, 2 more metabolic markers to get your score');
    });

    it('한국어 화면은 예전 문구 그대로다', () => {
        const html = render('/');
        expect(html).toContain('🌿 나의 건강습관 점수');
        expect(html).toContain('고혈압약 복용 중');
        const empty = render('/', (onPath('/'), calculateLE8Score({}, [], {}, null)));
        expect(empty).toContain('📌 생활습관 2개, 대사지표 2개를 더 기록하면 점수를 계산할 수 있어요');
    });
});
