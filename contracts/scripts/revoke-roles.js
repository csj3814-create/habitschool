/**
 * Revoke live server roles for the HaBit two-contract model.
 *
 * Required env:
 * - SERVER_MINTER_ADDRESS
 *
 * Usage:
 *   npx hardhat run scripts/revoke-roles.js --network bscTestnet
 *   npx hardhat run scripts/revoke-roles.js --network bsc
 */

const hre = require("hardhat");
const {
  getChainConfig,
  readDeployments,
  writeDeployments,
  requireEnvAddress,
  logExplorerLinks,
  waitForExpectedValue,
} = require("./_helpers");

async function main() {
  const chain = getChainConfig(hre.network.name);
  const deployments = readDeployments(hre.network.name);
  const serverMinter = requireEnvAddress("SERVER_MINTER_ADDRESS");

  const HaBit = await hre.ethers.getContractFactory("HaBit");
  const HaBitStaking = await hre.ethers.getContractFactory("HaBitStaking");

  const habit = HaBit.attach(deployments.contracts.HaBit);
  const staking = HaBitStaking.attach(deployments.contracts.HaBitStaking);

  const MINTER_ROLE = await habit.MINTER_ROLE();
  const RATE_UPDATER_ROLE = await habit.RATE_UPDATER_ROLE();

  console.log("========================================");
  console.log("Revoke server roles");
  console.log("========================================");
  console.log(`Network:       ${chain.label}`);
  console.log(`Server minter: ${serverMinter}`);
  console.log("----------------------------------------");

  if (await habit.hasRole(MINTER_ROLE, serverMinter)) {
    await (await habit.revokeRole(MINTER_ROLE, serverMinter)).wait();
    console.log("Revoked MINTER_ROLE");
  } else {
    console.log("MINTER_ROLE already absent");
  }

  if (await habit.hasRole(RATE_UPDATER_ROLE, serverMinter)) {
    await (await habit.revokeRole(RATE_UPDATER_ROLE, serverMinter)).wait();
    console.log("Revoked RATE_UPDATER_ROLE");
  } else {
    console.log("RATE_UPDATER_ROLE already absent");
  }

  if (await staking.operators(serverMinter)) {
    await (await staking.setOperator(serverMinter, false)).wait();
    console.log("Revoked staking operator");
  } else {
    console.log("Staking operator already absent");
  }

  const minterRoleGranted = await waitForExpectedValue(
    () => habit.hasRole(MINTER_ROLE, serverMinter),
    (value) => value === false,
    "MINTER_ROLE revoke",
  );
  const rateUpdaterRoleGranted = await waitForExpectedValue(
    () => habit.hasRole(RATE_UPDATER_ROLE, serverMinter),
    (value) => value === false,
    "RATE_UPDATER_ROLE revoke",
  );
  const stakingOperatorEnabled = await waitForExpectedValue(
    () => staking.operators(serverMinter),
    (value) => value === false,
    "staking operator revoke",
  );

  console.log("\nVerification");
  console.log(`MINTER_ROLE:       ${minterRoleGranted}`);
  console.log(`RATE_UPDATER_ROLE: ${rateUpdaterRoleGranted}`);
  console.log(`STAKING_OPERATOR:  ${stakingOperatorEnabled}`);

  const updatedDeployments = {
    ...deployments,
    serverMinter,
    serverRoles: {
      ...(deployments.serverRoles || {}),
      minterRoleGranted,
      rateUpdaterRoleGranted,
      stakingOperatorEnabled,
      updatedAt: new Date().toISOString(),
    },
  };
  const deploymentPath = writeDeployments(hre.network.name, updatedDeployments);

  console.log("\nDeployment file");
  console.log(deploymentPath);

  console.log("\nExplorer links");
  logExplorerLinks(chain.explorer, {
    ServerMinter: serverMinter,
    HaBit: deployments.contracts.HaBit,
    HaBitStaking: deployments.contracts.HaBitStaking,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Revoke roles failed:", error);
    process.exit(1);
  });
