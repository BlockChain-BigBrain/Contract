import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig, configVariable } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.24",
        settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 }, viaIR: true },
      },
    },
  },
  networks: {
    localhost: { type: "http", chainType: "l1", chainId: 31337, url: "http://127.0.0.1:8545" },
    hardhat: { type: "edr-simulated", chainType: "l1" },
    polygonAmoy: {
      type: "http", chainType: "l1", chainId: 80002,
      url: configVariable("POLYGON_AMOY_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
  verify: { etherscan: { apiKey: configVariable("POLYGONSCAN_API_KEY") } },
});
