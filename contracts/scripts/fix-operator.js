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
  requireEnvAddress,
  logExplorerLinks,
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
  console.log(`Result: ${await staking.operators(operatorAddress)}`);

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
