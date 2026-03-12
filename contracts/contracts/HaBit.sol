// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title HaBit (HBT) Token — v2
 * @notice ERC-20 토큰 — 건강 습관 인증 채굴 + 주간 난이도 조절 + 챌린지 스테이킹
 * @dev Base 체인 배포, 8 decimals
 *
 * 핵심 메커니즘:
 * - 최대 발행량: 100,000,000 HBT (하드캡)
 * - 통합 채굴 풀: 70,000,000 HBT (70%) — 일일 인증 + 챌린지 보너스 + 시즌 보상
 * - 리저브: 30,000,000 HBT (30%) — 팀, 파트너십, 초기 유동성, 긴급 자금
 * - 주간 난이도 조절: 오프체인 계산 → updateRate() 온체인 갱신
 * - Phase 기반 반감: Phase 1(3,500만) → Phase 2(1,750만) → Phase 3(875만) → 무한 반감
 * - 챌린지 스테이킹: 예치 → 성공 시 100% 반환, 실패 시 50% 소각
 * - 서킷 브레이커: 글로벌/유저별 일일 민팅 한도
 *
 * 보안:
 * - OpenZeppelin AccessControl (MINTER_ROLE)
 * - ReentrancyGuard
 * - 온체인 비율 변동폭 제한 (Smoothing)
 *
 * ⚠️ 리저브 30M은 컨스트럭터에서 즉시 발행됩니다.
 *    프로덕션에서는 시간 기반 베스팅 또는 multi-sig 운영을 권장합니다.
 */
contract HaBit is ERC20, ERC20Burnable, AccessControl, ReentrancyGuard {

    // ============ 상수 ============
    uint8 private constant _DECIMALS = 8;
    uint256 private constant _UNIT = 10 ** _DECIMALS;

    uint256 public constant MAX_SUPPLY    = 100_000_000 * _UNIT;  // 1억 HBT
    uint256 public constant MINING_POOL   =  70_000_000 * _UNIT;  // 7천만 HBT (채굴 풀)
    uint256 public constant RESERVE       =  30_000_000 * _UNIT;  // 3천만 HBT (리저브)

    // Phase 구간 경계 (누적 채굴량 기준)
    uint256 public constant PHASE1_END    =  35_000_000 * _UNIT;
    uint256 public constant PHASE2_END    =  52_500_000 * _UNIT;
    uint256 public constant PHASE3_END    =  61_250_000 * _UNIT;

    // Phase별 주간 채굴 목표 (참고용, 실제 조절은 오프체인)
    uint256 public constant PHASE1_WEEKLY = 140_000 * _UNIT;
    uint256 public constant PHASE2_WEEKLY =  70_000 * _UNIT;
    uint256 public constant PHASE3_WEEKLY =  35_000 * _UNIT;

    // 비율(Rate) 스케일링: rate는 _UNIT (10^8) 단위로 저장
    // rate = 1 * _UNIT → 1P = 1 HBT
    // rate = 4 * _UNIT → 1P = 4 HBT (상한)
    uint256 public constant RATE_SCALE = _UNIT;
    uint256 public constant MAX_RATE   = 4 * RATE_SCALE;  // 1P = 최대 4 HBT

    // 서킷 브레이커: 일일 민팅 한도
    uint256 public constant GLOBAL_DAILY_CAP = 500_000 * _UNIT;   // 하루 전체 50만 HBT
    uint256 public constant USER_DAILY_CAP   =  20_000 * _UNIT;   // 지갑당 하루 2만 HBT

    // 역할
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // ============ 상태 변수 ============
    uint256 public totalMintedFromMining;    // 채굴 풀에서 누적 발행량
    uint256 public totalBurned;              // 누적 소각량 (모든 소각 추적)

    // P:HBT 교환 비율 (RATE_SCALE 단위)
    uint256 public currentRate;
    uint256 public lastRateUpdate;

    // 일일 민팅 추적
    mapping(uint256 => uint256) public globalDailyMinted;                    // day => minted
    mapping(address => mapping(uint256 => uint256)) public userDailyMinted;  // user => day => minted

    // 챌린지 스테이킹
    mapping(address => uint256) public challengeStakes;
    uint256 public totalActiveStakes;        // 현재 예치 중인 총량
    uint256 public totalChallengeStaked;     // 누적 예치 총량
    uint256 public totalChallengeSlashed;    // 누적 소각량 (챌린지)
    uint256 public totalChallengeReturned;   // 누적 반환량 (챌린지)

    // ============ 이벤트 ============
    event HabitMined(
        address indexed user,
        uint256 pointsUsed,
        uint256 hbtMinted,
        uint256 phase
    );
    event RateUpdated(
        uint256 oldRate,
        uint256 newRate,
        uint256 timestamp
    );
    event ChallengeStaked(
        address indexed user,
        uint256 amount
    );
    event ChallengeResolved(
        address indexed user,
        uint256 returned,
        uint256 burned,
        bool success
    );

    // ============ 에러 ============
    error ExceedsMiningPool();
    error ExceedsGlobalDailyCap();
    error ExceedsUserDailyCap();
    error ZeroAmount();
    error RateExceedsMaxCap();
    error RateChangeExceedsLimit();
    error InvalidRate();
    error NoStakeFound();
    error InsufficientBalance();

    // ============ 생성자 ============
    /**
     * @param reserveWallet 리저브 물량(30M)을 받을 관리자 지갑 주소
     */
    constructor(address reserveWallet) ERC20("HaBit", "HBT") {
        require(reserveWallet != address(0), "Invalid reserve wallet");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);

        // 리저브 30M 프리민트
        _mint(reserveWallet, RESERVE);

        // 초기 비율: 1P = 1 HBT
        currentRate = 1 * RATE_SCALE;
        lastRateUpdate = block.timestamp;
    }

    // ============ ERC-20 오버라이드 ============

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /**
     * @dev 모든 소각을 totalBurned에 자동 추적
     */
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (to == address(0)) {
            totalBurned += value;
        }
    }

    // ============ Phase 로직 ============

    /**
     * @notice 현재 채굴 Phase 및 주간 목표량 조회
     * @return phase 현재 Phase 번호 (1~)
     * @return weeklyTarget 해당 Phase의 주간 채굴 목표 (raw units)
     */
    function getCurrentPhase() public view returns (uint256 phase, uint256 weeklyTarget) {
        uint256 mined = totalMintedFromMining;

        if (mined < PHASE1_END) return (1, PHASE1_WEEKLY);
        if (mined < PHASE2_END) return (2, PHASE2_WEEKLY);
        if (mined < PHASE3_END) return (3, PHASE3_WEEKLY);

        // Phase 3 이후: 남은 물량의 절반 단위로 무한 반감
        uint256 remaining = MINING_POOL - PHASE3_END;
        uint256 extraMined = mined - PHASE3_END;
        uint256 target = PHASE3_WEEKLY;
        uint256 threshold = remaining / 2;
        phase = 4;

        while (extraMined >= threshold && threshold > 0) {
            extraMined -= threshold;
            threshold /= 2;
            target /= 2;
            phase++;
        }

        if (target == 0) target = 1;
        weeklyTarget = target;
    }

    // ============ 채굴 (Mining) ============

    /**
     * @notice 습관 인증 포인트를 HBT로 변환 (서버가 호출)
     * @param to 사용자 지갑 주소
     * @param pointAmount 사용한 포인트 수량
     * @dev hbtAmount = pointAmount * currentRate
     *      currentRate가 RATE_SCALE(10^8) 단위이므로 결과는 raw units
     */
    function mint(address to, uint256 pointAmount) external onlyRole(MINTER_ROLE) nonReentrant {
        if (pointAmount == 0) revert ZeroAmount();

        uint256 hbtAmount = pointAmount * currentRate;

        // 채굴 풀 한도 체크
        if (totalMintedFromMining + hbtAmount > MINING_POOL) {
            revert ExceedsMiningPool();
        }

        // 일일 한도 체크
        uint256 today = block.timestamp / 86400;

        if (globalDailyMinted[today] + hbtAmount > GLOBAL_DAILY_CAP) {
            revert ExceedsGlobalDailyCap();
        }
        if (userDailyMinted[to][today] + hbtAmount > USER_DAILY_CAP) {
            revert ExceedsUserDailyCap();
        }

        // 상태 업데이트
        totalMintedFromMining += hbtAmount;
        globalDailyMinted[today] += hbtAmount;
        userDailyMinted[to][today] += hbtAmount;

        _mint(to, hbtAmount);

        (uint256 phase, ) = getCurrentPhase();
        emit HabitMined(to, pointAmount, hbtAmount, phase);
    }

    // ============ 비율 업데이트 (Rate Update) ============

    /**
     * @notice 교환 비율 갱신 (오프체인 난이도 조절 후 호출)
     * @param newRate 새로운 비율 (RATE_SCALE 단위, 예: 1.5 HBT/P → 150000000)
     * @dev 온체인 검증:
     *      - 비율 > 0
     *      - 비율 ≤ MAX_RATE (4 HBT/P)
     *      - 변동폭: 현재의 0.5x ~ 2.0x 이내
     */
    function updateRate(uint256 newRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newRate == 0) revert InvalidRate();
        if (newRate > MAX_RATE) revert RateExceedsMaxCap();

        // Smoothing: 최대 2배 상승, 최소 절반 하락
        if (newRate > currentRate * 2) revert RateChangeExceedsLimit();
        if (newRate * 2 < currentRate) revert RateChangeExceedsLimit();

        uint256 oldRate = currentRate;
        currentRate = newRate;
        lastRateUpdate = block.timestamp;

        emit RateUpdated(oldRate, newRate, block.timestamp);
    }

    // ============ 챌린지 스테이킹 ============

    /**
     * @notice 챌린지 참여를 위한 HBT 예치
     * @param amount 예치할 HBT (raw units)
     * @dev 유저가 직접 호출. 누적 예치 가능 (여러 챌린지).
     *      resolveChallenge 시 전체 예치금에 대해 판정됨.
     */
    function stakeForChallenge(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (balanceOf(msg.sender) < amount) revert InsufficientBalance();

        _transfer(msg.sender, address(this), amount);
        challengeStakes[msg.sender] += amount;
        totalActiveStakes += amount;
        totalChallengeStaked += amount;

        emit ChallengeStaked(msg.sender, amount);
    }

    /**
     * @notice 챌린지 결과 판정 및 정산 (서버가 호출)
     * @param user 사용자 주소
     * @param isSuccess true: 성공(100% 반환), false: 실패(50% 반환 + 50% 소각)
     * @dev 성공 보너스는 오프체인에서 P로 지급 후 mint()로 별도 발행
     */
    function resolveChallenge(address user, bool isSuccess) external onlyRole(MINTER_ROLE) nonReentrant {
        uint256 staked = challengeStakes[user];
        if (staked == 0) revert NoStakeFound();

        // 상태 선 갱신 (Checks-Effects-Interactions)
        challengeStakes[user] = 0;
        totalActiveStakes -= staked;

        if (isSuccess) {
            _transfer(address(this), user, staked);
            totalChallengeReturned += staked;
            emit ChallengeResolved(user, staked, 0, true);
        } else {
            uint256 burnAmount = staked / 2;
            uint256 returnAmount = staked - burnAmount;

            _transfer(address(this), user, returnAmount);
            _burn(address(this), burnAmount);
            // totalBurned는 _update 오버라이드에서 자동 추적

            totalChallengeSlashed += burnAmount;
            totalChallengeReturned += returnAmount;

            emit ChallengeResolved(user, returnAmount, burnAmount, false);
        }
    }

    // ============ 조회 함수 ============

    /**
     * @notice 전체 토큰 통계 조회
     */
    function getTokenStats() external view returns (
        uint256 _totalSupply,
        uint256 _totalMined,
        uint256 _totalBurned,
        uint256 _currentRate,
        uint256 _currentPhase,
        uint256 _weeklyTarget,
        uint256 _remainingInPool,
        uint256 _totalStaked,
        uint256 _totalSlashed
    ) {
        (_currentPhase, _weeklyTarget) = getCurrentPhase();
        _totalSupply = totalSupply();
        _totalMined = totalMintedFromMining;
        _totalBurned = totalBurned;
        _currentRate = currentRate;
        _remainingInPool = MINING_POOL > totalMintedFromMining
            ? MINING_POOL - totalMintedFromMining
            : 0;
        _totalStaked = totalActiveStakes;
        _totalSlashed = totalChallengeSlashed;
    }

    /**
     * @notice 특정 유저의 오늘 민팅 가능 잔여량 조회
     */
    function getUserDailyRemaining(address user) external view returns (uint256) {
        uint256 today = block.timestamp / 86400;
        uint256 used = userDailyMinted[user][today];
        return used >= USER_DAILY_CAP ? 0 : USER_DAILY_CAP - used;
    }

    /**
     * @notice 오늘 글로벌 민팅 가능 잔여량 조회
     */
    function getGlobalDailyRemaining() external view returns (uint256) {
        uint256 today = block.timestamp / 86400;
        uint256 used = globalDailyMinted[today];
        return used >= GLOBAL_DAILY_CAP ? 0 : GLOBAL_DAILY_CAP - used;
    }
}
