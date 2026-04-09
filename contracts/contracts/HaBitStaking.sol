// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./HaBit.sol";

/**
 * @title HaBitStaking
 * @notice Challenge staking custody contract for weekly/master flows.
 *
 * Mainnet target split:
 * - HaBit.sol: token, minting, rate updates
 * - HaBitStaking.sol: stake custody, principal return, slash handling
 *
 * Legacy operator-driven functions are kept for backward compatibility with
 * older off-chain challenge bookkeeping. New runtime paths should prefer
 * stakeForChallenge() + resolveChallenge().
 */
contract HaBitStaking is Ownable, ReentrancyGuard {
    HaBit public immutable hbtToken;

    struct Challenge {
        address user;
        string challengeId;
        uint256 stakedAmount;
        uint256 startTime;
        uint256 endTime;
        uint8 totalDays;
        uint8 completedDays;
        bool settled;
    }

    // Legacy operator-driven challenge state.
    // tier: 0 = mini, 1 = weekly, 2 = master
    mapping(address => mapping(uint8 => Challenge)) public activeChallenges;

    // Mainnet target path: direct user deposits tracked by wallet.
    mapping(address => uint256) public challengeStakes;

    // Aggregate stats.
    uint256 public totalStaked;
    uint256 public totalSlashed;
    uint256 public totalReturned;
    uint256 public challengeCount;
    uint256 public totalActiveStakes;

    mapping(address => bool) public operators;

    event ChallengeStarted(address indexed user, string challengeId, uint8 tier, uint256 staked);
    event ChallengeSettled(address indexed user, string challengeId, uint8 completedDays, uint8 totalDays, uint256 reward);
    event ChallengeSlashed(address indexed user, string challengeId, uint256 burned, uint256 returned);
    event ChallengeStaked(address indexed user, uint256 amount);
    event ChallengeResolved(address indexed user, uint256 returnedAmount, uint256 burnedAmount, bool success);

    error NotOperator();
    error ChallengeAlreadyActive();
    error NoChallengeActive();
    error AlreadySettled();
    error InsufficientStake();
    error ZeroAmount();
    error NoStakeFound();
    error InsufficientBalance();

    modifier onlyOperator() {
        if (!operators[msg.sender] && msg.sender != owner()) {
            revert NotOperator();
        }
        _;
    }

    constructor(address hbtTokenAddress) Ownable(msg.sender) {
        require(hbtTokenAddress != address(0), "invalid token");
        hbtToken = HaBit(hbtTokenAddress);
    }

    /**
     * @notice Mainnet target flow: user deposits HBT after ERC20 approve().
     */
    function stakeForChallenge(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (hbtToken.balanceOf(msg.sender) < amount) revert InsufficientBalance();

        hbtToken.transferFrom(msg.sender, address(this), amount);
        challengeStakes[msg.sender] += amount;
        totalStaked += amount;
        totalActiveStakes += amount;

        emit ChallengeStaked(msg.sender, amount);
    }

    /**
     * @notice Mainnet target flow: operator settles a user's deposited stake.
     * @dev Success returns 100% principal. Failure returns 50% and burns 50%.
     */
    function resolveChallenge(address user, bool isSuccess) external onlyOperator nonReentrant {
        uint256 staked = challengeStakes[user];
        if (staked == 0) revert NoStakeFound();

        challengeStakes[user] = 0;
        totalActiveStakes -= staked;

        if (isSuccess) {
            hbtToken.transfer(user, staked);
            totalReturned += staked;
            emit ChallengeResolved(user, staked, 0, true);
            return;
        }

        uint256 burnAmount = staked / 2;
        uint256 returnAmount = staked - burnAmount;

        hbtToken.transfer(user, returnAmount);
        hbtToken.burn(burnAmount);

        totalSlashed += burnAmount;
        totalReturned += returnAmount;

        emit ChallengeResolved(user, returnAmount, burnAmount, false);
    }

    function getStakingStats() external view returns (
        uint256 activeStaked,
        uint256 cumulativeStaked,
        uint256 cumulativeSlashed,
        uint256 cumulativeReturned
    ) {
        return (totalActiveStakes, totalStaked, totalSlashed, totalReturned);
    }

    /**
     * @notice Legacy flow kept for compatibility with older challenge records.
     */
    function startChallenge(
        address user,
        string calldata challengeId,
        uint8 tier,
        uint8 totalDays,
        uint256 stakeAmount
    ) external onlyOperator nonReentrant {
        if (activeChallenges[user][tier].stakedAmount > 0 && !activeChallenges[user][tier].settled) {
            revert ChallengeAlreadyActive();
        }

        if (stakeAmount > 0) {
            hbtToken.transferFrom(user, address(this), stakeAmount);
            totalStaked += stakeAmount;
            totalActiveStakes += stakeAmount;
        }

        activeChallenges[user][tier] = Challenge({
            user: user,
            challengeId: challengeId,
            stakedAmount: stakeAmount,
            startTime: block.timestamp,
            endTime: block.timestamp + (uint256(totalDays) * 1 days),
            totalDays: totalDays,
            completedDays: 0,
            settled: false
        });

        challengeCount++;
        emit ChallengeStarted(user, challengeId, tier, stakeAmount);
    }

    function recordDay(address user, uint8 tier) external onlyOperator {
        Challenge storage challenge = activeChallenges[user][tier];
        if (challenge.settled || (challenge.stakedAmount == 0 && challenge.totalDays == 0)) {
            revert NoChallengeActive();
        }
        if (challenge.completedDays < challenge.totalDays) {
            challenge.completedDays++;
        }
    }

    /**
     * @notice Legacy settlement path kept for older operator workflows.
     * @dev Bonus minting is still expected to happen off-chain.
     */
    function settleChallenge(address user, uint8 tier) external onlyOperator nonReentrant {
        Challenge storage challenge = activeChallenges[user][tier];
        if (challenge.settled) revert AlreadySettled();
        if (challenge.totalDays == 0) revert NoChallengeActive();

        challenge.settled = true;
        uint256 staked = challenge.stakedAmount;

        if (staked == 0) {
            emit ChallengeSettled(user, challenge.challengeId, challenge.completedDays, challenge.totalDays, 0);
            return;
        }

        totalActiveStakes -= staked;

        uint256 successRate = (uint256(challenge.completedDays) * 100) / uint256(challenge.totalDays);

        if (successRate == 100) {
            hbtToken.transfer(user, staked);
            totalReturned += staked;
            emit ChallengeSettled(user, challenge.challengeId, challenge.completedDays, challenge.totalDays, staked);
            return;
        }

        if (successRate >= 80) {
            hbtToken.transfer(user, staked);
            totalReturned += staked;
            emit ChallengeSettled(user, challenge.challengeId, challenge.completedDays, challenge.totalDays, staked);
            return;
        }

        uint256 burnAmount = staked / 2;
        uint256 returnAmount = staked - burnAmount;

        hbtToken.transfer(user, returnAmount);
        hbtToken.burn(burnAmount);

        totalSlashed += burnAmount;
        totalReturned += returnAmount;

        emit ChallengeSlashed(user, challenge.challengeId, burnAmount, returnAmount);
    }

    function setOperator(address operator, bool authorized) external onlyOwner {
        operators[operator] = authorized;
    }

    function getChallenge(address user, uint8 tier) external view returns (
        string memory challengeId,
        uint256 stakedAmount,
        uint8 completedDays,
        uint8 totalDays,
        bool settled
    ) {
        Challenge storage challenge = activeChallenges[user][tier];
        return (
            challenge.challengeId,
            challenge.stakedAmount,
            challenge.completedDays,
            challenge.totalDays,
            challenge.settled
        );
    }
}
