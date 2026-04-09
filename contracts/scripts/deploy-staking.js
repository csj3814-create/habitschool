/**
 * Deploy only HaBitStaking for an existing HaBit token deployment.
 *
 * Required env:
 * - HABIT_TOKEN_ADDRESS
 *
 * Optional env:
 * - SERVER_MINTER_ADDRESS
 */

const hre = require("hardhat");
const {
  getChainConfig,
  requireEnvAddress,
  optionalEnvAddress,
  logExplorerLinks,
  writeDeployments,
} = require("./_helpers");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const chain = getChainConfig(hre.network.name);
  const habitAddress = requireEnvAddress("HABIT_TOKEN_ADDRESS");
  const serverMinter = optionalEnvAddress("SERVER_MINTER_ADDRESS");

  console.log("========================================");
  console.log("Deploy HaBitStaking only");
  console.log("========================================");
  console.log(`Network:       ${chain.label}`);
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`HaBit:         ${habitAddress}`);
  console.log(`Server minter: ${serverMinter || "(skip role setup)"}`);
  console.log("----------------------------------------");

  const HaBitStaking = await hre.ethers.getContractFactory("HaBitStaking");
  const staking = await HaBitStaking.deploy(habitAddress);
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();

  if (serverMinter) {
    await (await staking.setOperator(serverMinter, true)).wait();
  }

  const deployment = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    label: chain.label,
    explorer: chain.explorer,
    gasToken: chain.gasToken,
    deployer: deployer.address,
    reserveMultisig: null,
    serverMinter,
    contracts: {
      HaBit: habitAddress,
      HaBitStaking: stakingAddress,
    },
    deployedAt: new Date().toISOString(),
    note: "staking-only deployment",
  };

  const deploymentPath = writeDeployments(hre.network.name, deployment);

  console.log(`HaBitStaking deployed: ${stakingAddress}`);
  console.log(`Deployment file:       ${deploymentPath}`);
  console.log("\nExplorer links");
  logExplorerLinks(chain.explorer, deployment.contracts);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Staking deployment failed:", error);
    process.exit(1);
  });
