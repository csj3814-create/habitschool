/**
 * 오류 제보.
 *
 * 오늘까지 받은 제보는 전부 "안 돼요" 였다. 화면에는 고정 문구만 남고 실제 코드는
 * console 로 흘러가 사라졌기 때문에, AI 분석도 영상 업로드도 추측으로 좁혀야 했다.
 * 기기 이름조차 "갤럭시 크롬" 이 전부였다.
 *
 * 그래서 두 가지를 한다.
 *
 * 1. console.error / console.warn / onerror / unhandledrejection 을 링 버퍼에 담아
 *    둔다. 사용자가 제보를 누르는 시점에 그 직전 오류들이 함께 실려 온다.
 * 2. 사람이 적기 어려운 것(기기, OS, 브라우저, 앱인지 웹인지, 자산 버전, 화면 크기,
 *    온라인 여부)은 자동으로 붙인다.
 *
 * 사용자가 쓸 것은 "무슨 일이 있었는지" 한 줄과 스크린샷뿐이다.
 */

import { auth, db, storage, functions, APP_ENV } from './firebase-config.js?v=543';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';
import { showToast } from './ui-helpers.js?v=543';
import { isEnglishLocale } from './i18n.js?v=543';

// 자산 버전은 실제로 로드된 스크립트 주소에서 읽는다. 여기에 숫자를 또 적어 두면
// 배포 때 한쪽만 올라가 제보에 틀린 버전이 실린다.
export function readAssetVersion() {
    try {
        const src = document.querySelector('script[src*="js/app.js?v="]')?.src || '';
        return src.match(/v=(\d+)/)?.[1] || null;
    } catch (_) {
        return null;
    }
}

// 2026-10-20 제보 4건 모두 콘솔이 비어 있었다(체중·혈당이 화면에서 사라졌던 건 포함).
// 이유는 셋이었다.
//  1. error·warn 만 담았다. 앱이 "연결이 늦어 휴대폰에 남은 기록으로 그린다" 같은 갈림길은
//     console.info 로 남기는데(예: [daily-log], [shared-import]) 그건 버려졌다.
//  2. 담는 곳이 메모리뿐이라, 다른 앱에 다녀오며 페이지가 다시 열리면 직전 기록이 사라졌다.
//     사람은 이상한 것을 본 뒤에 제보를 누르므로, 그 사이에 다시 열리면 빈손이다.
//  3. 옛 기록으로 그리는 갈림길 자체가 경고를 남기지 않았다(app-core.js loadDataForSelectedDate).
// 그래서 "[이름표]" 로 시작하는 info·log 도 담고, 같은 탭 안에서는 다시 열려도 이어지게
// sessionStorage 에 둔다(탭을 닫으면 사라진다). 서버 대체 저장은 50건까지 받는다.
const CONSOLE_BUFFER_LIMIT = 40;
// 2026-10-20(v525) 콘솔 기록 작업 때 아래 두 줄이 함께 지워져, 제보 보내기가 "MAX_MESSAGE_LENGTH is not defined" 로
// 실패했다(2026-10-21 대표 제보). 서버(functions/bug-report-fallback.js)와 같은 길이다.
const MAX_MESSAGE_LENGTH = 2000;
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const CONSOLE_BUFFER_STORAGE_KEY = 'habitschool-console-buffer-v1';
const CONSOLE_PERSIST_DELAY_MS = 400;
const _consoleBuffer = [];
let _installed = false;
let _persistTimer = null;

function persistConsoleBufferSoon() {
    if (_persistTimer) return;
    _persistTimer = setTimeout(() => {
        _persistTimer = null;
        try {
            sessionStorage.setItem(CONSOLE_BUFFER_STORAGE_KEY, JSON.stringify(_consoleBuffer));
        } catch (_) {
            // 저장소가 막힌 브라우저(사생활 보호 모드 등)에서는 이번 페이지 것만 실린다.
        }
    }, CONSOLE_PERSIST_DELAY_MS);
}

function restoreConsoleBuffer() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(CONSOLE_BUFFER_STORAGE_KEY) || '[]');
        if (!Array.isArray(saved)) return;
        saved
            .filter((entry) => entry && typeof entry.text === 'string' && entry.text)
            .slice(-CONSOLE_BUFFER_LIMIT)
            .forEach((entry) => _consoleBuffer.push({
                level: String(entry.level || 'log').slice(0, 20),
                text: entry.text.slice(0, 500),
                at: String(entry.at || '')
            }));
    } catch (_) {}
}

function pushConsoleEntry(level, parts) {
    try {
        const text = parts
            .map((part) => {
                if (part instanceof Error) return `${part.name}: ${part.message}`;
                if (typeof part === 'object' && part !== null) {
                    // 순환 참조가 있는 객체가 흔해서 JSON.stringify 를 그대로 쓰면 던진다.
                    try { return JSON.stringify(part); } catch (_) { return String(part); }
                }
                return String(part);
            })
            .join(' ')
            .slice(0, 500);
        if (!text.trim()) return;
        _consoleBuffer.push({ level, text, at: new Date().toISOString() });
        while (_consoleBuffer.length > CONSOLE_BUFFER_LIMIT) _consoleBuffer.shift();
        persistConsoleBufferSoon();
    } catch (_) {
        // 수집이 앱을 멈춰서는 안 된다.
    }
}

/** 앱이 갈림길에 남기는 안내인가. "[daily-log] ..." 처럼 이름표로 시작한다. */
export function isTaggedConsoleMessage(first) {
    return typeof first === 'string' && /^\[[^\]\s][^\]]{0,40}\]/.test(first);
}

function describePageEntry() {
    let type = '';
    try {
        type = String(performance.getEntriesByType?.('navigation')?.[0]?.type || '');
    } catch (_) {}
    return `페이지 열림 (${type || 'navigate'}) ${window.location?.pathname || ''}${window.location?.search ? ' ?' + Array.from(new URLSearchParams(window.location.search).keys()).join(',') : ''}`;
}

/** console 과 전역 오류를 가로챈다. 원래 동작은 그대로 유지한다. */
export function installBugReportCollectors() {
    if (_installed || typeof window === 'undefined') return;
    _installed = true;

    restoreConsoleBuffer();
    // 다시 열린 경계를 남긴다. 그 앞은 지난 페이지에서 있었던 일이다(주소 값은 남기지 않는다).
    pushConsoleEntry('page', [describePageEntry()]);

    ['error', 'warn'].forEach((level) => {
        const original = console[level];
        if (typeof original !== 'function') return;
        console[level] = function (...args) {
            pushConsoleEntry(level, args);
            return original.apply(console, args);
        };
    });

    // info·log 는 이름표가 붙은 앱의 안내만 담는다. 라이브러리의 수다는 담지 않는다.
    ['info', 'log'].forEach((level) => {
        const original = console[level];
        if (typeof original !== 'function') return;
        console[level] = function (...args) {
            if (isTaggedConsoleMessage(args[0])) pushConsoleEntry(level, args);
            return original.apply(console, args);
        };
    });

    window.addEventListener('error', (event) => {
        const where = event?.filename ? ` (${event.filename}:${event.lineno})` : '';
        pushConsoleEntry('onerror', [`${event?.message || 'script error'}${where}`]);
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event?.reason;
        pushConsoleEntry('unhandledrejection', [reason?.message || reason || 'unhandled rejection']);
    });
}

export function getRecentConsoleEntries() {
    return _consoleBuffer.slice();
}

function readDisplayMode() {
    try {
        if (window.matchMedia?.('(display-mode: standalone)').matches) return 'standalone';
        if (window.navigator.standalone === true) return 'ios-standalone';
    } catch (_) {}
    return 'browser';
}

function readConnection() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return null;
    return {
        effectiveType: c.effectiveType || null,
        downlinkMbps: Number.isFinite(c.downlink) ? c.downlink : null,
        saveData: !!c.saveData
    };
}

/** 사람이 적어 주기 어려운 것들. 제보 한 건으로 환경이 특정되게 한다. */
export function collectDeviceContext() {
    const nav = window.navigator || {};
    return {
        userAgent: String(nav.userAgent || '').slice(0, 500),
        language: nav.language || null,
        platform: nav.userAgentData?.platform || nav.platform || null,
        mobile: nav.userAgentData?.mobile ?? null,
        // TWA 로 열렸는지. 이번 심사에서 "앱을 안 썼다"가 문제였으므로 특히 중요하다.
        displayMode: readDisplayMode(),
        isAndroidApp: String(document.referrer || '').startsWith('android-app://'),
        path: window.location?.pathname || null,
        activeTab: document.querySelector('.content-section.active')?.id || null,
        assetVersion: readAssetVersion(),
        appEnv: APP_ENV,
        screen: {
            width: window.screen?.width ?? null,
            height: window.screen?.height ?? null,
            viewportWidth: window.innerWidth ?? null,
            viewportHeight: window.innerHeight ?? null,
            dpr: window.devicePixelRatio ?? null
        },
        online: nav.onLine !== false,
        connection: readConnection(),
        reportedAtLocal: new Date().toString()
    };
}

async function uploadScreenshot(user, file) {
    if (!file) return null;
    if (!String(file.type || '').startsWith('image/')) {
        throw new Error('이미지 파일만 첨부할 수 있어요.');
    }
    if (Number(file.size || 0) > MAX_SCREENSHOT_BYTES) {
        throw new Error('스크린샷은 10MB 이하만 올릴 수 있어요.');
    }
    const safeName = String(file.name || 'screenshot').replace(/[\\/#?]/g, '_').slice(-60);
    const path = `bug_reports/${user.uid}/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type });
    return await getDownloadURL(storageRef);
}

/**
 * 제보를 저장한다. 스크린샷 업로드가 실패해도 본문은 남긴다 —
 * 첨부 때문에 제보 자체가 사라지면 아무것도 못 받는다.
 */
export async function submitBugReport({ description = '', screenshotFile = null } = {}) {
    const user = auth.currentUser;
    if (!user) {
        showToast(isEnglishLocale() ? 'Please sign in to send a report.' : '로그인 후 제보해 주세요.');
        return null;
    }
    const message = String(description || '').trim();
    if (message.length < 5) {
        showToast(isEnglishLocale() ? 'Please write a little more about what happened.' : '무슨 일이 있었는지 조금만 더 적어 주세요.');
        return null;
    }

    let screenshotUrl = null;
    let screenshotError = null;
    if (screenshotFile) {
        try {
            screenshotUrl = await uploadScreenshot(user, screenshotFile);
        } catch (error) {
            screenshotError = String(error?.code || error?.message || 'screenshot_failed');
        }
    }

    const payload = {
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || null,
        message: message.slice(0, MAX_MESSAGE_LENGTH),
        device: collectDeviceContext(),
        consoleEntries: getRecentConsoleEntries(),
        // 예외 없이 안 끝나는 업로드는 콘솔에 아무것도 남기지 않는다.
        pendingUploads: (() => { try { return window.__getPendingUploadSnapshot?.() || []; } catch (_) { return []; } })(),
        screenshotUrl,
        screenshotError,
        status: 'open',
        createdAt: serverTimestamp()
    };

    try {
        const created = await addDoc(collection(db, 'bug_reports'), payload);
        return { id: created.id, screenshotUrl, screenshotError };
    } catch (error) {
        // Firestore SDK 가 무너지면(INTERNAL ASSERTION) 이 페이지의 쓰기는 전부 막힌다.
        // 제보만은 서버 함수로 보낸다 — 함수 호출은 Firestore SDK 를 거치지 않는다
        // (functions/bug-report-fallback.js). 스크린샷은 이미 올라갔으니 다시 올리지 않는다.
        console.warn('[bug-report] Firestore 로 못 보내 서버로 보냅니다:', error?.code || '', error?.message || error);
        const { createdAt, ...rest } = payload;
        const result = await httpsCallable(functions, 'submitBugReportFallback')({
            ...rest,
            clientError: String(error?.code || error?.message || error || '').slice(0, 300)
        });
        return { id: result?.data?.id || null, screenshotUrl, screenshotError, via: 'server-fallback' };
    }
}
