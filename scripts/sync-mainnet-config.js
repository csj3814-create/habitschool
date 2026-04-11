const fs = require("fs");
const path = require("path");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function normalizeAddress(value) {
  return String(value || "").trim();
}

function normalizeBooleanExpectation(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function ensureAddress(name, value) {
  const normalized = normalizeAddress(value);
  if (!ADDRESS_PATTERN.test(normalized) || normalized.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    throw new Error(`${name} must be a non-zero EVM address.`);
  }
  return normalized;
}

function extractObjectPropertyLiteral(source, objectName, propertyName) {
  const pattern = new RegExp(
    `(export const ${objectName} = \\{[\\s\\S]*?\\b${propertyName}:\\s*)([^,\\n]+)(,)`
  );
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not find ${objectName}.${propertyName} in blockchain-config.js`);
  }
  return match[2].trim();
}

function normalizeConfigAddressLiteral(literal) {
  const trimmed = String(literal || "").trim();
  if (trimmed === "ZERO_ADDRESS") return ZERO_ADDRESS;
  return trimmed.replace(/^['"]|['"]$/g, "");
}

function parseConfigState(source) {
  const flagMatch = source.match(/const ENABLE_PROD_MAINNET = (true|false);/);
  if (!flagMatch) {
    throw new Error("Could not find ENABLE_PROD_MAINNET in blockchain-config.js");
  }

  return {
    enableProdMainnet: flagMatch[1] === "true",
    habitMainnetAddress: normalizeConfigAddressLiteral(
      extractObjectPropertyLiteral(source, "HBT_TOKEN", "mainnetAddress")
    ),
    stakingMainnetAddress: normalizeConfigAddressLiteral(
      extractObjectPropertyLiteral(source, "STAKING_CONTRACT", "mainnetAddress")
    ),
  };
}

function replaceObjectProperty(source, objectName, propertyName, valueLiteral) {
  const pattern = new RegExp(
    `(export const ${objectName} = \\{[\\s\\S]*?\\b${propertyName}:\\s*)([^,\\n]+)(,)`
  );
  if (!pattern.test(source)) {
    throw new Error(`Could not replace ${objectName}.${propertyName} in blockchain-config.js`);
  }
  return source.replace(pattern, `$1${valueLiteral}$3`);
}

function replaceProdFlag(source, enabled) {
  if (!/const ENABLE_PROD_MAINNET = (true|false);/.test(source)) {
    throw new Error("Could not replace ENABLE_PROD_MAINNET in blockchain-config.js");
  }
  return source.replace(
    /const ENABLE_PROD_MAINNET = (true|false);/,
    `const ENABLE_PROD_MAINNET = ${enabled ? "true" : "false"};`
  );
}

function loadDeployment(deploymentPath) {
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const habitAddress = ensureAddress("deployments.contracts.HaBit", deployment?.contracts?.HaBit);
  const stakingAddress = ensureAddress("deployments.contracts.HaBitStaking", deployment?.contracts?.HaBitStaking);

  return {
    raw: deployment,
    habitAddress,
    stakingAddress,
  };
}

function applyDeploymentToConfigSource(source, deployment, options = {}) {
  const habitAddress = ensureAddress("deployment.HaBit", deployment?.contracts?.HaBit);
  const stakingAddress = ensureAddress("deployment.HaBitStaking", deployment?.contracts?.HaBitStaking);

  let nextSource = replaceObjectProperty(source, "HBT_TOKEN", "mainnetAddress", `'${habitAddress}'`);
  nextSource = replaceObjectProperty(nextSource, "STAKING_CONTRACT", "mainnetAddress", `'${stakingAddress}'`);

  if (typeof options.enableProdMainnet === "boolean") {
    nextSource = replaceProdFlag(nextSource, options.enableProdMainnet);
  }

  return {
    source: nextSource,
    state: parseConfigState(nextSource),
  };
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, contents) {
  fs.writeFileSync(filePath, contents, "utf8");
}

function parseCliArgs(argv) {
  const args = {
    check: false,
    dryRun: false,
    configPath: path.join(__dirname, "..", "js", "blockchain-config.js"),
    deploymentPath: path.join(__dirname, "..", "contracts", "deployments-bsc.json"),
    enableProdMainnet: null,
    expectProdMainnet: null,
  };

  argv.forEach((arg) => {
    if (arg === "--check") {
      args.check = true;
      return;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      return;
    }
    if (arg === "--enable-prod-mainnet") {
      args.enableProdMainnet = true;
      return;
    }
    if (arg === "--disable-prod-mainnet") {
      args.enableProdMainnet = false;
      return;
    }
    if (arg.startsWith("--config=")) {
      args.configPath = path.resolve(arg.slice("--config=".length));
      return;
    }
    if (arg.startsWith("--deployment=")) {
      args.deploymentPath = path.resolve(arg.slice("--deployment=".length));
      return;
    }
    if (arg.startsWith("--expect-prod-mainnet=")) {
      args.expectProdMainnet = normalizeBooleanExpectation(arg.slice("--expect-prod-mainnet=".length));
      return;
    }
    throw new Error(`Unknown argument: ${arg}`);
  });

  return args;
}

function printState(label, state) {
  console.log(label);
  console.log(`- ENABLE_PROD_MAINNET: ${state.enableProdMainnet}`);
  console.log(`- HBT mainnet:         ${state.habitMainnetAddress}`);
  console.log(`- Staking mainnet:     ${state.stakingMainnetAddress}`);
}

function buildMismatchMessages(currentState, deploymentState, expectProdMainnet) {
  const mismatches = [];
  if (currentState.habitMainnetAddress.toLowerCase() !== deploymentState.habitAddress.toLowerCase()) {
    mismatches.push("HBT mainnet address does not match deployments-bsc.json");
  }
  if (currentState.stakingMainnetAddress.toLowerCase() !== deploymentState.stakingAddress.toLowerCase()) {
    mismatches.push("Staking mainnet address does not match deployments-bsc.json");
  }
  if (
    typeof expectProdMainnet === "boolean" &&
    currentState.enableProdMainnet !== expectProdMainnet
  ) {
    mismatches.push(`ENABLE_PROD_MAINNET is ${currentState.enableProdMainnet}, expected ${expectProdMainnet}`);
  }
  return mismatches;
}

function runCheck(args) {
  const deploymentState = loadDeployment(args.deploymentPath);
  const source = readText(args.configPath);
  const currentState = parseConfigState(source);
  const mismatches = buildMismatchMessages(
    currentState,
    deploymentState,
    args.expectProdMainnet
  );

  printState("Current config", currentState);
  console.log("Deployment file");
  console.log(`- Path:                ${args.deploymentPath}`);
  console.log(`- HBT mainnet:         ${deploymentState.habitAddress}`);
  console.log(`- Staking mainnet:     ${deploymentState.stakingAddress}`);

  if (mismatches.length) {
    console.error("\nMismatch");
    mismatches.forEach((message) => console.error(`- ${message}`));
    process.exitCode = 1;
    return;
  }

  console.log("\nStatus");
  console.log("- blockchain-config.js matches deployments-bsc.json");
}

function runSync(args) {
  const deploymentState = loadDeployment(args.deploymentPath);
  const source = readText(args.configPath);
  const beforeState = parseConfigState(source);
  const { source: nextSource, state: nextState } = applyDeploymentToConfigSource(
    source,
    deploymentState.raw,
    { enableProdMainnet: args.enableProdMainnet }
  );

  printState("Before", beforeState);
  printState("\nAfter", nextState);

  if (args.dryRun) {
    console.log("\nResult");
    console.log("- Dry run only. No files were changed.");
    return;
  }

  if (source === nextSource) {
    console.log("\nResult");
    console.log("- blockchain-config.js was already up to date.");
    return;
  }

  writeText(args.configPath, nextSource);
  console.log("\nResult");
  console.log(`- Updated ${args.configPath}`);
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.check) {
    runCheck(args);
    return;
  }
  runSync(args);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("sync-mainnet-config failed:", error.message);
    process.exit(1);
  }
}

module.exports = {
  ZERO_ADDRESS,
  applyDeploymentToConfigSource,
  parseConfigState,
  normalizeBooleanExpectation,
  loadDeployment,
};
