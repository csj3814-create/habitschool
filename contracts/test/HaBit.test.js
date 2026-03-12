const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HaBit v2", function () {
  let habit, owner, minter, user1, user2, reserveWallet;
  const UNIT = 10n ** 8n;
  const RATE_SCALE = UNIT;

  beforeEach(async function () {
    [owner, minter, user1, user2, reserveWallet] = await ethers.getSigners();

    const HaBit = await ethers.getContractFactory("HaBit");
    habit = await HaBit.deploy(reserveWallet.address);

    // minter 역할 부여
    const MINTER_ROLE = await habit.MINTER_ROLE();
    await habit.grantRole(MINTER_ROLE, minter.address);
  });

  // ============ 배포 & 초기 상태 ============

  describe("Deployment", function () {
    it("리저브 30M이 프리민트됨", async function () {
      const balance = await habit.balanceOf(reserveWallet.address);
      expect(balance).to.equal(30_000_000n * UNIT);
    });

    it("초기 비율 1P = 1 HBT", async function () {
      expect(await habit.currentRate()).to.equal(1n * RATE_SCALE);
    });

    it("MAX_SUPPLY = 1억 HBT", async function () {
      expect(await habit.MAX_SUPPLY()).to.equal(100_000_000n * UNIT);
    });

    it("MINING_POOL = 7천만 HBT", async function () {
      expect(await habit.MINING_POOL()).to.equal(70_000_000n * UNIT);
    });

    it("totalSupply = 30M (리저브만)", async function () {
      expect(await habit.totalSupply()).to.equal(30_000_000n * UNIT);
    });

    it("decimals = 8", async function () {
      expect(await habit.decimals()).to.equal(8);
    });
  });

  // ============ 채굴 (mint) ============

  describe("Mining (mint)", function () {
    it("MINTER_ROLE이 포인트로 HBT 채굴 가능", async function () {
      // 100P → 100 HBT (rate = 1.0)
      await habit.connect(minter).mint(user1.address, 100);
      expect(await habit.balanceOf(user1.address)).to.equal(100n * UNIT);
      expect(await habit.totalMintedFromMining()).to.equal(100n * UNIT);
    });

    it("민터 아닌 주소는 mint 불가", async function () {
      await expect(
        habit.connect(user1).mint(user1.address, 100)
      ).to.be.reverted;
    });

    it("0 포인트 민팅 거부", async function () {
      await expect(
        habit.connect(minter).mint(user1.address, 0)
      ).to.be.revertedWithCustomError(habit, "ZeroAmount");
    });

    it("채굴 풀 초과 시 revert", async function () {
      // currentRate = 1*UNIT이므로 pointAmount * currentRate = pointAmount * UNIT
      // MINING_POOL = 70M * UNIT → pointAmount = 70M + 1
      await expect(
        habit.connect(minter).mint(user1.address, 70_000_001)
      ).to.be.revertedWithCustomError(habit, "ExceedsMiningPool");
    });
  });

  // ============ 일일 한도 (Daily Cap) ============

  describe("Daily Caps", function () {
    it("유저별 일일 한도 초과 시 revert", async function () {
      // USER_DAILY_CAP = 20,000 * UNIT → pointAmount = 20,001
      await expect(
        habit.connect(minter).mint(user1.address, 20_001)
      ).to.be.revertedWithCustomError(habit, "ExceedsUserDailyCap");
    });

    it("글로벌 일일 한도 내에서 여러 유저 가능", async function () {
      await habit.connect(minter).mint(user1.address, 10_000);
      await habit.connect(minter).mint(user2.address, 10_000);
      expect(await habit.balanceOf(user1.address)).to.equal(10_000n * UNIT);
      expect(await habit.balanceOf(user2.address)).to.equal(10_000n * UNIT);
    });

    it("getUserDailyRemaining 정확히 반환", async function () {
      await habit.connect(minter).mint(user1.address, 5_000);
      const remaining = await habit.getUserDailyRemaining(user1.address);
      expect(remaining).to.equal(15_000n * UNIT);
    });
  });

  // ============ 비율 업데이트 (updateRate) ============

  describe("Rate Update", function () {
    it("ADMIN이 비율 업데이트 가능", async function () {
      const newRate = 2n * RATE_SCALE; // 1P = 2 HBT
      await habit.updateRate(newRate);
      expect(await habit.currentRate()).to.equal(newRate);
    });

    it("비율 업데이트 후 채굴량 변경됨", async function () {
      await habit.updateRate(2n * RATE_SCALE); // 1P = 2 HBT
      await habit.connect(minter).mint(user1.address, 100);
      expect(await habit.balanceOf(user1.address)).to.equal(200n * UNIT);
    });

    it("MAX_RATE(4.0) 초과 revert", async function () {
      const overMax = 5n * RATE_SCALE;
      await expect(
        habit.updateRate(overMax)
      ).to.be.revertedWithCustomError(habit, "RateExceedsMaxCap");
    });

    it("2배 초과 상승 revert (smoothing)", async function () {
      // 현재 1.0 → 2.5로 상승 시도 (2.5x > 2.0x)
      const tooHigh = (25n * RATE_SCALE) / 10n;
      await expect(
        habit.updateRate(tooHigh)
      ).to.be.revertedWithCustomError(habit, "RateChangeExceedsLimit");
    });

    it("절반 미만 하락 revert (smoothing)", async function () {
      // 현재 1.0 → 0.4로 하락 시도 (0.4x < 0.5x)  
      const tooLow = (4n * RATE_SCALE) / 10n;
      await expect(
        habit.updateRate(tooLow)
      ).to.be.revertedWithCustomError(habit, "RateChangeExceedsLimit");
    });

    it("정확히 2배 상승은 허용", async function () {
      await habit.updateRate(2n * RATE_SCALE);
      expect(await habit.currentRate()).to.equal(2n * RATE_SCALE);
    });

    it("정확히 절반 하락은 허용", async function () {
      await habit.updateRate(RATE_SCALE / 2n);
      expect(await habit.currentRate()).to.equal(RATE_SCALE / 2n);
    });

    it("0 비율 revert", async function () {
      await expect(
        habit.updateRate(0)
      ).to.be.revertedWithCustomError(habit, "InvalidRate");
    });

    it("ADMIN 아닌 주소 revert", async function () {
      await expect(
        habit.connect(user1).updateRate(2n * RATE_SCALE)
      ).to.be.reverted;
    });
  });

  // ============ Phase 로직 ============

  describe("Phase Logic", function () {
    it("초기 Phase = 1, weeklyTarget = 140,000", async function () {
      const [phase, weeklyTarget] = await habit.getCurrentPhase();
      expect(phase).to.equal(1);
      expect(weeklyTarget).to.equal(140_000n * UNIT);
    });
  });

  // ============ 챌린지 스테이킹 ============

  describe("Challenge Staking", function () {
    beforeEach(async function () {
      // user1에게 1000 HBT 채굴해 줌
      await habit.connect(minter).mint(user1.address, 1000);
    });

    it("스테이킹 성공", async function () {
      await habit.connect(user1).stakeForChallenge(500n * UNIT);
      expect(await habit.challengeStakes(user1.address)).to.equal(500n * UNIT);
      expect(await habit.balanceOf(user1.address)).to.equal(500n * UNIT);
      expect(await habit.totalActiveStakes()).to.equal(500n * UNIT);
    });

    it("잔액 부족 시 스테이킹 revert", async function () {
      await expect(
        habit.connect(user1).stakeForChallenge(2000n * UNIT)
      ).to.be.revertedWithCustomError(habit, "InsufficientBalance");
    });

    it("0 금액 스테이킹 revert", async function () {
      await expect(
        habit.connect(user1).stakeForChallenge(0)
      ).to.be.revertedWithCustomError(habit, "ZeroAmount");
    });

    it("챌린지 성공 → 100% 반환", async function () {
      await habit.connect(user1).stakeForChallenge(500n * UNIT);
      await habit.connect(minter).resolveChallenge(user1.address, true);

      expect(await habit.balanceOf(user1.address)).to.equal(1000n * UNIT);
      expect(await habit.challengeStakes(user1.address)).to.equal(0);
      expect(await habit.totalActiveStakes()).to.equal(0);
      expect(await habit.totalChallengeReturned()).to.equal(500n * UNIT);
    });

    it("챌린지 실패 → 50% 반환, 50% 소각", async function () {
      await habit.connect(user1).stakeForChallenge(500n * UNIT);
      await habit.connect(minter).resolveChallenge(user1.address, false);

      // 500 staked → 250 returned, 250 burned
      expect(await habit.balanceOf(user1.address)).to.equal(750n * UNIT);
      expect(await habit.challengeStakes(user1.address)).to.equal(0);
      expect(await habit.totalChallengeSlashed()).to.equal(250n * UNIT);
      expect(await habit.totalChallengeReturned()).to.equal(250n * UNIT);
      expect(await habit.totalBurned()).to.equal(250n * UNIT);
    });

    it("스테이킹 없는 유저 resolve 시 revert", async function () {
      await expect(
        habit.connect(minter).resolveChallenge(user2.address, true)
      ).to.be.revertedWithCustomError(habit, "NoStakeFound");
    });

    it("MINTER가 아닌 주소 resolve 시 revert", async function () {
      await habit.connect(user1).stakeForChallenge(500n * UNIT);
      await expect(
        habit.connect(user1).resolveChallenge(user1.address, true)
      ).to.be.reverted;
    });
  });

  // ============ 소각 (ERC20Burnable) ============

  describe("Burn", function () {
    it("유저가 직접 소각 가능", async function () {
      await habit.connect(minter).mint(user1.address, 100);
      await habit.connect(user1).burn(50n * UNIT);
      expect(await habit.balanceOf(user1.address)).to.equal(50n * UNIT);
      expect(await habit.totalBurned()).to.equal(50n * UNIT);
    });
  });

  // ============ 통계 조회 ============

  describe("Token Stats", function () {
    it("getTokenStats 반환값 정확", async function () {
      await habit.connect(minter).mint(user1.address, 1000);

      const stats = await habit.getTokenStats();
      expect(stats._totalMined).to.equal(1000n * UNIT);
      expect(stats._currentRate).to.equal(1n * RATE_SCALE);
      expect(stats._currentPhase).to.equal(1);
      expect(stats._remainingInPool).to.equal(
        70_000_000n * UNIT - 1000n * UNIT
      );
    });
  });
});
