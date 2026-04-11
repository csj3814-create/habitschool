const fs = require("fs");
const path = require("path");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const CHAIN_CONFIG = {
  bscTestnet: {
    label: "BSC Testnet",
    explorer: "https://testnet.bscscan.com",
    gasToken: "tBNB",
  },
  bsc: {
    label: "BSC Mainnet",
    explorer: "https://bscscan.com",
    gasToken: "BNB",
  },
};

function getChainConfig(networkName) {
  const config = CHAIN_CONFIG[networkName];
  if (!config) {
    throw new Error(`Unsupported network: ${networkName}. Use bscTestnet or bsc.`);
  }
  return config;
}

function getDeploymentPath(networkName) {
  return path.join(__dirname, `..`, `deployments-${networkName}.json`);
}

function readDeployments(networkName) {
  const deploymentPath = getDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function writeDeployments(networkName, payload) {
  const deploymentPath = getDeploymentPath(networkName);
  fs.writeFileSync(deploymentPath, `${JSON.stringify(payload, null, 2)}\n`);
  return deploymentPath;
}

function parseAddress(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function requireEnvAddress(name) {
  const value = parseAddress(process.env[name]);
  if (!value || value === ZERO_ADDRESS) {
    throw new Error(`${name} is required and must be a non-zero address.`);
  }
  return value;
}

function optionalEnvAddress(name) {
  const value = parseAddress(process.env[name]);
  if (!value || value === ZERO_ADDRESS) return null;
  return value;
}

function logExplorerLinks(explorer, contracts) {
  Object.entries(contracts).forEach(([label, address]) => {
    if (!address) return;
    console.log(`- ${label}: ${explorer}/address/${address}`);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExpectedValue(readValue, isExpected, description, options = {}) {
  const attempts = options.attempts || 8;
  const delayMs = options.delayMs || 1500;
  let lastValue;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastValue = await readValue();
    if (isExpected(lastValue)) {
      return lastValue;
    }

    if (attempt < attempts) {
      console.log(
        `[wait] ${description} not settled yet (${attempt}/${attempts}, current=${lastValue}). Retrying in ${delayMs}ms...`,
      );
      await sleep(delayMs);
    }
  }

  throw new Error(`${description} did not reach the expected state. Last value: ${lastValue}`);
}

module.exports = {
  ZERO_ADDRESS,
  getChainConfig,
  readDeployments,
  writeDeployments,
  requireEnvAddress,
  optionalEnvAddress,
  logExplorerLinks,
  waitForExpectedValue,
};
