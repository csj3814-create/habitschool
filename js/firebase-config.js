// Firebase 설정 및 초기화
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// authDomain을 현재 호스팅 도메인으로 설정 → 크로스도메인 쿠키/CSP 문제 원천 차단
const firebaseConfig = {
    apiKey: "AIzaSyDICPw7HTmu5znaRCYC93-zTux4dYYN9eI",
    authDomain: location.hostname.endsWith('.web.app') || location.hostname.endsWith('.firebaseapp.com')
        ? location.hostname : "habitschool-8497b.firebaseapp.com",
    projectId: "habitschool-8497b",
    storageBucket: "habitschool-8497b.firebasestorage.app"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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

export { app, auth, db, storage };
