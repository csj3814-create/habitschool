/**
 * blockchain-config.js
 * BSC single-chain configuration for HaBit token + HaBitStaking.
 *
 * Current rollout rule:
 * - local/staging: BSC testnet
 * - prod: stays on testnet until both conditions are true:
 *   1) mainnet addresses are filled in
 *   2) ENABLE_PROD_MAINNET is explicitly flipped to true
 */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ENABLE_PROD_MAINNET = true;

export const BSC_CONFIG = {
    mainnet: {
        key: 'mainnet',
        label: 'BSC 메인넷',
        rpcUrl: 'https://bsc-dataseed.binance.org/',
        chainId: 56,
        explorer: 'https://bscscan.com',
        gasToken: 'BNB'
    },
    testnet: {
        key: 'testnet',
        label: 'BSC 테스트넷',
        rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
        chainId: 97,
        explorer: 'https://testnet.bscscan.com',
        gasToken: 'tBNB',
        faucet: 'https://testnet.bnbchain.org/faucet-smart'
    }
};

// Backward compatibility for older imports.
export const BASE_CONFIG = BSC_CONFIG;
export const KLAYTN_CONFIG = BSC_CONFIG;

export const HBT_TOKEN = {
    name: 'HaBit',
    symbol: 'HBT',
    decimals: 8,
    maxSupply: 100_000_000,
    testnetAddress: '0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B',
    mainnetAddress: '0xCa499c14afE8B80E86D9e382AFf76f9f9c4e2E29',
    exchange: {
        targetToken: 'TBD',
        targetNative: 'TBD',
        rate: 1_000_000,
        burnFee: 0.02
    }
};

export const STAKING_CONTRACT = {
    testnetAddress: '0x7e8c29699F382B553891f853299e615257491F9D',
    mainnetAddress: '0xaad072f6be392D30a4E094Ce1E33C36929EfE6b8',
    lockupPeriod: 30 * 24 * 60 * 60,
    slashRate: 0.5,
    minStakeAmount: 50,
    maxStakeAmount: 10000
};

export const hasConfiguredMainnetContracts =
    HBT_TOKEN.mainnetAddress !== ZERO_ADDRESS &&
    STAKING_CONTRACT.mainnetAddress !== ZERO_ADDRESS;

export const CHALLENGE_DAILY_MIN_POINTS = 65;
const LEGACY_CHALLENGE_REQUIRED_CATEGORIES = ['diet', 'exercise', 'mind'];

export const ACTIVE_CHAIN_BY_APP_ENV = {
    local: 'testnet',
    staging: 'testnet',
    prod: ENABLE_PROD_MAINNET && hasConfiguredMainnetContracts ? 'mainnet' : 'testnet'
};

export function getActiveChainKey(appEnv = 'staging') {
    return ACTIVE_CHAIN_BY_APP_ENV[appEnv] || 'testnet';
}

export function getActiveBscNetwork(appEnv = 'staging') {
    return BSC_CONFIG[getActiveChainKey(appEnv)];
}

export function getActiveHbtTokenAddress(appEnv = 'staging') {
    return getActiveChainKey(appEnv) === 'mainnet'
        ? HBT_TOKEN.mainnetAddress
        : HBT_TOKEN.testnetAddress;
}

export function getActiveStakingAddress(appEnv = 'staging') {
    return getActiveChainKey(appEnv) === 'mainnet'
        ? STAKING_CONTRACT.mainnetAddress
        : STAKING_CONTRACT.testnetAddress;
}

export function getActiveGasTokenLabel(appEnv = 'staging') {
    return getActiveBscNetwork(appEnv).gasToken;
}

export function getActiveOnchainLabel(appEnv = 'staging') {
    return getActiveBscNetwork(appEnv).label;
}

export function getLegacyChallengeQualificationPolicy(tier = 'mini') {
    return {
        type: 'all_categories',
        ruleVersion: 1,
        tier,
        requiredCategories: [...LEGACY_CHALLENGE_REQUIRED_CATEGORIES]
    };
}

export function getDefaultChallengeQualificationPolicy(tier = 'mini') {
    if (tier === 'weekly' || tier === 'master') {
        return {
            type: 'daily_min_points',
            ruleVersion: 2,
            tier,
            dailyMinPoints: CHALLENGE_DAILY_MIN_POINTS,
            pointsScaleMax: 80
        };
    }
    return getLegacyChallengeQualificationPolicy(tier);
}

export function normalizeChallengeQualificationPolicy(policy, tier = 'mini') {
    if (policy?.type === 'daily_min_points' && Number(policy.dailyMinPoints) > 0) {
        return {
            type: 'daily_min_points',
            ruleVersion: Number(policy.ruleVersion) || 2,
            tier: policy.tier || tier,
            dailyMinPoints: Number(policy.dailyMinPoints),
            pointsScaleMax: Number(policy.pointsScaleMax) || 80
        };
    }
    if (policy?.type === 'all_categories') {
        return {
            type: 'all_categories',
            ruleVersion: Number(policy.ruleVersion) || 1,
            tier: policy.tier || tier,
            requiredCategories: Array.isArray(policy.requiredCategories) && policy.requiredCategories.length
                ? [...policy.requiredCategories]
                : [...LEGACY_CHALLENGE_REQUIRED_CATEGORIES]
        };
    }
    return getLegacyChallengeQualificationPolicy(tier);
}

export function getAwardedPointsTotal(awarded = {}) {
    const hasExplicitPoints =
        Object.prototype.hasOwnProperty.call(awarded, 'dietPoints') ||
        Object.prototype.hasOwnProperty.call(awarded, 'exercisePoints') ||
        Object.prototype.hasOwnProperty.call(awarded, 'mindPoints');

    const explicitTotal =
        (Number(awarded.dietPoints) || 0) +
        (Number(awarded.exercisePoints) || 0) +
        (Number(awarded.mindPoints) || 0);

    if (hasExplicitPoints || explicitTotal > 0) {
        return explicitTotal;
    }

    let fallbackTotal = 0;
    if (awarded.diet) fallbackTotal += 10;
    if (awarded.exercise) fallbackTotal += 15;
    if (awarded.mind) fallbackTotal += 5;
    return fallbackTotal;
}

export function doesAwardedPointsMeetChallengeRule(awarded = {}, policyOrTier = 'mini') {
    const policy = typeof policyOrTier === 'string'
        ? getDefaultChallengeQualificationPolicy(policyOrTier)
        : normalizeChallengeQualificationPolicy(policyOrTier, policyOrTier?.tier || 'mini');

    if (policy.type === 'daily_min_points') {
        return getAwardedPointsTotal(awarded) >= Number(policy.dailyMinPoints || 0);
    }

    return !!(awarded.diet && awarded.exercise && awarded.mind);
}

export function formatChallengeQualificationLabel(policyOrTier = 'mini') {
    const policy = typeof policyOrTier === 'string'
        ? getDefaultChallengeQualificationPolicy(policyOrTier)
        : normalizeChallengeQualificationPolicy(policyOrTier, policyOrTier?.tier || 'mini');

    if (policy.type === 'daily_min_points') {
        return `하루 ${Number(policy.dailyMinPoints || CHALLENGE_DAILY_MIN_POINTS)}P 이상이면 1일 인정`;
    }

    return '식단·운동·마음을 모두 기록하면 1일 인정';
}

export const CHALLENGES = {
    'challenge-3d': {
        id: 'challenge-3d',
        name: '3일 미니 챌린지',
        description: '3일 연속 식단·운동·마음을 모두 기록하기',
        category: 'all',
        dailyTarget: 1,
        requiredDays: 3,
        hbtStake: 0,
        rewardPoints: 30,
        emoji: '🌱',
        duration: 3,
        tier: 'mini'
    },
    'challenge-7d': {
        id: 'challenge-7d',
        name: '7일 위클리 챌린지',
        description: '하루 65P 이상으로 7일 도전하기',
        category: 'all',
        dailyTarget: 1,
        requiredDays: 7,
        hbtStake: 50,
        maxStake: 5000,
        phase1BonusRate: 50,
        rewardPoints: 100,
        emoji: '🔥',
        duration: 7,
        tier: 'weekly'
    },
    'challenge-30d': {
        id: 'challenge-30d',
        name: '30일 마스터 챌린지',
        description: '하루 65P 이상으로 30일 도전하기',
        category: 'all',
        dailyTarget: 1,
        requiredDays: 30,
        hbtStake: 100,
        maxStake: 10000,
        phase1BonusRate: 200,
        rewardPoints: 500,
        emoji: '🏆',
        duration: 30,
        tier: 'master'
    }
};

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

export const CHALLENGES_30D = {
    diet: CHALLENGES['challenge-30d'],
    exercise: CHALLENGES['challenge-30d'],
    mind: CHALLENGES['challenge-30d']
};

export const CONVERSION_RULES = {
    pointsPerConversion: 100,
    minConversion: 100,
    maxConversionPerDay: 1000,
    gasFeeEstimate: 0,
    estimatedTime: '2-5초',
    halving: {
        miningPool: 70_000_000,
        phase1End: 35_000_000,
        phase2End: 52_500_000,
        phase3End: 61_250_000,
        initialRate: 1,
        maxRate: 4,
        rateScale: 100_000_000
    }
};

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

console.log('🔗 blockchain-config loaded (BSC single-chain mode)');
