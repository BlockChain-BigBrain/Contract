import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { network } from "hardhat";

// Synthetic chain fixture: this does not invoke AI, IPFS or the application DB.
const { ethers } = await network.create();
const chain = await ethers.provider.getNetwork();
assert.equal(chain.chainId, 31337n, "Demo is restricted to local Hardhat 31337");
const [owner, creator, collaborator, buyer, verifier, attacker] = await ethers.getSigners();
const registry = await ethers.deployContract("TrackRegistry", [verifier.address]);
await registry.waitForDeployment();
const nft = await ethers.deployContract("LicenseNFT", [await registry.getAddress(), owner.address]);
await nft.waitForDeployment();
const splitter = await ethers.deployContract("RevenueSplitter", [await registry.getAddress(), owner.address]);
await splitter.waitForDeployment();
const market = await ethers.deployContract("LicenseMarketplace", [await registry.getAddress(), await nft.getAddress(), await splitter.getAddress(), owner.address]);
await market.waitForDeployment();
await (await nft.setMarketplace(await market.getAddress())).wait();
await (await splitter.setMarketplace(await market.getAddress())).wait();
const domain = { name: "TrackAI_Registry", version: "1", chainId: chain.chainId, verifyingContract: await registry.getAddress() };
const types = { RegisterTrack: [
  { name: "audioHash", type: "bytes32" }, { name: "metadataCIDHash", type: "bytes32" },
  { name: "registrant", type: "address" }, { name: "contributorsHash", type: "bytes32" },
  { name: "similarityScore", type: "uint256" }, { name: "modelVersion", type: "string" },
  { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
] };
const contributors = [creator.address, collaborator.address], shares = [60, 40];
const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 3600);
const registration = (name: string, score: number, nonce: number) => ({
  audioHash: "0x" + createHash("sha256").update(name).digest("hex"),
  metadataCID: "ipfs://demo-fixture-not-an-upload", contributors, shares,
  similarityScore: score, modelVersion: "demo-fixture-v1", nonce, deadline,
});
const sign = (r: ReturnType<typeof registration>, signer = verifier) => signer.signTypedData(domain, types, {
  audioHash: r.audioHash, metadataCIDHash: ethers.id(r.metadataCID), registrant: creator.address,
  contributorsHash: ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address[]", "uint256[]"], [r.contributors, r.shares])),
  similarityScore: r.similarityScore, modelVersion: r.modelVersion, nonce: r.nonce, deadline: r.deadline,
});
const transactions: Record<string, string> = {};
async function confirmed(label: string, tx: Promise<any>) {
  const receipt = await (await tx).wait();
  assert.equal(receipt.status, 1);
  transactions[label] = receipt.hash;
  return receipt;
}
async function rejected(label: string, tx: () => Promise<any>, contract: any, expected: string) {
  try { await (await tx()).wait(); }
  catch (error: any) {
    const data = error.data ?? error.error?.data;
    assert.equal(contract.interface.parseError(typeof data === "string" ? data : data?.data)?.name, expected, label);
    return;
  }
  assert.fail(`${label}: transaction unexpectedly succeeded`);
}
const pass = registration("pass-fixture", 7200, 1);
await confirmed("registerPass", registry.connect(creator).registerTrack(pass, await sign(pass)));
const trackId = await registry.trackIdByAudioHash(pass.audioHash);
assert.equal(await nft.balanceOf(buyer.address, trackId), 0n, "Registration must not mint a license");
const invalid = registration("invalid-fixture", 7200, 2);
const fakeSignature = await sign(invalid, attacker);
await rejected("forged signature", () => registry.connect(creator).registerTrack(invalid, fakeSignature), registry, "InvalidSignature");
assert.equal(await registry.isAudioHashRegistered(invalid.audioHash), false);
assert.equal(await registry.usedNonces(creator.address, invalid.nonce), false);
const hold = registration("hold-fixture", 9100, 3);
await confirmed("registerHold", registry.connect(creator).registerTrack(hold, await sign(hold)));
const holdId = await registry.trackIdByAudioHash(hold.audioHash);
assert.equal((await registry.getVerification(holdId)).status, 2n);
assert.equal(await registry.isTrackLicensable(holdId), false);
await rejected("HOLD purchase", () => market.connect(buyer).purchaseLicense(holdId, { value: 101n }), market, "TrackNotLicensable");
await confirmed("setPrice", market.connect(creator).setLicensePrice(trackId, 101n));
await confirmed("purchase", market.connect(buyer).purchaseLicense(trackId, { value: 101n }));
assert.equal(await nft.balanceOf(buyer.address, trackId), 1n);
assert.equal(await splitter.getPendingRevenue(creator.address), 60n);
assert.equal(await splitter.getPendingRevenue(collaborator.address), 41n);
await rejected("duplicate purchase", () => market.connect(buyer).purchaseLicense(trackId, { value: 101n }), market, "AlreadyLicensed");
await confirmed("withdrawCreator", splitter.connect(creator).withdrawRevenue());
await confirmed("withdrawCollaborator", splitter.connect(collaborator).withdrawRevenue());
assert.equal(await splitter.getPendingRevenue(creator.address), 0n);
assert.equal(await splitter.getPendingRevenue(collaborator.address), 0n);
assert.equal(await splitter.totalPendingRevenue(), 0n);
assert.equal(await ethers.provider.getBalance(await splitter.getAddress()), 0n);
const result = {
  schemaVersion: 1, createdAt: new Date().toISOString(), chainId: chain.chainId.toString(),
  scope: "Synthetic local contract demo; no real AI/IPFS/DB integration", scoreScale: 10000,
  contracts: { TrackRegistry: await registry.getAddress(), LicenseNFT: await nft.getAddress(), RevenueSplitter: await splitter.getAddress(), LicenseMarketplace: await market.getAddress() },
  trackId: trackId.toString(), holdTrackId: holdId.toString(), priceWei: "101", shares,
  allocatedWei: ["60", "41"], transactions,
  checks: { registrationDoesNotMint: true, forgedSignatureRejected: true, holdPurchaseRejected: true, purchaseMintsLicense: true, duplicatePurchaseRejected: true, revenueConservedAndWithdrawn: true },
};
const directory = "test-results", filename = `blockchain-demo-${result.createdAt.replace(/[:.]/g, "-")}`;
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/${filename}.json`, JSON.stringify(result, null, 2) + "\n");
await writeFile(`${directory}/${filename}.md`, `# Track-AI local contract demo\n\n${result.scope}\n\nPASS 7200 / HOLD 9100; score scale 10000.\n\n101 wei purchase: 60/41 wei allocated to the signed 60:40 contributors, both withdrawn.\n\n${Object.entries(result.checks).map(([name]) => `- [x] ${name}`).join("\n")}\n\n## Transactions\n\n${Object.entries(transactions).map(([name, hash]) => `- ${name}: ${hash}`).join("\n")}\n\nAddresses and hashes belong only to this local chain run.\n`);
console.log(JSON.stringify(result, null, 2));
console.log(`Results saved: ${directory}/${filename}.{json,md}`);
