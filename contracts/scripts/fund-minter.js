/**
 * Send native gas token from deployer to SERVER_MINTER_ADDRESS.
 *
 * Required env:
 * - DEPLOYER_PRIVATE_KEY
 * - SERVER_MINTER_ADDRESS
 *
 * Optional env:
 * - FUND_AMOUNT (default 0.01)
 * - ONCHAIN_NETWORK=testnet|mainnet (default testnet)
 */

require("dotenv").config();
const { ethers } = require("ethers");
const { requireEnvAddress } = require("./_helpers");

const NETWORKS = {
  testnet: {
    rpcUrl: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
    chainId: 97,
    gasToken: "tBNB",
  },
  mainnet: {
    rpcUrl: process.env.BSC_MAINNET_RPC_URL || "https://bsc-dataseed.binance.org/",
    chainId: 56,
    gasToken: "BNB",
  },
};

async function main() {
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY is required.");
  }

  const networkKey = process.env.ONCHAIN_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const network = NETWORKS[networkKey];
  const recipient = requireEnvAddress("SERVER_MINTER_ADDRESS");
  const amount = process.env.FUND_AMOUNT || "0.01";

  const provider = new ethers.JsonRpcProvider(network.rpcUrl, network.chainId);
  const deployer = new ethers.Wallet(deployerKey, provider);

  console.log("========================================");
  console.log("Fund server minter");
  console.log("========================================");
  console.log(`Network:   ${networkKey}`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Recipient: ${recipient}`);
  console.log(`Amount:    ${amount} ${network.gasToken}`);
  console.log("----------------------------------------");

  const tx = await deployer.sendTransaction({
    to: recipient,
    value: ethers.parseEther(amount),
  });
  console.log(`Submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`Confirmed: block ${receipt.blockNumber}`);
}

main().catch((error) => {
  console.error("Funding failed:", error);
  process.exit(1);
});
