import { network } from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";
import { isAddress, getAddress } from "ethers";

const verifier = process.env.VERIFICATION_SIGNER_ADDRESS;
if (!verifier || !isAddress(verifier) || getAddress(verifier) === "0x0000000000000000000000000000000000000000") {
  throw new Error("VERIFICATION_SIGNER_ADDRESS must be a nonzero Ethereum address");
}
const { ethers } = await network.create();
const chain = await ethers.provider.getNetwork();
if (![31337n, 80002n].includes(chain.chainId)) throw new Error("Deployment is restricted to local Hardhat or Polygon Amoy");
const [owner] = await ethers.getSigners();
const registry = await ethers.deployContract("TrackRegistry", [verifier]);
await registry.waitForDeployment();
const nft = await ethers.deployContract("LicenseNFT", [await registry.getAddress(), owner.address]);
await nft.waitForDeployment();
const splitter = await ethers.deployContract("RevenueSplitter", [await registry.getAddress(), owner.address]);
await splitter.waitForDeployment();
const marketplace = await ethers.deployContract("LicenseMarketplace", [await registry.getAddress(), await nft.getAddress(), await splitter.getAddress(), owner.address]);
await marketplace.waitForDeployment();
await (await nft.setMarketplace(await marketplace.getAddress())).wait();
await (await splitter.setMarketplace(await marketplace.getAddress())).wait();
const addresses = {
  chainId: chain.chainId.toString(), owner: owner.address, verificationSigner: verifier,
  TrackRegistry: await registry.getAddress(), LicenseNFT: await nft.getAddress(),
  RevenueSplitter: await splitter.getAddress(), LicenseMarketplace: await marketplace.getAddress(),
};
await mkdir("deployments", { recursive: true });
await writeFile(`deployments/${chain.chainId}.json`, JSON.stringify(addresses, null, 2) + "\n");
console.log(JSON.stringify(addresses, null, 2));
console.log("Both Marketplace bindings confirmed. Local addresses expire when the simulated network closes.");
