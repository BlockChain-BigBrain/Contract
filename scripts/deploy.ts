import "dotenv/config";
import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const verificationSignerAddress = process.env.VERIFICATION_SIGNER_ADDRESS;

  if (!verificationSignerAddress) {
    throw new Error("VERIFICATION_SIGNER_ADDRESS is not set in .env");
  }

  const [deployer] = await ethers.getSigners();

  console.log("Deploying AudioLicense with account:", deployer.address);
  console.log("Verification signer address:", verificationSignerAddress);

  const AudioLicense = await ethers.getContractFactory("AudioLicense");
  const audioLicense = await AudioLicense.deploy(verificationSignerAddress);

  await audioLicense.waitForDeployment();

  const audioLicenseAddress = await audioLicense.getAddress();

  console.log("");
  console.log("AudioLicense deployed to:", audioLicenseAddress);
  console.log("");
  console.log("Add this to your .env:");
  console.log(`LICENSE_NFT_ADDRESS=${audioLicenseAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
