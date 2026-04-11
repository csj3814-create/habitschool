/**
 * Grant live server roles for the HaBit two-contract model.
 *
 * Required env:
 * - SERVER_MINTER_ADDRESS
 *
 * Usage:
 *   npx hardhat run scripts/setup-minter.js --network bscTestnet
 *   npx hardhat run scripts/setup-minter.js --network bsc
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
  console.log("Grant server roles");
  console.log("========================================");
  console.log(`Network:       ${chain.label}`);
  console.log(`Server minter: ${serverMinter}`);
  console.log(`HaBit:         ${deployments.contracts.HaBit}`);
  console.log(`HaBitStaking:  ${deployments.contracts.HaBitStaking}`);
  console.log("----------------------------------------");

  if (!(await habit.hasRole(MINTER_ROLE, serverMinter))) {
    await (await habit.grantRole(MINTER_ROLE, serverMinter)).wait();
    console.log("Granted MINTER_ROLE");
  } else {
    console.log("MINTER_ROLE already granted");
  }

  if (!(await habit.hasRole(RATE_UPDATER_ROLE, serverMinter))) {
    await (await habit.grantRole(RATE_UPDATER_ROLE, serverMinter)).wait();
    console.log("Granted RATE_UPDATER_ROLE");
  } else {
    console.log("RATE_UPDATER_ROLE already granted");
  }

  if (!(await staking.operators(serverMinter))) {
    await (await staking.setOperator(serverMinter, true)).wait();
    console.log("Granted staking operator");
  } else {
    console.log("Staking operator already granted");
  }

  const minterRoleGranted = await waitForExpectedValue(
    () => habit.hasRole(MINTER_ROLE, serverMinter),
    (value) => value === true,
    "MINTER_ROLE grant",
  );
  const rateUpdaterRoleGranted = await waitForExpectedValue(
    () => habit.hasRole(RATE_UPDATER_ROLE, serverMinter),
    (value) => value === true,
    "RATE_UPDATER_ROLE grant",
  );
  const stakingOperatorEnabled = await waitForExpectedValue(
    () => staking.operators(serverMinter),
    (value) => value === true,
    "staking operator grant",
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
    console.error("Grant roles failed:", error);
    process.exit(1);
  });
