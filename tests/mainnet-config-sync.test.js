import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  applyDeploymentToConfigSource,
  parseConfigState,
  ZERO_ADDRESS,
} = require("../scripts/sync-mainnet-config.js");

const SAMPLE_SOURCE = `
const ZERO_ADDRESS = '${ZERO_ADDRESS}';
const ENABLE_PROD_MAINNET = false;

export const HBT_TOKEN = {
    testnetAddress: '0xtest',
    mainnetAddress: ZERO_ADDRESS,
};

export const STAKING_CONTRACT = {
    testnetAddress: '0xtest2',
    mainnetAddress: ZERO_ADDRESS,
};
`;

const SAMPLE_DEPLOYMENT = {
  contracts: {
    HaBit: "0x1111111111111111111111111111111111111111",
    HaBitStaking: "0x2222222222222222222222222222222222222222",
  },
};

describe("parseConfigState", () => {
  it("reads zero-address defaults and prod flag", () => {
    expect(parseConfigState(SAMPLE_SOURCE)).toEqual({
      enableProdMainnet: false,
      habitMainnetAddress: ZERO_ADDRESS,
      stakingMainnetAddress: ZERO_ADDRESS,
    });
  });
});

describe("applyDeploymentToConfigSource", () => {
  it("syncs deployed addresses without changing the prod flag by default", () => {
    const result = applyDeploymentToConfigSource(SAMPLE_SOURCE, SAMPLE_DEPLOYMENT);
    expect(result.state).toEqual({
      enableProdMainnet: false,
      habitMainnetAddress: SAMPLE_DEPLOYMENT.contracts.HaBit,
      stakingMainnetAddress: SAMPLE_DEPLOYMENT.contracts.HaBitStaking,
    });
  });

  it("can enable prod mainnet in the same pass when explicitly requested", () => {
    const result = applyDeploymentToConfigSource(SAMPLE_SOURCE, SAMPLE_DEPLOYMENT, {
      enableProdMainnet: true,
    });
    expect(result.state.enableProdMainnet).toBe(true);
    expect(result.state.habitMainnetAddress).toBe(SAMPLE_DEPLOYMENT.contracts.HaBit);
    expect(result.state.stakingMainnetAddress).toBe(SAMPLE_DEPLOYMENT.contracts.HaBitStaking);
  });
});
