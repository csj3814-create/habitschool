const fs = require("fs");
const path = require("path");

function readAbi(contractName) {
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    `${contractName}.sol`,
    `${contractName}.json`
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  return artifact.abi;
}

function main() {
  const payload = {
    HaBit: readAbi("HaBit"),
    HaBitStaking: readAbi("HaBitStaking"),
  };

  const outputPath = path.join(__dirname, "..", "..", "functions", "contract-abi.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`ABI exported to ${outputPath}`);
}

main();
