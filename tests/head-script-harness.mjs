// index.html 머리(head)의 인라인 스크립트를 가짜 브라우저(위치·기기 언어·저장소)에서 돌린다.
// 첫 화면 전에 정하는 것(플레이 잠금, 언어 이동)을 실제 코드 그대로 시험한다.

import vm from 'node:vm';
import { readRepoFile } from './source-helpers.js';

export const TWA_REFERRER = 'android-app://com.habitschool.app/';

export function headInlineScripts(file = 'index.html') {
    const html = readRepoFile(file);
    const head = html.slice(0, html.indexOf('</head>'));
    return [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
}

function fakeStorage(initial = {}, throws = false) {
    const data = new Map(Object.entries(initial));
    if (throws) {
        const fail = () => { throw new Error('SecurityError: storage is blocked'); };
        return { getItem: fail, setItem: fail, removeItem: fail, dump: () => ({}) };
    }
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => { data.set(key, String(value)); },
        removeItem: (key) => { data.delete(key); },
        key: (index) => [...data.keys()][index] ?? null,
        get length() { return data.size; },
        dump: () => Object.fromEntries(data),
    };
}

export function runHead({ file = 'index.html', path = '/', search = '', hash = '', referrer = '', languages = ['ko-KR'], language, session = {}, local = {}, storageThrows = false } = {}) {
    const classes = new Set();
    const replaced = [];
    const sessionStorage = fakeStorage(session, storageThrows);
    const localStorage = fakeStorage(local, storageThrows);
    const documentElement = {
        lang: 'ko',
        classList: {
            add: (...names) => names.forEach((name) => classes.add(name)),
            remove: (...names) => names.forEach((name) => classes.delete(name)),
            contains: (name) => classes.has(name),
            toggle: (name, force) => { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); },
        },
    };
    const location = {
        hostname: 'habitschool.web.app',
        pathname: path,
        search,
        hash,
        replace: (url) => replaced.push(url),
        assign: (url) => replaced.push(url),
    };
    const sandbox = {
        location,
        document: { documentElement, referrer },
        navigator: { language: language ?? languages[0], languages },
        sessionStorage,
        localStorage,
        URLSearchParams,
        console: { warn() {}, log() {} },
        setTimeout: () => 0,
        Date,
        JSON,
        Number,
        String,
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    for (const script of headInlineScripts(file)) {
        // gtag 같은 외부 스크립트 준비 코드는 이 판정과 관계없다. 실패해도 다음 스크립트로 간다(브라우저도 그렇다).
        try { vm.runInContext(script, sandbox); } catch (_) {}
    }
    return {
        classes: [...classes].sort(),
        replaced,
        session: sessionStorage.dump(),
        local: localStorage.dump(),
        playFlag: sandbox.window.__HABITSCHOOL_PLAY_MODE === true,
    };
}

