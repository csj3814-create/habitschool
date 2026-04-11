/**
 * Read-only mainnet readiness check before an actual BSC launch action.
 *
 * This script checks:
 * - local env prerequisites for mainnet deployment / role setup
 * - mainnet RPC connectivity
 * - deployer balance visibility
 * - optional deployment artifact presence and frontend config sync
 *
 * Usage:
 *   node scripts/preflight-mainnet.js
 *   node scripts/preflight-mainnet.js --require-deployment
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { readDeployments } = require("./_helpers");
const { parseConfigState } = require("../../scripts/sync-mainnet-config.js");

const DEFAULT_MAINNET_RPC_URL = "https://bsc-dataseed.binance.org/";
const DEFAULT_DEPLOYMENT_PATH = path.join(__dirname, "..", "deployments-bsc.json");
const DEFAULT_FRONTEND_CONFIG_PATH = path.join(__dirname, "..", "..", "js", "blockchain-config.js");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function getArgFlag(name) {
  return process.argv.slice(2).includes(name);
}

function normalize(value) {
  return String(value || "").trim();
}

function isNonZeroAddress(value) {
  const normalized = normalize(value);
  return ADDRESS_PATTERN.test(normalized) && normalized.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
}

function maskAddress(value) {
  const normalized = normalize(value);
  if (!normalized) return "(missing)";
  if (normalized.length < 10) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function addResult(results, level, label, detail) {
  results.push({ level, label, detail });
}

async function main() {
  const requireDeployment = getArgFlag("--require-deployment");
  const results = [];
  const blockers = [];

  const deployerKey = normalize(process.env.DEPLOYER_PRIVATE_KEY);
  const reserveMultisig = normalize(process.env.RESERVE_MULTISIG_ADDRESS);
  const serverMinter = normalize(process.env.SERVER_MINTER_ADDRESS);
  const etherscanApiKey = normalize(process.env.ETHERSCAN_API_KEY);
  const bscscanApiKey = normalize(process.env.BSCSCAN_API_KEY);
  const rpcUrl = normalize(process.env.BSC_MAINNET_RPC_URL) || DEFAULT_MAINNET_RPC_URL;

  let deployerAddress = null;
  if (!deployerKey) {
    blockers.push("DEPLOYER_PRIVATE_KEY is missing.");
    addResult(results, "blocker", "DEPLOYER_PRIVATE_KEY", "Missing");
  } else {
    try {
      deployerAddress = new ethers.Wallet(deployerKey).address;
      addResult(results, "ok", "Deployer wallet", maskAddress(deployerAddress));
    } catch (error) {
      blockers.push("DEPLOYER_PRIVATE_KEY is not a valid private key.");
      addResult(results, "blocker", "Deployer wallet", error.message);
    }
  }

  if (!isNonZeroAddress(reserveMultisig)) {
    blockers.push("RESERVE_MULTISIG_ADDRESS is missing or invalid.");
    addResult(results, "blocker", "Reserve multisig", "Missing or invalid");
  } else {
    addResult(results, "ok", "Reserve multisig", maskAddress(reserveMultisig));
  }

  if (!isNonZeroAddress(serverMinter)) {
    blockers.push("SERVER_MINTER_ADDRESS is missing or invalid.");
    addResult(results, "blocker", "Server minter", "Missing or invalid");
  } else {
    addResult(results, "ok", "Server minter", maskAddress(serverMinter));
  }

  if (!etherscanApiKey && !bscscanApiKey) {
    blockers.push("Explorer verification API key is missing.");
    addResult(results, "blocker", "Explorer verify API key", "Missing");
  } else if (etherscanApiKey) {
    addResult(results, "ok", "Explorer verify API key", "ETHERSCAN_API_KEY present");
  } else {
    addResult(
      results,
      "warn",
      "Explorer verify API key",
      "Only BSCSCAN_API_KEY is present; Hardhat verify now prefers ETHERSCAN_API_KEY for Etherscan V2."
    );
  }

  if (
    deployerAddress &&
    isNonZeroAddress(reserveMultisig) &&
    deployerAddress.toLowerCase() === reserveMultisig.toLowerCase()
  ) {
    blockers.push("Reserve multisig must be different from the deployer wallet.");
    addResult(results, "blocker", "Address separation", "Deployer and reserve multisig are the same");
  }

  if (
    deployerAddress &&
    isNonZeroAddress(serverMinter) &&
    deployerAddress.toLowerCase() === serverMinter.toLowerCase()
  ) {
    blockers.push("Server minter should not reuse the deployer wallet.");
    addResult(results, "blocker", "Address separation", "Deployer and server minter are the same");
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl, 56);
    const blockNumber = await provider.getBlockNumber();
    addResult(results, "ok", "Mainnet RPC", `${rpcUrl} (latest block ${blockNumber})`);

    if (deployerAddress) {
      const balance = await provider.getBalance(deployerAddress);
      const balanceLabel = `${ethers.formatEther(balance)} BNB`;
      if (balance === 0n) {
        blockers.push("Deployer wallet has 0 BNB on BSC mainnet.");
        addResult(results, "blocker", "Deployer balance", balanceLabel);
      } else {
        addResult(results, "ok", "Deployer balance", balanceLabel);
      }
    }
  } catch (error) {
    blockers.push(`BSC mainnet RPC check failed: ${error.message}`);
    addResult(results, "blocker", "Mainnet RPC", error.message);
  }

  const deploymentExists = fs.existsSync(DEFAULT_DEPLOYMENT_PATH);
  if (!deploymentExists) {
    const level = requireDeployment ? "blocker" : "warn";
    const detail = `Missing ${DEFAULT_DEPLOYMENT_PATH}`;
    if (requireDeployment) {
      blockers.push("deployments-bsc.json is required but missing.");
    }
    addResult(results, level, "Deployment artifact", detail);
  } else {
    try {
      const deployment = readDeployments("bsc");
      const habitAddress = normalize(deployment?.contracts?.HaBit);
      const stakingAddress = normalize(deployment?.contracts?.HaBitStaking);
      if (!isNonZeroAddress(habitAddress) || !isNonZeroAddress(stakingAddress)) {
        blockers.push("deployments-bsc.json exists but contract addresses are incomplete.");
        addResult(results, "blocker", "Deployment artifact", "Contract addresses are incomplete");
      } else {
        addResult(
          results,
          "ok",
          "Deployment artifact",
          `HaBit ${maskAddress(habitAddress)}, HaBitStaking ${maskAddress(stakingAddress)}`
        );
      }

      const roleState = deployment?.serverRoles || {};
      const roleSummary = [
        `minter=${roleState.minterRoleGranted === true}`,
        `rateUpdater=${roleState.rateUpdaterRoleGranted === true}`,
        `stakingOperator=${roleState.stakingOperatorEnabled === true}`,
      ].join(", ");
      addResult(results, "ok", "Deployment role state", roleSummary);

      if (deployment?.serverMinter && isNonZeroAddress(serverMinter)) {
        if (normalize(deployment.serverMinter).toLowerCase() !== serverMinter.toLowerCase()) {
          blockers.push("SERVER_MINTER_ADDRESS does not match deployments-bsc.json");
          addResult(
            results,
            "blocker",
            "Server minter alignment",
            `env ${maskAddress(serverMinter)} vs file ${maskAddress(deployment.serverMinter)}`
          );
        } else {
          addResult(results, "ok", "Server minter alignment", maskAddress(serverMinter));
        }
      }

      const frontendConfigSource = fs.readFileSync(DEFAULT_FRONTEND_CONFIG_PATH, "utf8");
      const frontendState = parseConfigState(frontendConfigSource);
      const frontendMismatches = [];
      if (isNonZeroAddress(habitAddress) && frontendState.habitMainnetAddress.toLowerCase() !== habitAddress.toLowerCase()) {
        frontendMismatches.push("HBT mainnet address mismatch");
      }
      if (
        isNonZeroAddress(stakingAddress) &&
        frontendState.stakingMainnetAddress.toLowerCase() !== stakingAddress.toLowerCase()
      ) {
        frontendMismatches.push("Staking mainnet address mismatch");
      }

      if (frontendMismatches.length) {
        blockers.push("blockchain-config.js is not synced to deployments-bsc.json");
        addResult(results, "blocker", "Frontend mainnet config", frontendMismatches.join(", "));
      } else {
        addResult(
          results,
          "ok",
          "Frontend mainnet config",
          `ENABLE_PROD_MAINNET=${frontendState.enableProdMainnet}`
        );
      }
    } catch (error) {
      blockers.push(`Deployment artifact check failed: ${error.message}`);
      addResult(results, "blocker", "Deployment artifact", error.message);
    }
  }

  console.log("========================================");
  console.log("Mainnet preflight");
  console.log("========================================");
  results.forEach(({ level, label, detail }) => {
    console.log(`[${level.toUpperCase()}] ${label}: ${detail}`);
  });

  if (blockers.length) {
    console.log("\nResult");
    console.log(`- BLOCKED (${blockers.length} issue${blockers.length > 1 ? "s" : ""})`);
    blockers.forEach((message) => console.log(`- ${message}`));
    process.exit(1);
  }

  console.log("\nResult");
  console.log("- Ready for the next mainnet preparation step.");
}

main().catch((error) => {
  console.error("preflight-mainnet failed:", error.message);
  process.exit(1);
});
