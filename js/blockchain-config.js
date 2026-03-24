/**
 * blockchain-config.js
 * BSC (BNB Smart Chain) 블록체인 & HaBit (HBT) 토큰 설정
 * Web 2.5 Habit Mining 시스템
 *
 * 내장형 지갑 전략:
 * - Firebase UID 기반 지갑 자동 생성
 * - ethers.js 사용
 * - 별도 앱 설치 불필요
 *
 * 교환 대상: 향후 파트너십을 통한 외부 토큰 교환 예정
 */

// ⛓️ BSC 네트워크 설정
export const BSC_CONFIG = {
    // 메인넷 (BNB Smart Chain)
    mainnet: {
        rpcUrl: 'https://bsc-dataseed.binance.org/',
        chainId: 56,
        explorer: 'https://bscscan.com',
        gasToken: 'BNB'
    },

    // 테스트넷 (BSC Chapel Testnet)
    testnet: {
        rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
        chainId: 97,
        explorer: 'https://testnet.bscscan.com',
        gasToken: 'tBNB',
        faucet: 'https://testnet.bnbchain.org/faucet-smart'
    }
};

// 하위 호환: 기존 BASE_CONFIG / KLAYTN_CONFIG 참조 유지
export const BASE_CONFIG = BSC_CONFIG;
export const KLAYTN_CONFIG = BSC_CONFIG;

// 🪙 HaBit (HBT) 토큰 설정
export const HBT_TOKEN = {
    name: 'HaBit',
    symbol: 'HBT',
    decimals: 8,  // BTC와 동일
    maxSupply: 100_000_000, // 1억개 하드캡

    // 테스트넷 컨트랙트 주소 (BSC Chapel) — v4 (RATE_UPDATER_ROLE 추가)
    testnetAddress: '0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B',

    // 메인넷 컨트랙트 주소 (BSC, 향후 배포)
    mainnetAddress: '0x0000000000000000000000000000000000000000', // TODO: BSC 메인넷 배포 후

    // 교환 대상 (파트너십 체결 후 공개)
    exchange: {
        targetToken: 'TBD',        // 파트너십 체결 후 결정
        targetNative: 'TBD',       // 파트너십 체결 후 결정
        rate: 1_000_000,           // 1,000,000 HBT = 1 파트너 토큰 (예정)
        burnFee: 0.02              // 교환 시 2% 소각
    }
};

// 📋 Staking 계약 설정 (챌린지 예치용)
export const STAKING_CONTRACT = {
    // 테스트넷 (BSC Chapel) — v4
    testnetAddress: '0x7e8c29699F382B553891f853299e615257491F9D',

    // 메인넷 (BSC)
    mainnetAddress: '0x0000000000000000000000000000000000000000', // TODO: BSC 메인넷 배포 후

    // 스테이킹 파라미터
    lockupPeriod: 30 * 24 * 60 * 60, // 30일 (초 단위)
    slashRate: 0.5, // 실패 시 50% 소각
    minStakeAmount: 50, // 최소 50 HBT
    maxStakeAmount: 10000 // 최대 10,000 HBT
};

// 🎯 챌린지 설정 (3일, 7일, 30일 — 모두 통합, 식단+운동+마음 전부 인증 필수)
export const CHALLENGES = {
    'challenge-3d': {
        id: 'challenge-3d',
        name: '3일 미니 챌린지',
        description: '3일 연속 식단+운동+마음 모두 인증하기',
        category: 'all',
        dailyTarget: 1,
        requiredDays: 3,
        hbtStake: 0,
        rewardPoints: 30,
        emoji: '⚡',
        duration: 3,
        tier: 'mini'
    },
    'challenge-7d': {
        id: 'challenge-7d',
        name: '7일 위클리 챌린지',
        description: '7일 연속 식단+운동+마음 모두 인증하기',
        category: 'all',
        dailyTarget: 1,
        requiredDays: 7,
        hbtStake: 50,
        maxStake: 5000,
        bonusRate: 50,
        rewardPoints: 100,
        emoji: '🔥',
        duration: 7,
        tier: 'weekly'
    },
    'challenge-30d': {
        id: 'challenge-30d',
        name: '30일 마스터 챌린지',
        description: '30일 연속 식단+운동+마음 모두 인증하기',
        category: 'all',
        dailyTarget: 1,
        requiredDays: 30,
        hbtStake: 100,
        maxStake: 10000,
        bonusRate: 100,
        rewardPoints: 500,
        emoji: '🏆',
        duration: 30,
        tier: 'master'
    }
};

// 하위 호환: 기존 챌린지 ID → 새 ID 매핑
export const CHALLENGE_ID_MAP = {
    'challenge-diet-3d': 'challenge-3d',
    'challenge-exercise-3d': 'challenge-3d',
    'challenge-mind-3d': 'challenge-3d',
    'challenge-all-3d': 'challenge-3d',
    'challenge-diet-7d': 'challenge-7d',
    'challenge-exercise-7d': 'challenge-7d',
    'challenge-mind-7d': 'challenge-7d',
    'challenge-all-7d': 'challenge-7d',
    'challenge-diet-30d': 'challenge-30d',
    'challenge-exercise-30d': 'challenge-30d',
    'challenge-mind-30d': 'challenge-30d',
    'challenge-all-30d': 'challenge-30d'
};

// 하위 호환: 기존 CHALLENGES_30D 참조 유지
export const CHALLENGES_30D = {
    diet: CHALLENGES['challenge-30d'],
    exercise: CHALLENGES['challenge-30d'],
    mind: CHALLENGES['challenge-30d']
};

// 📊 포인트 → 토큰 변환 규칙 (v2)
export const CONVERSION_RULES = {
    pointsPerConversion: 100, // 100P 단위 변환
    minConversion: 100,       // 최소 100P
    maxConversionPerDay: 1000, // 1일 최대 1,000 HBT (서버 제한)
    gasFeeEstimate: 0, // 가스비 무료 (회사 부담)
    estimatedTime: '2-5초', // 내장형 지갑으로 즉시 처리

    // Phase 기반 반감 (v2)
    halving: {
        miningPool: 70_000_000,       // 채굴 풀 70M HBT
        phase1End: 35_000_000,        // Phase 1 → A구간: 누적 3,500만
        phase2End: 52_500_000,        // Phase 2 → B구간: 누적 5,250만
        phase3End: 61_250_000,        // Phase 3 → C구간: 누적 6,125만
        // Phase 4+ (D구간~): 나머지 875만, 무한 반감
        initialRate: 1,               // 초기: 1P = 1 HBT (100P = 100 HBT)
        maxRate: 4,                   // 최대: 1P = 4 HBT (주간 난이도 조절)
        rateScale: 100_000_000,       // 온체인 RATE_SCALE (10^8)
    }
};

// 💾 Firebase 컬렉션 구조 (참고용)
export const FIREBASE_STRUCTURE = {
    users: {
        uid: 'string',
        displayName: 'string',
        email: 'string',
        coins: 'number',
        friends: 'array',
        walletAddress: 'string',
        walletCreatedAt: 'timestamp',
        hbtBalance: 'number',
        totalHbtEarned: 'number',
        conversions: 'array',
        activeChallenges: 'object',
        activeChallenge: 'object || null',
        completedChallenges: 'array'
    },
    blockchain_transactions: {
        userId: 'string',
        txHash: 'string',
        type: 'string',
        amount: 'number',
        timestamp: 'timestamp',
        blockNumber: 'number',
        status: 'string'
    }
};

console.log('✅ 블록체인 설정 로드됨. (HaBit/HBT on BNB Smart Chain)');
