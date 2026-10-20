import { describe, expect, it } from 'vitest';
import { readRepoFile, readI18nSource } from './source-helpers.js';

// 2026-10-15 제보: "감사 일기 음성 입력 버튼 누르면 마이크 권한을 허용하면 음성 입력을
// 쓸 수 있어요. 라고 나오는데 휴대폰에서도 안되거든?"
//
// 서버가 모든 페이지에 Permissions-Policy: microphone=() 를 보내고 있었다. 빈 목록은
// 우리 사이트 자신까지 막는다. 회원이 마이크를 허용해도 브라우저가 열지 않아 음성
// 인식이 not-allowed 로 끝났다. 안드로이드 앱(TWA)도 크롬이라 같은 헤더를 받는다.
describe('감사 일기 음성 입력', () => {
    const config = JSON.parse(readRepoFile('firebase.json'));
    const headers = []
        .concat(config.hosting)
        .flatMap((site) => site.headers || [])
        .flatMap((rule) => rule.headers || []);
    const policies = headers.filter((h) => h.key === 'Permissions-Policy').map((h) => h.value);

    it('마이크를 우리 사이트에는 허용한다', () => {
        expect(policies.length).toBeGreaterThan(0);
        policies.forEach((value) => {
            expect(value).toContain('microphone=(self)');
            expect(value).not.toMatch(/microphone=\(\)/);
        });
    });

    it('카메라는 그대로, 위치는 여전히 막는다', () => {
        policies.forEach((value) => {
            expect(value).toContain('camera=(self)');
            expect(value).toContain('geolocation=()');
        });
    });
});

// 같은 날 요청: "공유 설정에서 마음, AI 분석을 끄면 숨길 수 있어요 … 마음, AI 분석이
// 어디에 있지? 누르면 거기로 바로 가기 해 줘."
describe("감사 일기 안내의 '마음·AI 분석' 바로 가기", () => {
    const html = readRepoFile('index.html');
    const app = readRepoFile('js/app-core.js');
    const i18n = readI18nSource();

    it('안내 문구 안의 마음·AI 분석이 누를 수 있는 버튼이다', () => {
        const note = html.slice(html.indexOf('id="gratitude-public-note"'));
        const line = note.slice(0, note.indexOf('</p>'));
        expect(line).toContain('onclick="openMindShareSetting()"');
        expect(line).toContain('>마음·AI 분석</button>');
        // 영어 화면에서 글자만 갈아끼우면 버튼이 사라진다 — html 로 넣는다
        expect(line).toContain('data-i18n-html="mind.gratitudePublicNote"');
        expect(i18n).toContain('onclick="openMindShareSetting()">Mind · AI analysis</button>');
    });

    it('갤러리 탭으로 옮겨 공유 설정을 펼치고 그 스위치를 짚는다', () => {
        const fn = app.slice(app.indexOf('function openMindShareSetting() {'), app.indexOf('window.openMindShareSetting = openMindShareSetting;'));
        expect(fn).toContain("openTab('gallery');");
        expect(fn).toContain('setShareSettingsExpanded(true);');
        expect(fn).toContain("document.getElementById('share-hide-mind')?.closest('.share-privacy-toggle')");
        // 공유 설정은 접혀 있는 HABIT FEED 안내 안에 있다 — 먼저 펼친다(회원 설정은 저장하지 않음)
        expect(fn).toContain('setGalleryHeroCollapsed(false, false);');
        expect(fn).toContain("target.classList.add('is-highlighted');");
        // 스위치가 화면에 없으면 공유 흐름이 이유를 말한다
        expect(fn).toContain('triggerGalleryShareAction(true);');
    });
});

// 2026-10-15 제보: "안녕하세요 만 녹음 했는데 텍스트 박스에 안녕하세요가 7번 기록되네?"
// 안드로이드 크롬은 끝난 문장을 매 결과에 다시 보낸다(resultIndex 0). 이어 붙이던 코드가
// 그때마다 같은 말을 또 붙였다.
describe('음성 결과를 다시 엮는다', () => {
    const app = readRepoFile('js/app-core.js');
    const pick = (header) => {
        const start = app.indexOf(header);
        let depth = 0;
        for (let i = app.indexOf('{', start); i < app.length; i += 1) {
            if (app[i] === '{') depth += 1;
            else if (app[i] === '}') { depth -= 1; if (depth === 0) return app.slice(start, i + 1); }
        }
        return '';
    };
    // eslint-disable-next-line no-new-func
    const collect = new Function('sanitizeText', `
        ${pick('function normalizeGratitudeVoiceSegment(')}
        ${pick('function collectGratitudeSpeechTranscript(')}
        return collectGratitudeSpeechTranscript;
    `)((value) => String(value || ''));
    const r = (transcript, isFinal) => Object.assign([{ transcript }], { isFinal });

    it('안드로이드처럼 같은 확정 문장이 여러 번 와도 한 번만', () => {
        const results = Array.from({ length: 7 }, () => r('안녕하세요', true));
        expect(collect(results)).toEqual({ finalText: '안녕하세요', interimText: '' });
    });

    it('앞 문장을 이어 늘린 확정 문장은 늘린 쪽 하나로', () => {
        const results = [r('오늘', true), r('오늘 감사한 일은', true), r('오늘 감사한 일은 가족', true)];
        expect(collect(results).finalText).toBe('오늘 감사한 일은 가족');
    });

    it('서로 다른 문장은 차례대로 이어 적는다 (컴퓨터 크롬)', () => {
        const results = [r('가족과 저녁을 먹었다', true), r('날씨가 좋았다', true), r('산책', false)];
        expect(collect(results)).toEqual({ finalText: '가족과 저녁을 먹었다 날씨가 좋았다', interimText: '산책' });
    });

    it('진행 중인 말이 확정된 말을 다시 담고 있으면 겹치지 않게', () => {
        const results = [r('안녕하세요', true), r('안녕하세요 반가워요', false)];
        expect(collect(results)).toEqual({ finalText: '안녕하세요', interimText: '반가워요' });
    });

    it('결과를 이어 붙이지 않고 매번 전체에서 다시 만든다', () => {
        const onresult = app.slice(app.indexOf('recognition.onresult = (event) => {'), app.indexOf('recognition.onerror'));
        expect(onresult).toContain('collectGratitudeSpeechTranscript(event.results)');
        expect(onresult).toContain('_gratitudeSpeechFinalText = finalText;');
        expect(onresult).not.toContain('event.resultIndex');
    });
});
