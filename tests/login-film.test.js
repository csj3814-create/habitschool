import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { readRepoFile } from './source-helpers.js';

// 2026-09-27: 로그인 화면에 30초 이야기 「아침 식탁」. 처음 온 사람의 데이터를 아끼려고
// 누를 때만 받고, 서비스 워커는 영상 조각 요청을 건드리지 않는다.

const INDEX = readRepoFile('index.html');
const AUTH = readRepoFile('js/auth.js');
const SW = readRepoFile('sw.js');
const root = resolve(process.cwd());

describe('login film', () => {
    it('downloads nothing until someone taps it', () => {
        expect(INDEX).toMatch(/<video[^>]*id="login-film-video"[^>]*preload="none"/);
        expect(INDEX).not.toMatch(/<video[^>]*autoplay/);
    });

    it('starts muted and turns its music on with the sound button', () => {
        expect(INDEX).toMatch(/<video[^>]*id="login-film-video"[^>]*muted/);
        expect(INDEX).toMatch(/id="login-film-sound"[^>]*onclick="toggleLoginFilmSound\(\)"/);
        const fn = AUTH.slice(AUTH.indexOf('window.toggleLoginFilmSound'), AUTH.indexOf('window.playLoginFilm'));
        expect(fn).toContain('video.muted = !video.muted');
    });

    it('ships light files for both languages', () => {
        for (const name of ['breakfast_table_music_ko.mp4', 'breakfast_table_music_en.mp4', 'breakfast_poster.jpg',
            'dad_bike_ko.mp4', 'dad_bike_en.mp4', 'dad_bike_poster.jpg']) {
            const path = resolve(root, 'assets/film', name);
            expect(existsSync(path), name).toBe(true);
            expect(statSync(path).size, name).toBeLessThan(3 * 1024 * 1024);
        }
    });

    it('plays the version that matches the screen language', () => {
        expect(AUTH).toContain("`assets/film/breakfast_table_music_${isEnglishLocale() ? 'en' : 'ko'}.mp4`");
    });

    it('points people at the start button when it ends', () => {
        const fn = AUTH.slice(AUTH.indexOf('window.playLoginFilm'), AUTH.indexOf('function openInExternalBrowser'));
        expect(fn).toContain("addEventListener('ended'");
        expect(fn).toContain("getElementById('loginBtn')");
        expect(fn).toContain('login-cta-pulse');
    });

    // 2026-10-01: 두 번째 이야기 「아빠의 자전거」를 나란히. 무대(<video>) 하나를 같이 쓴다.
    it('shows both stories side by side and plays the one that was tapped', () => {
        expect(INDEX).toMatch(/id="login-film-shelf"/);
        expect(INDEX).toContain(`onclick="playLoginFilm('breakfast')"`);
        expect(INDEX).toContain(`onclick="playLoginFilm('dad_bike')"`);
        expect(INDEX.match(/<video[^>]*class="login-film-video"/g)).toHaveLength(1);
        expect(AUTH).toContain("src: () => `assets/film/dad_bike_${isEnglishLocale() ? 'en' : 'ko'}.mp4`");
        const fn = AUTH.slice(AUTH.indexOf('window.playLoginFilm'), AUTH.indexOf('function openInExternalBrowser'));
        expect(fn).toContain('video.dataset.film !== film');
        expect(fn).toContain("trackProductEvent('login_film_play', { locale: isEnglishLocale() ? 'en' : 'ko', film })");
    });

    // 2026-10-02: 영어판(영어 내레이션·자막)이 생겨 영어 화면에서도 두 편을 보여 준다.
    it('shows the English cut of the second story on the English screen', () => {
        expect(INDEX).not.toContain('data-film-locale="ko"');
        expect(INDEX).toMatch(/data-film="dad_bike"[^>]*data-i18n-aria-label="login.film2Aria"/);
        expect(INDEX).toContain('data-i18n="login.film2Label"');
        const I18N = readRepoFile('js/i18n.js');
        expect(I18N).toContain(`'login.film2Label': "A 47-second story · Dad's Bike"`);
    });

    it('lets people close a story and pick the other one', () => {
        expect(INDEX).toMatch(/id="login-film-close"[^>]*onclick="closeLoginFilm\(\)"/);
        const fn = AUTH.slice(AUTH.indexOf('window.closeLoginFilm'), AUTH.indexOf('window.playLoginFilm'));
        expect(fn).toContain('video.pause()');
        expect(fn).toContain('showLoginFilmShelf()');
    });

    it('keeps the service worker away from video range requests', () => {
        expect(SW).toContain("request.headers.has('range') || requestUrl.pathname.startsWith('/assets/film/')");
    });
});
