// Firebase 설정 및 초기화
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { connectFirestoreEmulator, doc, enableNetwork, getDocFromServer, initializeFirestore, setLogLevel } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { connectFunctionsEmulator, getFunctions } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { connectStorageEmulator, getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// authDomain은 항상 firebaseapp.com 사용
// → PWA가 설치된 경우 hosting 도메인으로 auth 콜백이 가면 Android가 PWA에서 처리해버림
// → firebaseapp.com은 PWA scope 밖이므로 안전
// → signInWithPopup은 postMessage 기반이므로 크로스오리진 문제 없음
const PROD_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDICPw7HTmu5znaRCYC93-zTux4dYYN9eI",
    authDomain: "habitschool-8497b.firebaseapp.com",
    projectId: "habitschool-8497b",
    storageBucket: "habitschool-8497b.firebasestorage.app",
    messagingSenderId: "628617480821",
    appId: "1:628617480821:web:2756952ab78e8edf97463c"
};

const STAGING_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCFA1-cb_C8O3-9aFHaBu9GxcvpOHv_Q1Q",
    authDomain: "habitschool-staging.firebaseapp.com",
    projectId: "habitschool-staging",
    storageBucket: "habitschool-staging.firebasestorage.app",
    messagingSenderId: "227563724498",
    appId: "1:227563724498:web:4810638c31ff8ccf0bd70b"
};

const PROD_VAPID_KEY = "BD5hsiadZ0sOiiM-63QEEXM7u_z0YCXfSTWNljeydEeH8-9cXNKgXAP6pcMW9zxsICMaxQ-BzxSe619EGz_Hg4c";
const STAGING_VAPID_KEY = "BAol_2h3kie-9VCVgi5TiSxDPBPtQpXQV-wPwT0rkXO3lfb8OYs-D0hiwvaN-NdhhzmcVmyH8qFaJKfl0Zyb84U";
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
const FUNCTIONS_REGION = 'asia-northeast3';

function detectAppEnv(hostname) {
    if (LOCAL_HOSTNAMES.has(hostname)) return 'local';
    if (hostname.includes('habitschool-staging')) return 'staging';
    return 'prod';
}

function getCanonicalOrigin(appEnv) {
    if (appEnv === 'local') return window.location.origin;
    if (appEnv === 'staging') return 'https://habitschool-staging.web.app';
    return 'https://habitschool.web.app';
}

export const APP_ENV = detectAppEnv(window.location.hostname);
export const IS_LOCAL_ENV = APP_ENV === 'local';
export const IS_STAGING_ENV = APP_ENV === 'staging';
export const IS_PROD_ENV = APP_ENV === 'prod';
export const FIREBASE_REGION = FUNCTIONS_REGION;
export const APP_ORIGIN = getCanonicalOrigin(APP_ENV);
export const APP_OG_IMAGE_URL = `${APP_ORIGIN}/icons/og-image.png`;
export const FCM_PUBLIC_VAPID_KEY = IS_PROD_ENV ? PROD_VAPID_KEY : STAGING_VAPID_KEY;

if (!IS_LOCAL_ENV) {
    setLogLevel('silent');
}

const FIRESTORE_RECONNECT_RETRY_DELAYS_MS = [1000, 3000];
const FIRESTORE_RECONNECT_PROBE_TIMEOUT_MS = 5000;

let _firestoreReconnectTimers = [];
let _firestoreReconnectSequence = 0;
let _firestoreReconnectProbePromise = null;
let _firestoreReconnectHooksBound = false;
let _pendingFirestoreReconnectReason = '';

const firebaseConfig = IS_PROD_ENV ? PROD_FIREBASE_CONFIG : STAGING_FIREBASE_CONFIG;

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    experimentalLongPollingOptions: {
        timeoutSeconds: 25
    }
});
const storage = getStorage(app);
const functions = getFunctions(app, FUNCTIONS_REGION);

if (IS_LOCAL_ENV) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
}

function clearFirestoreReconnectTimers() {
    _firestoreReconnectTimers.forEach(timerId => clearTimeout(timerId));
    _firestoreReconnectTimers = [];
}

function normalizeFirestoreReconnectErrorMessage(error = null) {
    if (!error) return '';
    if (typeof error === 'string') return error.trim();
    if (typeof error?.message === 'string') return error.message.trim();
    return String(error).trim();
}

function isRetryableFirestoreConnectivityError(error = null) {
    const code = String(error?.code || '').trim().toLowerCase();
    const message = normalizeFirestoreReconnectErrorMessage(error).toLowerCase();
    return code === 'unavailable'
        || code === 'deadline-exceeded'
        || code === 'failed-precondition'
        || message.includes('client is offline')
        || message.includes('cloud firestore backend')
        || message.includes('backend didn\'t respond')
        || message.includes('failed to get document because the client is offline');
}

export function isFirestoreConnectivityIssue(error = null) {
    return isRetryableFirestoreConnectivityError(error);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runFirestoreReconnectProbe(reason = '') {
    if (IS_LOCAL_ENV || typeof window === 'undefined') return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    if (_firestoreReconnectProbePromise) return _firestoreReconnectProbePromise;

    _firestoreReconnectProbePromise = (async () => {
        try {
            await enableNetwork(db).catch(() => {});

            const currentUid = auth.currentUser?.uid;
            if (currentUid) {
                await Promise.race([
                    getDocFromServer(doc(db, 'users', currentUid)),
                    delay(FIRESTORE_RECONNECT_PROBE_TIMEOUT_MS).then(() => {
                        throw new Error('Firestore reconnect probe timed out');
                    })
                ]);
            }

            _pendingFirestoreReconnectReason = '';
            clearFirestoreReconnectTimers();
            console.info('[Firestore] reconnect probe succeeded:', reason || 'unspecified');
            return true;
        } catch (error) {
            console.info('[Firestore] reconnect probe still pending:', reason || 'unspecified', normalizeFirestoreReconnectErrorMessage(error));
            return false;
        } finally {
            _firestoreReconnectProbePromise = null;
        }
    })();

    return _firestoreReconnectProbePromise;
}

function bindFirestoreReconnectHooks() {
    if (_firestoreReconnectHooksBound || typeof window === 'undefined') return;
    _firestoreReconnectHooksBound = true;

    window.addEventListener('online', () => {
        scheduleFirestoreReconnect('browser-online', { includeImmediate: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (!_pendingFirestoreReconnectReason) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        scheduleFirestoreReconnect('visibility-resume', { includeImmediate: true });
    });
}

export function scheduleFirestoreReconnect(reason = 'firestore-connectivity', { includeImmediate = false } = {}) {
    if (IS_LOCAL_ENV || typeof window === 'undefined') return;

    bindFirestoreReconnectHooks();

    const normalizedReason = String(reason || 'firestore-connectivity').trim();
    const scheduleToken = ++_firestoreReconnectSequence;
    const delays = includeImmediate
        ? [0, ...FIRESTORE_RECONNECT_RETRY_DELAYS_MS]
        : FIRESTORE_RECONNECT_RETRY_DELAYS_MS;

    _pendingFirestoreReconnectReason = normalizedReason;
    clearFirestoreReconnectTimers();

    delays.forEach(delayMs => {
        const timerId = window.setTimeout(async () => {
            if (scheduleToken !== _firestoreReconnectSequence) return;
            if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
            await runFirestoreReconnectProbe(`${normalizedReason}:${delayMs}ms`);
        }, delayMs);
        _firestoreReconnectTimers.push(timerId);
    });
}

export function noteFirestoreConnectivityFailure(error = null, context = '') {
    if (!isRetryableFirestoreConnectivityError(error)) return false;
    const normalizedContext = String(context || '').trim();
    const normalizedError = normalizeFirestoreReconnectErrorMessage(error);
    const reason = normalizedContext
        ? `${normalizedContext}${normalizedError ? ` - ${normalizedError}` : ''}`
        : (normalizedError || 'firestore-connectivity');

    scheduleFirestoreReconnect(reason);
    return true;
}

if (!IS_LOCAL_ENV) {
    bindFirestoreReconnectHooks();
}

// 상수
export const MAX_IMG_SIZE = 20 * 1024 * 1024;  // 20MB
export const MAX_VID_SIZE = 100 * 1024 * 1024; // 100MB

// 마일스톤 뱃지 정의
// Legacy BADGES (backward compat)
export const BADGES = {
    starter: { id: 'starter', emoji: '🌟', name: '시작', desc: '첫 기록' },
    streak7: { id: 'streak7', emoji: '🔥', name: '연속7일', desc: '7일 연속 기록' },
    diet7: { id: 'diet7', emoji: '🥗', name: '식단 지킴이', desc: '식단 7일 연속' },
    exercise7: { id: 'exercise7', emoji: '💪', name: '운동 마스터', desc: '운동 7일 연속' },
    mind7: { id: 'mind7', emoji: '🧘', name: '마음 챙김', desc: '마음 7일 연속' },
    streak30: { id: 'streak30', emoji: '🏆', name: '30일 연속', desc: '30일 연속 기록' },
    points100: { id: 'points100', emoji: '💯', name: '백포인트', desc: '100P 달성' },
    points300: { id: 'points300', emoji: '💎', name: '다이아몬드', desc: '300P 달성' },
    level3: { id: 'level3', emoji: '🚀', name: 'Lv.3 도전', desc: '레벨 3 달성' },
    friends5: { id: 'friends5', emoji: '⭐', name: '네트워크', desc: '친구 5명' }
};

// 프로그레시브 마일스톤 시스템
export const MILESTONES = {
    streak: {
        label: '📅 연속 기록',
        levels: [
            { id: 'streak1', emoji: '🌟', name: '시작', desc: '첫 기록 달성', target: 1, reward: 5 },
            { id: 'streak3', emoji: '🔥', name: '3일 연속', desc: '3일 연속 기록', target: 3, reward: 10 },
            { id: 'streak7', emoji: '🔥', name: '7일 연속', desc: '7일 연속 기록', target: 7, reward: 20 },
            { id: 'streak14', emoji: '💫', name: '14일 연속', desc: '14일 연속 기록', target: 14, reward: 30 },
            { id: 'streak30', emoji: '🏆', name: '30일 연속', desc: '30일 연속 기록', target: 30, reward: 50 },
            { id: 'streak60', emoji: '👑', name: '60일 연속', desc: '60일 연속 기록', target: 60, reward: 100 }
        ]
    },
    diet: {
        label: '🥗 식단',
        levels: [
            { id: 'diet1', emoji: '🥗', name: '식단 시작', desc: '첫 식단 기록', target: 1, reward: 5 },
            { id: 'diet3', emoji: '🥗', name: '식단 3일', desc: '식단 3일 기록', target: 3, reward: 10 },
            { id: 'diet7', emoji: '🥗', name: '식단 7일', desc: '식단 7일 기록', target: 7, reward: 15 },
            { id: 'diet14', emoji: '🥗', name: '식단 14일', desc: '식단 14일 달성', target: 14, reward: 25 },
            { id: 'diet30', emoji: '🥗', name: '식단 30일', desc: '식단 30일 달성', target: 30, reward: 50 }
        ]
    },
    exercise: {
        label: '💪 운동',
        levels: [
            { id: 'exercise1', emoji: '💪', name: '운동 시작', desc: '첫 운동 기록', target: 1, reward: 5 },
            { id: 'exercise3', emoji: '💪', name: '운동 3일', desc: '운동 3일 기록', target: 3, reward: 10 },
            { id: 'exercise7', emoji: '💪', name: '운동 7일', desc: '운동 7일 기록', target: 7, reward: 15 },
            { id: 'exercise14', emoji: '💪', name: '운동 14일', desc: '운동 14일 달성', target: 14, reward: 25 },
            { id: 'exercise30', emoji: '💪', name: '운동 30일', desc: '운동 30일 달성', target: 30, reward: 50 }
        ]
    },
    mind: {
        label: '🧘 마음',
        levels: [
            { id: 'mind1', emoji: '🧘', name: '마음 시작', desc: '첫 마음 기록', target: 1, reward: 5 },
            { id: 'mind3', emoji: '🧘', name: '마음 3일', desc: '마음 3일 기록', target: 3, reward: 10 },
            { id: 'mind7', emoji: '🧘', name: '마음 7일', desc: '마음 7일 기록', target: 7, reward: 15 },
            { id: 'mind14', emoji: '🧘', name: '마음 14일', desc: '마음 14일 달성', target: 14, reward: 25 },
            { id: 'mind30', emoji: '🧘', name: '마음 30일', desc: '마음 30일 달성', target: 30, reward: 50 }
        ]
    }
};

// 미션 정의 (난이도별: easy/normal/hard)
export const MISSIONS = {
    1: {
        name: '시작',
        diet: {
            easy:   { id: 'm1_diet_easy',   text: '🥗 주 2일 채소 한 끼', target: 2 },
            normal: { id: 'm1_diet_normal', text: '🥗 주 3일 채소 한 끼', target: 3 },
            hard:   { id: 'm1_diet_hard',   text: '🥗 주 5일 채소 한 끼', target: 5 }
        },
        exercise: {
            easy:   { id: 'm1_exer_easy',   text: '🏃 주 2회 운동', target: 2 },
            normal: { id: 'm1_exer_normal', text: '🏃 주 3회 운동', target: 3 },
            hard:   { id: 'm1_exer_hard',   text: '🏃 주 5회 운동', target: 5 }
        },
        mind: {
            easy:   { id: 'm1_mind_easy',   text: '🧘 주 1회 마음 챙김', target: 1 },
            normal: { id: 'm1_mind_normal', text: '🧘 주 2회 마음 챙김', target: 2 },
            hard:   { id: 'm1_mind_hard',   text: '🧘 주 4회 마음 챙김', target: 4 }
        }
    },
    2: {
        name: '적응',
        diet: {
            easy:   { id: 'm2_diet_easy',   text: '🥗 주 3일 채소 식단', target: 3 },
            normal: { id: 'm2_diet_normal', text: '🥗 주 5일 채소 식단', target: 5 },
            hard:   { id: 'm2_diet_hard',   text: '🥗 매일 채소 식단', target: 7 }
        },
        exercise: {
            easy:   { id: 'm2_exer_easy',   text: '🏃 주 3회 운동', target: 3 },
            normal: { id: 'm2_exer_normal', text: '🏃 주 4회 운동', target: 4 },
            hard:   { id: 'm2_exer_hard',   text: '🏃 주 6회 운동', target: 6 }
        },
        mind: {
            easy:   { id: 'm2_mind_easy',   text: '🧘 주 2회 마음 챙김', target: 2 },
            normal: { id: 'm2_mind_normal', text: '🧘 주 3회 마음 챙김', target: 3 },
            hard:   { id: 'm2_mind_hard',   text: '🧘 주 5회 마음 챙김', target: 5 }
        }
    },
    3: {
        name: '도전',
        diet: {
            easy:   { id: 'm3_diet_easy',   text: '🥗 주 4일 클린 식단', target: 4 },
            normal: { id: 'm3_diet_normal', text: '🥗 주 5일 클린 식단', target: 5 },
            hard:   { id: 'm3_diet_hard',   text: '🥗 매일 클린 식단', target: 7 }
        },
        exercise: {
            easy:   { id: 'm3_exer_easy',   text: '🏃 주 4회 운동', target: 4 },
            normal: { id: 'm3_exer_normal', text: '🏃 주 5회 운동', target: 5 },
            hard:   { id: 'm3_exer_hard',   text: '🏃 매일 운동', target: 7 }
        },
        mind: {
            easy:   { id: 'm3_mind_easy',   text: '🧘 주 3회 마음 챙김', target: 3 },
            normal: { id: 'm3_mind_normal', text: '🧘 주 4회 마음 챙김', target: 4 },
            hard:   { id: 'm3_mind_hard',   text: '🧘 주 6회 마음 챙김', target: 6 }
        }
    },
    4: {
        name: '성장',
        diet: {
            easy:   { id: 'm4_diet_easy',   text: '🥗 주 5일 건강 식단', target: 5 },
            normal: { id: 'm4_diet_normal', text: '🥗 주 6일 건강 식단', target: 6 },
            hard:   { id: 'm4_diet_hard',   text: '🥗 매일 클린 식단', target: 7 }
        },
        exercise: {
            easy:   { id: 'm4_exer_easy',   text: '🏃 주 5회 운동', target: 5 },
            normal: { id: 'm4_exer_normal', text: '🏃 주 6회 운동', target: 6 },
            hard:   { id: 'm4_exer_hard',   text: '🏃 매일 운동', target: 7 }
        },
        mind: {
            easy:   { id: 'm4_mind_easy',   text: '🧘 주 4회 마음 챙김', target: 4 },
            normal: { id: 'm4_mind_normal', text: '🧘 주 5회 마음 챙김', target: 5 },
            hard:   { id: 'm4_mind_hard',   text: '🧘 매일 마음 챙김', target: 7 }
        }
    },
    5: {
        name: '마스터',
        diet: {
            easy:   { id: 'm5_diet_easy',   text: '🥗 주 6일 클린 식단', target: 6 },
            normal: { id: 'm5_diet_normal', text: '🥗 매일 클린 식단', target: 7 },
            hard:   { id: 'm5_diet_hard',   text: '🥗 매일 완벽 식단', target: 7 }
        },
        exercise: {
            easy:   { id: 'm5_exer_easy',   text: '🏃 주 6회 운동', target: 6 },
            normal: { id: 'm5_exer_normal', text: '🏃 매일 운동', target: 7 },
            hard:   { id: 'm5_exer_hard',   text: '🏃 매일 고강도 운동', target: 7 }
        },
        mind: {
            easy:   { id: 'm5_mind_easy',   text: '🧘 주 5회 마음 챙김', target: 5 },
            normal: { id: 'm5_mind_normal', text: '🧘 주 6회 마음 챙김', target: 6 },
            hard:   { id: 'm5_mind_hard',   text: '🧘 매일 마음 챙김', target: 7 }
        }
    }
};

// 미션 배지 정의
export const MISSION_BADGES = {
    firstMission: { id: 'firstMission', emoji: '🎯', name: '첫 미션', desc: '첫 주간 미션 설정' },
    weekComplete: { id: 'weekComplete', emoji: '✅', name: '주간 달성', desc: '주간 미션 100% 달성' },
    streak3: { id: 'mStreak3', emoji: '🔥', name: '3주 연속', desc: '3주 연속 80%+ 달성' },
    streak5: { id: 'mStreak5', emoji: '💫', name: '5주 연속', desc: '5주 연속 80%+ 달성' },
    streak10: { id: 'mStreak10', emoji: '👑', name: '10주 연속', desc: '10주 연속 80%+ 달성' },
    customMaster: { id: 'customMaster', emoji: '🎨', name: '나만의 미션', desc: '커스텀 미션 첫 달성' },
    hardMode: { id: 'hardMode', emoji: '💪', name: '도전 정신', desc: '도전 난이도 미션 달성' },
    allCategories: { id: 'allCategories', emoji: '🏆', name: '올라운더', desc: '식단+운동+마음 모두 달성' }
};

// 주간 ID 계산 (ISO 8601 주차)
export function getWeekId(dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export { app, auth, db, storage, functions };
