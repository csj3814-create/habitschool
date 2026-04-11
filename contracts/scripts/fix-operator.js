/**
 * Emergency helper to toggle a staking operator without touching token roles.
 *
 * Required env:
 * - OPERATOR_ADDRESS
 *
 * Optional env:
 * - OPERATOR_ENABLED=true|false (default true)
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
  const operatorAddress = requireEnvAddress("OPERATOR_ADDRESS");
  const enabled = String(process.env.OPERATOR_ENABLED || "true").toLowerCase() !== "false";

  const HaBitStaking = await hre.ethers.getContractFactory("HaBitStaking");
  const staking = HaBitStaking.attach(deployments.contracts.HaBitStaking);

  console.log("========================================");
  console.log("Toggle staking operator");
  console.log("========================================");
  console.log(`Network:  ${chain.label}`);
  console.log(`Staking:  ${deployments.contracts.HaBitStaking}`);
  console.log(`Operator: ${operatorAddress}`);
  console.log(`Enabled:  ${enabled}`);
  console.log("----------------------------------------");

  await (await staking.setOperator(operatorAddress, enabled)).wait();
  const operatorState = await waitForExpectedValue(
    () => staking.operators(operatorAddress),
    (value) => value === enabled,
    `staking operator=${enabled}`,
  );
  console.log(`Result: ${operatorState}`);

  const tracksServerMinter =
    deployments.serverMinter &&
    deployments.serverMinter.toLowerCase() === operatorAddress.toLowerCase();

  const updatedDeployments = {
    ...deployments,
    serverRoles: {
      ...(deployments.serverRoles || {}),
      ...(tracksServerMinter ? { stakingOperatorEnabled: operatorState } : {}),
      updatedAt: new Date().toISOString(),
    },
    lastOperatorChange: {
      operatorAddress,
      enabled: operatorState,
      updatedAt: new Date().toISOString(),
    },
  };
  const deploymentPath = writeDeployments(hre.network.name, updatedDeployments);

  console.log("\nDeployment file");
  console.log(deploymentPath);

  console.log("\nExplorer links");
  logExplorerLinks(chain.explorer, {
    Operator: operatorAddress,
    HaBitStaking: deployments.contracts.HaBitStaking,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Operator toggle failed:", error);
    process.exit(1);
  });
