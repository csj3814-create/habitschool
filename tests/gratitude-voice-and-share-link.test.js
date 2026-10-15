import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

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
    const i18n = readRepoFile('js/i18n.js');

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
        expect(fn).toContain('focusElementWithHighlight(target);');
        // 스위치가 화면에 없으면 공유 흐름이 이유를 말한다
        expect(fn).toContain('triggerGalleryShareAction(true);');
    });
});
