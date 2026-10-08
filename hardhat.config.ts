import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatEthersPlugin from "@nomicfoundation/hardhat-ethers";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [
    hardhatToolboxMochaEthersPlugin,
    hardhatEthersPlugin
  ],
  solidity: {
    profiles: {
      default: {
        version: "0.8.24",
        settings: {
          evmVersion: "cancun",
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },
  },
});