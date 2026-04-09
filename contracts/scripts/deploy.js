/**
 * Canonical BSC deployment script for the HaBit two-contract model.
 *
 * Required env:
 * - DEPLOYER_PRIVATE_KEY
 * - RESERVE_MULTISIG_ADDRESS
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network bscTestnet
 *   npx hardhat run scripts/deploy.js --network bsc
 */

const hre = require("hardhat");
const {
  getChainConfig,
  writeDeployments,
  requireEnvAddress,
  logExplorerLinks,
} = require("./_helpers");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const chain = getChainConfig(hre.network.name);
  const reserveMultisig = requireEnvAddress("RESERVE_MULTISIG_ADDRESS");

  console.log("========================================");
  console.log("HaBit + HaBitStaking deployment");
  console.log("========================================");
  console.log(`Network:          ${chain.label} (${hre.network.name})`);
  console.log(`Deployer:         ${deployer.address}`);
  console.log(`Reserve multisig: ${reserveMultisig}`);
  console.log(`Gas balance:      ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ${chain.gasToken}`);
  console.log("----------------------------------------");

  const HaBit = await hre.ethers.getContractFactory("HaBit");
  const habit = await HaBit.deploy(reserveMultisig);
  await habit.waitForDeployment();
  const habitAddress = await habit.getAddress();
  console.log(`HaBit deployed:       ${habitAddress}`);

  const HaBitStaking = await hre.ethers.getContractFactory("HaBitStaking");
  const staking = await HaBitStaking.deploy(habitAddress);
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log(`HaBitStaking deployed:${stakingAddress}`);

  const deployment = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    label: chain.label,
    explorer: chain.explorer,
    gasToken: chain.gasToken,
    deployer: deployer.address,
    reserveMultisig,
    serverMinter: null,
    contracts: {
      HaBit: habitAddress,
      HaBitStaking: stakingAddress,
    },
    deployedAt: new Date().toISOString(),
  };

  const deploymentPath = writeDeployments(hre.network.name, deployment);

  console.log("\nExplorer links");
  logExplorerLinks(chain.explorer, deployment.contracts);

  console.log("\nDeployment file");
  console.log(deploymentPath);
  console.log("\nNext step");
  console.log(`npx hardhat run scripts/setup-minter.js --network ${hre.network.name}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
