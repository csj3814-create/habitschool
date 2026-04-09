/**
 * BSC testnet dress rehearsal for the HaBit mainnet launch flow.
 *
 * This script intentionally deploys fresh testnet contracts and validates:
 * 1) deployer deployment flow
 * 2) reserve mint destination wiring
 * 3) server minter role grants
 * 4) HBT mint
 * 5) staking success settlement
 * 6) staking failure settlement
 *
 * Required env:
 * - DEPLOYER_PRIVATE_KEY
 * - SERVER_MINTER_ADDRESS
 * - SERVER_MINTER_PRIVATE_KEY
 *
 * Optional env:
 * - TESTNET_RESERVE_ADDRESS
 * - DRESS_REHEARSAL_REPORT_PATH
 *
 * Usage:
 *   SERVER_MINTER_PRIVATE_KEY=0x... npx hardhat run scripts/dress-rehearsal.js --network bscTestnet
 */

const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const {
  getChainConfig,
  requireEnvAddress,
  optionalEnvAddress,
  logExplorerLinks,
} = require("./_helpers");

const HBT_DECIMALS = 8;
const SUCCESS_STAKE_HBT = "120";
const FAILURE_STAKE_HBT = "100";
const USER_GAS_FUND = "0.003";
const MINTER_GAS_FUND = "0.01";

function requireEnvValue(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function createEphemeralWallet() {
  return ethers.Wallet.createRandom();
}

async function waitForCondition(label, fn, timeoutMs = 45000, intervalMs = 2500) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await fn();
    if (lastValue) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${label} did not converge before timeout.`);
}

async function fundWalletIfNeeded(sender, recipient, minimumWei, targetWei) {
  const current = await sender.provider.getBalance(recipient);
  if (current >= minimumWei) {
    return null;
  }
  const amount = targetWei > current ? targetWei - current : minimumWei;
  const tx = await sender.sendTransaction({
    to: recipient,
    value: amount,
  });
  await tx.wait();
  return tx.hash;
}

async function main() {
  if (hre.network.name !== "bscTestnet") {
    throw new Error("Dress rehearsal is only allowed on bscTestnet.");
  }

  const chain = getChainConfig(hre.network.name);
  const [deployer] = await ethers.getSigners();
  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  const reserveAddress = optionalEnvAddress("TESTNET_RESERVE_ADDRESS") || createEphemeralWallet().address;
  const serverMinterAddress = requireEnvAddress("SERVER_MINTER_ADDRESS");
  const serverMinterKey = requireEnvValue("SERVER_MINTER_PRIVATE_KEY");
  const serverMinter = new ethers.Wallet(serverMinterKey, ethers.provider);

  if (serverMinter.address.toLowerCase() !== serverMinterAddress.toLowerCase()) {
    throw new Error("SERVER_MINTER_PRIVATE_KEY does not match SERVER_MINTER_ADDRESS.");
  }

  console.log("========================================");
  console.log("BSC testnet dress rehearsal");
  console.log("========================================");
  console.log(`Network:          ${chain.label}`);
  console.log(`Deployer:         ${deployer.address}`);
  console.log(`Reserve address:  ${reserveAddress}`);
  console.log(`Server minter:    ${serverMinter.address}`);
  console.log(`Deployer balance: ${ethers.formatEther(deployerBalance)} ${chain.gasToken}`);
  console.log("----------------------------------------");

  const minterFundTx = await fundWalletIfNeeded(
    deployer,
    serverMinter.address,
    ethers.parseEther("0.002"),
    ethers.parseEther(MINTER_GAS_FUND)
  );
  if (minterFundTx) {
    console.log(`Funded server minter gas: ${minterFundTx}`);
  }

  const HaBit = await ethers.getContractFactory("HaBit");
  const habit = await HaBit.deploy(reserveAddress);
  await habit.waitForDeployment();
  const habitAddress = await habit.getAddress();

  const HaBitStaking = await ethers.getContractFactory("HaBitStaking");
  const staking = await HaBitStaking.deploy(habitAddress);
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();

  console.log(`HaBit deployed:       ${habitAddress}`);
  console.log(`HaBitStaking deployed:${stakingAddress}`);

  const reserveBalance = await habit.balanceOf(reserveAddress);
  if (reserveBalance !== (await habit.RESERVE())) {
    throw new Error("Reserve balance does not match the expected premint amount.");
  }

  const MINTER_ROLE = await habit.MINTER_ROLE();
  const RATE_UPDATER_ROLE = await habit.RATE_UPDATER_ROLE();

  await (await habit.grantRole(MINTER_ROLE, serverMinter.address)).wait();
  await (await habit.grantRole(RATE_UPDATER_ROLE, serverMinter.address)).wait();
  await (await staking.setOperator(serverMinter.address, true)).wait();

  const hasMinterRole = await habit.hasRole(MINTER_ROLE, serverMinter.address);
  const hasRateUpdaterRole = await habit.hasRole(RATE_UPDATER_ROLE, serverMinter.address);
  const hasStakingOperator = await staking.operators(serverMinter.address);
  if (!hasMinterRole || !hasRateUpdaterRole || !hasStakingOperator) {
    throw new Error("Server minter roles were not granted correctly.");
  }

  const rehearsalUsers = [createEphemeralWallet().connect(ethers.provider), createEphemeralWallet().connect(ethers.provider)];
  const gasFundHashes = [];
  const successStakeRaw = ethers.parseUnits(SUCCESS_STAKE_HBT, HBT_DECIMALS);
  const failureStakeRaw = ethers.parseUnits(FAILURE_STAKE_HBT, HBT_DECIMALS);

  for (const wallet of rehearsalUsers) {
    const fundTx = await fundWalletIfNeeded(
      deployer,
      wallet.address,
      ethers.parseEther("0.001"),
      ethers.parseEther(USER_GAS_FUND)
    );
    if (fundTx) {
      gasFundHashes.push({ wallet: wallet.address, txHash: fundTx });
    }
  }

  const habitFromMinter = habit.connect(serverMinter);
  const stakingFromMinter = staking.connect(serverMinter);
  const mintPointAmount = 300n;

  const mintReceipts = [];
  for (const wallet of rehearsalUsers) {
    const tx = await habitFromMinter.mint(wallet.address, mintPointAmount);
    const receipt = await tx.wait();
    mintReceipts.push({ wallet: wallet.address, txHash: receipt.hash });
  }

  const habitUserA = habit.connect(rehearsalUsers[0]);
  const habitUserB = habit.connect(rehearsalUsers[1]);
  const stakingUserA = staking.connect(rehearsalUsers[0]);
  const stakingUserB = staking.connect(rehearsalUsers[1]);

  await (await habitUserA.approve(stakingAddress, successStakeRaw)).wait();
  await (await habitUserB.approve(stakingAddress, failureStakeRaw)).wait();

  const stakeSuccessTx = await stakingUserA.stakeForChallenge(successStakeRaw);
  const stakeSuccessReceipt = await stakeSuccessTx.wait();
  const stakeFailureTx = await stakingUserB.stakeForChallenge(failureStakeRaw);
  const stakeFailureReceipt = await stakeFailureTx.wait();

  const balanceAfterStakeA = await habit.balanceOf(rehearsalUsers[0].address);
  const balanceAfterStakeB = await habit.balanceOf(rehearsalUsers[1].address);

  const resolveSuccessTx = await stakingFromMinter.resolveChallenge(rehearsalUsers[0].address, true);
  const resolveSuccessReceipt = await resolveSuccessTx.wait();
  const resolveFailureTx = await stakingFromMinter.resolveChallenge(rehearsalUsers[1].address, false);
  const resolveFailureReceipt = await resolveFailureTx.wait();
  const expectedMintRaw = mintPointAmount * (await habit.currentRate());

  await waitForCondition("success settlement state", async () => {
    const [stakeA, balanceA] = await Promise.all([
      staking.challengeStakes(rehearsalUsers[0].address),
      habit.balanceOf(rehearsalUsers[0].address),
    ]);
    return stakeA === 0n && balanceA === expectedMintRaw;
  });

  await waitForCondition("failure settlement state", async () => {
    const [stakeB, balanceB] = await Promise.all([
      staking.challengeStakes(rehearsalUsers[1].address),
      habit.balanceOf(rehearsalUsers[1].address),
    ]);
    return stakeB === 0n && balanceB === expectedMintRaw - (failureStakeRaw / 2n);
  });

  const finalBalanceA = await habit.balanceOf(rehearsalUsers[0].address);
  const finalBalanceB = await habit.balanceOf(rehearsalUsers[1].address);

  const report = {
    generatedAt: new Date().toISOString(),
    network: hre.network.name,
    chain: chain.label,
    deployer: deployer.address,
    reserveAddress,
    serverMinter: serverMinter.address,
    contracts: {
      HaBit: habitAddress,
      HaBitStaking: stakingAddress,
    },
    roleVerification: {
      hasMinterRole,
      hasRateUpdaterRole,
      hasStakingOperator,
    },
    funding: {
      serverMinterGasFundTx: minterFundTx,
      rehearsalUserGasFunds: gasFundHashes,
    },
    minting: mintReceipts,
    stakeFlow: {
      successUser: rehearsalUsers[0].address,
      failureUser: rehearsalUsers[1].address,
      successStakeHbt: SUCCESS_STAKE_HBT,
      failureStakeHbt: FAILURE_STAKE_HBT,
      successStakeTxHash: stakeSuccessReceipt.hash,
      failureStakeTxHash: stakeFailureReceipt.hash,
      successResolveTxHash: resolveSuccessReceipt.hash,
      failureResolveTxHash: resolveFailureReceipt.hash,
    },
    balances: {
      mintedHbtPerUser: ethers.formatUnits(expectedMintRaw, HBT_DECIMALS),
      userAPostStakeHbt: ethers.formatUnits(balanceAfterStakeA, HBT_DECIMALS),
      userBPostStakeHbt: ethers.formatUnits(balanceAfterStakeB, HBT_DECIMALS),
      userASuccessFinalHbt: ethers.formatUnits(finalBalanceA, HBT_DECIMALS),
      userBFailureFinalHbt: ethers.formatUnits(finalBalanceB, HBT_DECIMALS),
    },
  };

  const reportPath =
    process.env.DRESS_REHEARSAL_REPORT_PATH ||
    path.join(__dirname, "..", `dress-rehearsal-${hre.network.name}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (balanceAfterStakeA !== expectedMintRaw - successStakeRaw) {
    throw new Error(
      `User A post-stake balance mismatch. expected=${ethers.formatUnits(expectedMintRaw - successStakeRaw, HBT_DECIMALS)} actual=${ethers.formatUnits(balanceAfterStakeA, HBT_DECIMALS)} report=${reportPath}`
    );
  }
  if (balanceAfterStakeB !== expectedMintRaw - failureStakeRaw) {
    throw new Error(
      `User B post-stake balance mismatch. expected=${ethers.formatUnits(expectedMintRaw - failureStakeRaw, HBT_DECIMALS)} actual=${ethers.formatUnits(balanceAfterStakeB, HBT_DECIMALS)} report=${reportPath}`
    );
  }
  if (finalBalanceA !== expectedMintRaw) {
    throw new Error(
      `User A success settlement mismatch. expected=${ethers.formatUnits(expectedMintRaw, HBT_DECIMALS)} actual=${ethers.formatUnits(finalBalanceA, HBT_DECIMALS)} report=${reportPath}`
    );
  }
  if (finalBalanceB !== expectedMintRaw - (failureStakeRaw / 2n)) {
    throw new Error(
      `User B failure settlement mismatch. expected=${ethers.formatUnits(expectedMintRaw - (failureStakeRaw / 2n), HBT_DECIMALS)} actual=${ethers.formatUnits(finalBalanceB, HBT_DECIMALS)} report=${reportPath}`
    );
  }

  console.log("\nExplorer links");
  logExplorerLinks(chain.explorer, {
    HaBit: habitAddress,
    HaBitStaking: stakingAddress,
    ServerMinter: serverMinter.address,
    SuccessUser: rehearsalUsers[0].address,
    FailureUser: rehearsalUsers[1].address,
  });

  console.log("\nResult");
  console.log(`Report: ${reportPath}`);
  console.log("Mint -> stake -> success settle -> fail settle rehearsal completed.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Dress rehearsal failed:", error);
    process.exit(1);
  });
