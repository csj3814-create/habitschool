import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import {
    PROFILE_HINT_KEY,
    PROFILE_HINT_MAX_SHOWS,
    readProfileHintState,
    shouldShowProfileHint
} from '../js/profile-entry-hint.js';

// 2026-11-12 제보: "사람들이 프로필 탭이 있는 줄도 잘 모를 수 있어."
// 프로필은 탭 줄에 없고 왼쪽 위 이름에만 있다. 이름을 버튼처럼 보이게 하고,
// 처음 몇 번은 말풍선으로 알린다.

const AUTH = readRepoFile('js/auth.js');
const APP = readRepoFile('js/app-core.js');
const MAIN = readRepoFile('js/main.js');
const CSS = readRepoFile('styles-base.css');
const SW = readRepoFile('sw.js');
const HINT = readRepoFile('js/profile-entry-hint.js');

const storageWith = (value) => ({ getItem: (key) => (key === PROFILE_HINT_KEY ? value : null) });

describe('profile entry: the name is a button', () => {
    it('shows the hint until the profile is opened, at most three times', () => {
        expect(PROFILE_HINT_MAX_SHOWS).toBe(3);
        expect(shouldShowProfileHint(readProfileHintState(storageWith(null)))).toBe(true);
        expect(shouldShowProfileHint(readProfileHintState(storageWith('{"shows":2}')))).toBe(true);
        expect(shouldShowProfileHint(readProfileHintState(storageWith('{"shows":3}')))).toBe(false);
        expect(shouldShowProfileHint(readProfileHintState(storageWith('{"done":true,"shows":1}')))).toBe(false);
    });

    it('survives a broken or blocked storage', () => {
        expect(readProfileHintState(storageWith('not json'))).toEqual({ done: false, shows: 0 });
        expect(readProfileHintState(null)).toEqual({ done: false, shows: 0 });
        expect(readProfileHintState({ getItem() { throw new Error('blocked'); } })).toEqual({ done: false, shows: 0 });
    });

    it('marks the name as the profile button only while signed in', () => {
        expect(AUTH.match(/greetingEl\.classList\.add\('profile-entry'\)/g)).toHaveLength(2);
        expect(AUTH).toContain("document.getElementById('user-greeting').classList.remove('profile-entry');");
        expect(AUTH).toContain('window.scheduleProfileEntryHint?.();');
    });

    it('marks the name with an arrow that an ellipsis cannot cut off, and no pill', () => {
        // 2026-11-13 대표: "회색 알약은 빼자. 디자인 별로인 듯."
        const rule = CSS.match(/#user-greeting\.profile-entry \{[\s\S]*?\n\}/)?.[0] || '';
        expect(rule).toMatch(/background:\s*url\("data:image\/svg\+xml/);
        expect(rule).not.toContain('border-radius');
        expect(rule).not.toContain('border:');
    });

    it('stops reminding once the profile has been opened', () => {
        expect(APP).toContain("if (resolvedTabName === 'profile') window.noteProfileOpened?.();");
        expect(HINT).toMatch(/noteProfileOpened[\s\S]*done: true/);
    });

    it('does not float over a window that covers the name', () => {
        expect(HINT).toContain('document.elementFromPoint(');
        expect(HINT).toContain('if (!top || !anchor.contains(top)) return false;');
    });

    it('is loaded at start and kept for offline use', () => {
        expect(MAIN).toMatch(/import '\.\/profile-entry-hint\.js\?v=\d+';/);
        expect(SW).toMatch(/'\.\/js\/profile-entry-hint\.js\?v=\d+',/);
    });
});
