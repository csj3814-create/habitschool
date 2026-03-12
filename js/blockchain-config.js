/**
 * blockchain-config.js
 * Base 체인 블록체인 & HaBit (HBT) 토큰 설정
 * Web 2.5 Habit Mining 시스템
 * 
 * 내장형 지갑 전략:
 * - Firebase UID 기반 지갑 자동 생성
 * - ethers.js 사용
 * - 별도 앱 설치 불필요
 * 
 * 교환 대상: 향후 파트너십을 통한 외부 토큰 교환 예정
 */

// ⛓️ Base 네트워크 설정
export const BASE_CONFIG = {
    // 메인넷 (Base - Coinbase L2)
    mainnet: {
        rpcUrl: 'https://mainnet.base.org',
        chainId: 8453,
        explorer: 'https://basescan.org',
        gasToken: 'ETH'
    },
    
    // 테스트넷 (Base Sepolia)
    testnet: {
        rpcUrl: 'https://sepolia.base.org',
        chainId: 84532,
        explorer: 'https://sepolia.basescan.org',
        gasToken: 'SepoliaETH',
        faucet: 'https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet'
    }
};

// 하위 호환: 기존 KLAYTN_CONFIG 참조 유지
export const KLAYTN_CONFIG = BASE_CONFIG;

// 🪙 HaBit (HBT) 토큰 설정
export const HBT_TOKEN = {
    name: 'HaBit',
    symbol: 'HBT',
    decimals: 8,  // BTC와 동일
    maxSupply: 100_000_000, // 1억개 하드캡
    
    // 테스트넷 컨트랙트 주소 (Base Sepolia) — v2
    testnetAddress: '0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B',
    
    // 메인넷 컨트랙트 주소 (Base, 향후 배포)
    mainnetAddress: '0x0000...',  // TODO: Base 메인넷 배포 후

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
    // 테스트넷 (Base Sepolia) — v2
    testnetAddress: '0x7e8c29699F382B553891f853299e615257491F9D',
    
    // 메인넷 (Base)
    mainnetAddress: '0x0000...',   // TODO: Base 메인넷 배포 후
    
    // 스테이킹 파라미터
    lockupPeriod: 30 * 24 * 60 * 60, // 30일 (초 단위)
    slashRate: 0.5, // 실패 시 50% 소각
    minStakeAmount: 50, // 최소 50 HBT
    maxStakeAmount: 10000 // 최대 10,000 HBT
};

// 🎯 챌린지 설정 (3일, 7일, 30일)
export const CHALLENGES = {
    // === 3일 미니 챌린지 (입문용, 부담 없이 시작) ===
    'challenge-diet-3d': {
        id: 'challenge-diet-3d',
        name: '3일 식단 챌린지',
        description: '3일 연속 식단 인증하기',
        category: 'diet',
        dailyTarget: 1,
        requiredDays: 3,
        hbtStake: 0,
        rewardPoints: 10,
        emoji: '🥗',
        duration: 3,
        tier: 'mini'
    },
    'challenge-exercise-3d': {
        id: 'challenge-exercise-3d',
        name: '3일 운동 챌린지',
        description: '3일 연속 운동 인증하기',
        category: 'exercise',
        dailyTarget: 1,
        requiredDays: 3,
        hbtStake: 0,
        rewardPoints: 10,
        emoji: '🏃',
        duration: 3,
        tier: 'mini'
    },
    'challenge-mind-3d': {
        id: 'challenge-mind-3d',
        name: '3일 마음 챌린지',
        description: '3일 연속 마음 기록하기',
        category: 'mind',
        dailyTarget: 1,
        requiredDays: 3,
        hbtStake: 0,
        rewardPoints: 10,
        emoji: '🧘',
        duration: 3,
        tier: 'mini'
    },

    // === 7일 위클리 챌린지 (중급, 습관 형성 시작) ===
    'challenge-diet-7d': {
        id: 'challenge-diet-7d',
        name: '7일 식단 챌린지',
        description: '7일 연속 식단 인증하기',
        category: 'diet',
        dailyTarget: 1,
        requiredDays: 7,
        hbtStake: 50,
        bonusRate: 50,
        rewardPoints: 30,
        emoji: '🥗',
        duration: 7,
        tier: 'weekly'
    },
    'challenge-exercise-7d': {
        id: 'challenge-exercise-7d',
        name: '7일 운동 챌린지',
        description: '7일 연속 운동 인증하기',
        category: 'exercise',
        dailyTarget: 1,
        requiredDays: 7,
        hbtStake: 50,
        bonusRate: 50,
        rewardPoints: 30,
        emoji: '🏃',
        duration: 7,
        tier: 'weekly'
    },
    'challenge-mind-7d': {
        id: 'challenge-mind-7d',
        name: '7일 마음 챌린지',
        description: '7일 연속 마음 기록하기',
        category: 'mind',
        dailyTarget: 1,
        requiredDays: 7,
        hbtStake: 50,
        bonusRate: 50,
        rewardPoints: 30,
        emoji: '🧘',
        duration: 7,
        tier: 'weekly'
    },

    // === 30일 마스터 챌린지 (고급, 완전한 습관 정착) ===
    'challenge-diet-30d': {
        id: 'challenge-diet-30d',
        name: '30일 식단 챌린지',
        description: '30일 연속 식단 인증하기',
        category: 'diet',
        dailyTarget: 1,
        requiredDays: 30,
        hbtStake: 100,
        bonusRate: 100,
        rewardPoints: 50,
        emoji: '🥗',
        duration: 30,
        tier: 'master'
    },
    'challenge-exercise-30d': {
        id: 'challenge-exercise-30d',
        name: '30일 운동 챌린지',
        description: '30일 연속 운동 인증하기',
        category: 'exercise',
        dailyTarget: 1,
        requiredDays: 30,
        hbtStake: 100,
        bonusRate: 100,
        rewardPoints: 50,
        emoji: '🏃',
        duration: 30,
        tier: 'master'
    },
    'challenge-mind-30d': {
        id: 'challenge-mind-30d',
        name: '30일 마음 챌린지',
        description: '30일 연속 마음 기록 (명상/일기)',
        category: 'mind',
        dailyTarget: 1,
        requiredDays: 30,
        hbtStake: 100,
        bonusRate: 100,
        rewardPoints: 50,
        emoji: '🧘',
        duration: 30,
        tier: 'master'
    },

    // === 통합 챌린지 (식단+운동+마음 모두 완수) ===
    'challenge-all-3d': {
        id: 'challenge-all-3d',
        name: '3일 통합 챌린지',
        description: '3일 연속 식단+운동+마음 모두 인증하기',
        category: 'all',
        dailyTarget: 1,
        requiredDays: 3,
        hbtStake: 0,
        rewardPoints: 30,
        emoji: '🌟',
        duration: 3,
        tier: 'mini'
    },
    'challenge-all-7d': {
        id: 'challenge-all-7d',
        name: '7일 통합 챌린지',
        description: '7일 연속 식단+운동+마음 모두 인증하기',
        category: 'all',
        dailyTarget: 1,
        requiredDays: 7,
        hbtStake: 50,
        bonusRate: 50,
        rewardPoints: 50,
        emoji: '🌟',
        duration: 7,
        tier: 'weekly'
    },
    'challenge-all-30d': {
        id: 'challenge-all-30d',
        name: '30일 통합 챌린지',
        description: '30일 연속 식단+운동+마음 모두 인증하기',
        category: 'all',
        dailyTarget: 1,
        requiredDays: 30,
        hbtStake: 100,
        bonusRate: 100,
        rewardPoints: 100,
        emoji: '🌟',
        duration: 30,
        tier: 'master'
    }
};

// 하위 호환: 기존 CHALLENGES_30D 참조 유지
export const CHALLENGES_30D = {
    diet: CHALLENGES['challenge-diet-30d'],
    exercise: CHALLENGES['challenge-exercise-30d'],
    mind: CHALLENGES['challenge-mind-30d']
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
        // 기존 필드
        uid: 'string',
        displayName: 'string',
        email: 'string',
        coins: 'number', // 해빛 포인트 (Off-chain)
        friends: 'array',
        
        // M2E 신규 필드
        walletAddress: 'string', // 내장형 지갑 주소 (Firebase UID 기반 자동 생성, 0x로 시작)
        walletCreatedAt: 'timestamp', // 지갑 생성 시각
        hbtBalance: 'number', // 현재 HBT 보유량 (Off-chain 시뮬레이션)
        totalHbtEarned: 'number', // 총 획득 HBT
        
        // 변환 기록
        conversions: 'array', // [{ date, pointsUsed, hbtReceived, txHash, status }]
        
        // 진행 중인 챌린지 (티어별 동시 진행 가능)
        activeChallenges: 'object', // { mini: {...}, weekly: {...}, master: {...} }
        activeChallenge: 'object || null', // legacy (deprecated, 마이그레이션 완료 후 삭제)
        
        // 완료된 챌린지 기록
        completedChallenges: 'array' // [{ challengeId, completedDate, rewardHbt, rewardPoints }]
    },
    
    // 블록체인 거래 기록 (감시용)
    blockchain_transactions: {
        userId: 'string',
        txHash: 'string',
        type: 'string', // 'conversion', 'staking', 'withdrawal'
        amount: 'number', // HBT 수량
        timestamp: 'timestamp',
        blockNumber: 'number',
        status: 'string' // 'pending', 'success', 'failed'
    }
};

console.log('✅ 블록체인 설정 로드됨. (HaBit/HBT on Base chain)');
