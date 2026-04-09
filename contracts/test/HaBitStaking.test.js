const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HaBitStaking", function () {
  let habit;
  let staking;
  let owner;
  let minter;
  let user1;
  let user2;
  let reserveWallet;

  const UNIT = 10n ** 8n;

  beforeEach(async function () {
    [owner, minter, user1, user2, reserveWallet] = await ethers.getSigners();

    const HaBit = await ethers.getContractFactory("HaBit");
    habit = await HaBit.deploy(reserveWallet.address);

    const MINTER_ROLE = await habit.MINTER_ROLE();
    await habit.grantRole(MINTER_ROLE, minter.address);

    const HaBitStaking = await ethers.getContractFactory("HaBitStaking");
    staking = await HaBitStaking.deploy(await habit.getAddress());
    await staking.setOperator(minter.address, true);

    await habit.connect(minter).mint(user1.address, 1000);
    await habit.connect(minter).mint(user2.address, 1000);
  });

  describe("direct staking path", function () {
    it("accepts approved deposits and tracks active stake", async function () {
      await habit.connect(user1).approve(await staking.getAddress(), 500n * UNIT);
      await staking.connect(user1).stakeForChallenge(500n * UNIT);

      expect(await staking.challengeStakes(user1.address)).to.equal(500n * UNIT);
      expect(await staking.totalActiveStakes()).to.equal(500n * UNIT);
      expect(await habit.balanceOf(user1.address)).to.equal(500n * UNIT);
    });

    it("returns principal on successful settlement", async function () {
      await habit.connect(user1).approve(await staking.getAddress(), 500n * UNIT);
      await staking.connect(user1).stakeForChallenge(500n * UNIT);

      await staking.connect(minter).resolveChallenge(user1.address, true);

      expect(await staking.challengeStakes(user1.address)).to.equal(0);
      expect(await staking.totalActiveStakes()).to.equal(0);
      expect(await habit.balanceOf(user1.address)).to.equal(1000n * UNIT);
      expect(await staking.totalReturned()).to.equal(500n * UNIT);
    });

    it("slashes 50 percent on failed settlement", async function () {
      await habit.connect(user1).approve(await staking.getAddress(), 500n * UNIT);
      await staking.connect(user1).stakeForChallenge(500n * UNIT);

      await staking.connect(minter).resolveChallenge(user1.address, false);

      expect(await staking.challengeStakes(user1.address)).to.equal(0);
      expect(await staking.totalActiveStakes()).to.equal(0);
      expect(await habit.balanceOf(user1.address)).to.equal(750n * UNIT);
      expect(await staking.totalSlashed()).to.equal(250n * UNIT);
      expect(await staking.totalReturned()).to.equal(250n * UNIT);
    });
  });

  describe("legacy operator path", function () {
    it("keeps legacy start/settle flow working", async function () {
      await habit.connect(user1).approve(await staking.getAddress(), 500n * UNIT);
      await staking.connect(minter).startChallenge(user1.address, "challenge-30d", 2, 30, 500n * UNIT);

      expect((await staking.getChallenge(user1.address, 2))[1]).to.equal(500n * UNIT);
      expect(await staking.totalActiveStakes()).to.equal(500n * UNIT);

      for (let i = 0; i < 30; i++) {
        await staking.connect(minter).recordDay(user1.address, 2);
      }

      await staking.connect(minter).settleChallenge(user1.address, 2);

      expect(await staking.totalActiveStakes()).to.equal(0);
      expect(await habit.balanceOf(user1.address)).to.equal(1000n * UNIT);
    });
  });
});
