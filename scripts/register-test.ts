import "dotenv/config";
import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const licenseAddress = process.env.LICENSE_NFT_ADDRESS;
  const verificationSignerPrivateKey = process.env.VERIFICATION_SIGNER_PRIVATE_KEY;
  const verificationSignerAddress = process.env.VERIFICATION_SIGNER_ADDRESS;

  if (!licenseAddress) {
    throw new Error("LICENSE_NFT_ADDRESS is not set in .env");
  }

  if (!verificationSignerPrivateKey) {
    throw new Error("VERIFICATION_SIGNER_PRIVATE_KEY is not set in .env");
  }

  if (!verificationSignerAddress) {
    throw new Error("VERIFICATION_SIGNER_ADDRESS is not set in .env");
  }

  const [deployer, creator1, creator2, fakeSigner] = await ethers.getSigners();

  const audioLicense = await ethers.getContractAt("AudioLicense", licenseAddress);

  console.log("AudioLicense address:", licenseAddress);
  console.log("Deployer:", deployer.address);
  console.log("Creator 1:", creator1.address);
  console.log("Creator 2:", creator2.address);
  console.log("Verification signer address:", verificationSignerAddress);
  console.log("");

  const verificationSigner = new ethers.Wallet(
    verificationSignerPrivateKey,
    ethers.provider
  );

  const networkInfo = await ethers.provider.getNetwork();

  const domain = {
    name: "AudioAI_Registry",
    version: "1.0.0",
    chainId: Number(networkInfo.chainId),
    verifyingContract: licenseAddress,
  };

  const types = {
    RegisterAudio: [
      { name: "tokenId", type: "uint256" },
      { name: "ipfsCID", type: "string" },
      { name: "audioHash", type: "bytes32" },
      { name: "similarityScore", type: "uint256" },
      { name: "creatorsHash", type: "bytes32" },
      { name: "sharesHash", type: "bytes32" },
    ],
  };

  const creators = [creator1.address, creator2.address];
  const shares = [70, 30];

  /**
   * Solidity:
   * keccak256(abi.encode(creators))
   * keccak256(abi.encode(shares))
   *
   * 위 방식과 맞추기 위해 ethers AbiCoder로 encode 후 keccak256 처리한다.
   */
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  const creatorsHash = ethers.keccak256(
    abiCoder.encode(["address[]"], [creators])
  );

  const sharesHash = ethers.keccak256(
    abiCoder.encode(["uint256[]"], [shares])
  );

  const baseTokenId = Math.floor(Date.now() / 1000);

  console.log("========== SUCCESS CASE ==========");

  const successData = {
    tokenId: baseTokenId,
    ipfsCID: `bafybeigdyrzt5sampletrackcid-success-${baseTokenId}`,
    audioHash: ethers.keccak256(
      ethers.toUtf8Bytes(`track-ai-demo-audio-success-${baseTokenId}`)
    ),
    similarityScore: 72,
    creatorsHash,
    sharesHash,
  };

  const validSignature = await verificationSigner.signTypedData(
    domain,
    types,
    successData
  );

  console.log("Valid signature created by verification signer");

  const successTx = await audioLicense.registerAndMint(
    successData.tokenId,
    successData.ipfsCID,
    successData.audioHash,
    successData.similarityScore,
    creators,
    shares,
    validSignature
  );

  const successReceipt = await successTx.wait();

  console.log("Mint success");
  console.log("Transaction hash:", successReceipt?.hash);
  console.log("Token ID:", successData.tokenId);
  console.log("");

  console.log("========== FAIL CASE ==========");

  const failData = {
    tokenId: baseTokenId + 1,
    ipfsCID: `bafybeigdyrzt5sampletrackcid-fail-${baseTokenId}`,
    audioHash: ethers.keccak256(
      ethers.toUtf8Bytes(`track-ai-demo-audio-fail-${baseTokenId}`)
    ),
    similarityScore: 91,
    creatorsHash,
    sharesHash,
  };

  const fakeSignature = await fakeSigner.signTypedData(
    domain,
    types,
    failData
  );

  console.log("Fake signature created by non-verifier signer");

  try {
    const failTx = await audioLicense.registerAndMint(
      failData.tokenId,
      failData.ipfsCID,
      failData.audioHash,
      failData.similarityScore,
      creators,
      shares,
      fakeSignature
    );

    await failTx.wait();

    console.log("Unexpected success. This should not happen.");
  } catch (error: any) {
    console.log("Mint rejected as expected");
    console.log("Reason:", error.shortMessage || error.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
