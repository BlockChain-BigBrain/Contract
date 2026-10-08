import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const types = { RegisterTrack: [
  { name: "audioHash", type: "bytes32" }, { name: "metadataCIDHash", type: "bytes32" },
  { name: "registrant", type: "address" }, { name: "contributorsHash", type: "bytes32" },
  { name: "similarityScore", type: "uint256" }, { name: "modelVersion", type: "string" },
  { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
] };
async function fixture() {
  const [owner, verifier, creator, coCreator, buyer, stranger] = await ethers.getSigners();
  const registry = await ethers.deployContract("TrackRegistry", [verifier.address]);
  const nft = await ethers.deployContract("LicenseNFT", [await registry.getAddress(), owner.address]);
  const splitter = await ethers.deployContract("RevenueSplitter", [await registry.getAddress(), owner.address]);
  const market = await ethers.deployContract("LicenseMarketplace", [await registry.getAddress(), await nft.getAddress(), await splitter.getAddress(), owner.address]);
  await nft.setMarketplace(await market.getAddress());
  await splitter.setMarketplace(await market.getAddress());
  const receiver = await ethers.deployContract("AdversarialReceiver");
  const domain = { name: "TrackAI_Registry", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await registry.getAddress() };
  async function data(score = 7999, nonce = 0) {
    return { audioHash: ethers.id(`audio-${nonce}`), metadataCID: "bafy-test-metadata", contributors: [creator.address, coCreator.address], shares: [60, 40], similarityScore: score, modelVersion: "clap-v1", nonce, deadline: (await networkHelpers.time.latest()) + 3600 };
  }
  type Registration = Awaited<ReturnType<typeof data>>;
  async function sign(r: Registration, registrant = creator.address, signer = verifier, overrideDomain = domain) {
    return signer.signTypedData(overrideDomain, types, {
      audioHash: r.audioHash, metadataCIDHash: ethers.id(r.metadataCID), registrant,
      contributorsHash: ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address[]", "uint256[]"], [r.contributors, r.shares])),
      similarityScore: r.similarityScore, modelVersion: r.modelVersion, nonce: r.nonce, deadline: r.deadline,
    });
  }
  async function register(score = 7999, nonce = 0) {
    const r = await data(score, nonce);
    await registry.connect(creator).registerTrack(r, await sign(r));
    return BigInt(nonce + 1);
  }
  async function listed(score = 7999, price = 100n) {
    await register(score);
    await market.connect(creator).setLicensePrice(1, price);
  }
  return { owner, verifier, creator, coCreator, buyer, stranger, registry, nft, splitter, market, receiver, domain, data, sign, register, listed };
}

describe("TrackRegistry / real EIP-712 registration", function () {
  it("stores original CID, fingerprint and immutable 60:40 contributions, emits creation and verification", async function () {
    const f = await networkHelpers.loadFixture(fixture); const r = await f.data();
    await expect(f.registry.connect(f.creator).registerTrack(r, await f.sign(r)))
      .to.emit(f.registry, "TrackRegistered").and.to.emit(f.registry, "VerificationRecorded");
    const track = await f.registry.getTrack(1);
    expect(track.audioHash).to.equal(r.audioHash); expect(track.metadataCID).to.equal(r.metadataCID);
    expect(track.registrant).to.equal(f.creator.address);
    expect(await f.registry.getContributors(1)).to.deep.equal([[f.creator.address, f.coCreator.address], [60n, 40n]]);
    expect(await f.registry.trackIdByAudioHash(r.audioHash)).to.equal(1n);
    expect(await f.nft.balanceOf(f.creator.address, 1)).to.equal(0n);
  });
  it("rejects duplicate audio even with a new nonce", async function () {
    const f = await networkHelpers.loadFixture(fixture); await f.register(); const r = await f.data(); r.nonce = 1;
    await expect(f.registry.connect(f.creator).registerTrack(r, await f.sign(r))).to.be.revertedWithCustomError(f.registry, "DuplicateAudioHash");
  });
  it("rejects unapproved verifier", async function () {
    const f = await networkHelpers.loadFixture(fixture); const r = await f.data();
    await expect(f.registry.connect(f.creator).registerTrack(r, await f.sign(r, f.creator.address, f.stranger))).to.be.revertedWithCustomError(f.registry, "InvalidSignature");
  });
  it("rejects malformed signature", async function () {
    const f = await networkHelpers.loadFixture(fixture); await expect(f.registry.connect(f.creator).registerTrack(await f.data(), "0x12")).to.be.revertedWithCustomError(f.registry, "ECDSAInvalidSignatureLength");
  });
  it("rejects expired signature", async function () {
    const f = await networkHelpers.loadFixture(fixture); const r = await f.data(); r.deadline = (await networkHelpers.time.latest()) - 1;
    await expect(f.registry.connect(f.creator).registerTrack(r, await f.sign(r))).to.be.revertedWithCustomError(f.registry, "SignatureExpired");
  });
  it("rejects reused nonce on a different track", async function () {
    const f = await networkHelpers.loadFixture(fixture); await f.register(); const r = await f.data(); r.audioHash = ethers.id("different");
    await expect(f.registry.connect(f.creator).registerTrack(r, await f.sign(r))).to.be.revertedWithCustomError(f.registry, "NonceAlreadyUsed");
  });
  it("blocks registration front-running", async function () {
    const f = await networkHelpers.loadFixture(fixture); const r = await f.data(); const sig = await f.sign(r);
    await expect(f.registry.connect(f.stranger).registerTrack(r, sig)).to.be.revertedWithCustomError(f.registry, "InvalidSignature");
    await f.registry.connect(f.creator).registerTrack(r, sig);
  });
  for (const field of ["metadataCID", "contributors", "shares", "audioHash", "modelVersion", "similarityScore", "nonce", "deadline"] as const) {
    it(`binds signed ${field}`, async function () {
      const f = await networkHelpers.loadFixture(fixture); const r = await f.data(); const sig = await f.sign(r);
      switch (field) {
        case "metadataCID": r.metadataCID += "-changed"; break;
        case "contributors": r.contributors[1] = f.stranger.address; break;
        case "shares": r.shares = [50,50]; break;
        case "audioHash": r.audioHash = ethers.id("changed"); break;
        case "modelVersion": r.modelVersion = "other"; break;
        case "similarityScore": r.similarityScore = 8000; break;
        case "nonce": r.nonce++; break;
        case "deadline": r.deadline++; break;
      }
      await expect(f.registry.connect(f.creator).registerTrack(r, sig)).to.be.revertedWithCustomError(f.registry, "InvalidSignature");
    });
  }
  for (const domainField of ["chainId", "verifyingContract"] as const) {
    it(`rejects replay from different ${domainField}`, async function () {
      const f = await networkHelpers.loadFixture(fixture); const r = await f.data();
      const domain = { ...f.domain, ...(domainField === "chainId" ? { chainId: 80002n } : { verifyingContract: await f.nft.getAddress() }) };
      await expect(f.registry.connect(f.creator).registerTrack(r, await f.sign(r, f.creator.address, f.verifier, domain))).to.be.revertedWithCustomError(f.registry, "InvalidSignature");
    });
  }
  for (const [label, contributors, shares, error] of [
    ["bad sum", "normal", [60,30], "InvalidShares"], ["duplicate", "duplicate", [60,40], "DuplicateContributor"],
    ["zero address", "zero", [60,40], "InvalidContributors"], ["empty", "empty", [], "InvalidContributors"],
    ["zero share", "normal", [100,0], "InvalidShares"], ["length mismatch", "normal", [100], "InvalidContributors"],
    ["share over 100", "normal", [101,1], "InvalidShares"],
  ] as const) {
    it(`rejects ${label}`, async function () {
      const f = await networkHelpers.loadFixture(fixture); const r = await f.data(); r.shares = [...shares];
      if (contributors === "duplicate") r.contributors[1] = r.contributors[0];
      if (contributors === "zero") r.contributors[1] = ethers.ZeroAddress;
      if (contributors === "empty") r.contributors = [];
      await expect(f.registry.connect(f.creator).registerTrack(r, await f.sign(r))).to.be.revertedWithCustomError(f.registry, error);
    });
  }
  for (const [score,status] of [[0,0],[7999,0],[8000,1],[8999,1],[9000,2],[10000,2]]) {
    it(`score ${score} registers as status ${status}`, async function () {
      const f = await networkHelpers.loadFixture(fixture); await f.register(score);
      expect((await f.registry.getVerification(1)).status).to.equal(BigInt(status));
      expect(await f.registry.isTrackLicensable(1)).to.equal(status !== 2);
    });
  }
  it("rejects score above 10000", async function () {
    const f = await networkHelpers.loadFixture(fixture); const r = await f.data(10001);
    await expect(f.registry.connect(f.creator).registerTrack(r, await f.sign(r))).to.be.revertedWithCustomError(f.registry, "InvalidScore");
  });
  it("unknown track is not licensable and getters reject it", async function () {
    const f = await networkHelpers.loadFixture(fixture); expect(await f.registry.isTrackLicensable(9)).to.equal(false);
    await expect(f.registry.getTrack(9)).to.be.revertedWithCustomError(f.registry,"TrackNotFound");
  });
});

describe("LicenseMarketplace + LicenseNFT + RevenueSplitter", function () {
  for (const score of [7999, 8000]) {
    it(`purchases ${score < 8000 ? "PASS" : "WARN"} with atomic NFT and 60:40 allocation`, async function () {
      const f = await networkHelpers.loadFixture(fixture); await f.listed(score);
      await expect(f.market.connect(f.buyer).purchaseLicense(1,{value:100n}))
        .to.emit(f.market,"LicensePurchased").and.to.emit(f.nft,"LicenseMinted").and.to.emit(f.splitter,"RevenueAllocated");
      expect(await f.nft.balanceOf(f.buyer.address,1)).to.equal(1n);
      expect(await f.nft.hasLicense(f.buyer.address,1)).to.equal(true);
      expect(await f.nft.getPurchasedTrackIds(f.buyer.address)).to.deep.equal([1n]);
      expect(await f.nft.getTokenId(1,0)).to.equal(1n);
      expect(await f.nft.uri(1)).to.equal("ipfs://bafy-test-metadata");
      expect(await f.splitter.getPendingRevenue(f.creator.address)).to.equal(60n);
      expect(await f.splitter.getPendingRevenue(f.coCreator.address)).to.equal(40n);
      expect(await ethers.provider.getBalance(await f.market.getAddress())).to.equal(0n);
      expect(await ethers.provider.getBalance(await f.splitter.getAddress())).to.equal(100n);
    });
  }
  it("blocks HOLD purchases", async function () {
    const f = await networkHelpers.loadFixture(fixture); await f.listed(9000);
    await expect(f.market.connect(f.buyer).purchaseLicense(1,{value:100n})).to.be.revertedWithCustomError(f.market,"TrackNotLicensable");
  });
  it("blocks unknown tracks", async function () {
    const f = await networkHelpers.loadFixture(fixture);
    await expect(f.market.connect(f.buyer).purchaseLicense(7,{value:100n})).to.be.revertedWithCustomError(f.registry,"TrackNotFound");
  });
  it("blocks unlisted tracks", async function () {
    const f = await networkHelpers.loadFixture(fixture); await f.register();
    await expect(f.market.connect(f.buyer).purchaseLicense(1)).to.be.revertedWithCustomError(f.market,"InvalidPrice");
  });
  for (const value of [0n,99n,101n]) {
    it(`rejects non-exact payment ${value}`, async function () {
      const f = await networkHelpers.loadFixture(fixture); await f.listed();
      await expect(f.market.connect(f.buyer).purchaseLicense(1,{value})).to.be.revertedWithCustomError(f.market,"IncorrectPayment").withArgs(100n,value);
      expect(await f.nft.balanceOf(f.buyer.address,1)).to.equal(0n);
      expect(await f.splitter.totalPendingRevenue()).to.equal(0n);
    });
  }
  it("allows registrant or explicitly approved manager to price; rejects others and zero price", async function () {
    const f = await networkHelpers.loadFixture(fixture); await f.register();
    await expect(f.market.connect(f.coCreator).setLicensePrice(1,100)).to.be.revertedWithCustomError(f.market,"UnauthorizedPriceSetter");
    await expect(f.market.connect(f.stranger).setPriceManager(f.stranger.address,true)).to.be.revertedWithCustomError(f.market,"OwnableUnauthorizedAccount");
    await f.market.setPriceManager(f.stranger.address,true);
    await expect(f.market.connect(f.stranger).setLicensePrice(1,123)).to.emit(f.market,"LicensePriceUpdated");
    expect(await f.market.getLicensePrice(1)).to.equal(123n);
    await f.market.setPriceManager(f.stranger.address,false);
    await expect(f.market.connect(f.stranger).setLicensePrice(1,100)).to.be.revertedWithCustomError(f.market,"UnauthorizedPriceSetter");
    await expect(f.market.connect(f.creator).setLicensePrice(1,0)).to.be.revertedWithCustomError(f.market,"InvalidPrice");
  });
  it("only configured Marketplace can mint and record revenue; binding cannot be changed", async function () {
    const f = await networkHelpers.loadFixture(fixture); await f.listed();
    await expect(f.nft.mintLicense(f.buyer.address,1)).to.be.revertedWithCustomError(f.nft,"OnlyMarketplace");
    await expect(f.splitter.recordRevenue(1,{value:100})).to.be.revertedWithCustomError(f.splitter,"OnlyMarketplace");
    await expect(f.nft.setMarketplace(await f.receiver.getAddress())).to.be.revertedWithCustomError(f.nft,"MarketplaceAlreadySet");
    await expect(f.splitter.setMarketplace(await f.receiver.getAddress())).to.be.revertedWithCustomError(f.splitter,"MarketplaceAlreadySet");
  });
  it("cannot transfer individually, in batches or via approval", async function () {
    const f = await networkHelpers.loadFixture(fixture); await f.listed(); await f.market.connect(f.buyer).purchaseLicense(1,{value:100});
    await expect(f.nft.connect(f.buyer).safeTransferFrom(f.buyer.address,f.stranger.address,1,1,"0x")).to.be.revertedWithCustomError(f.nft,"NonTransferable");
    await expect(f.nft.connect(f.buyer).safeBatchTransferFrom(f.buyer.address,f.stranger.address,[1],[1],"0x")).to.be.revertedWithCustomError(f.nft,"NonTransferable");
    await expect(f.nft.connect(f.buyer).setApprovalForAll(f.stranger.address,true)).to.be.revertedWithCustomError(f.nft,"NonTransferable");
  });
  it("prevents repeat purchase without changing revenue", async function () {
    const f = await networkHelpers.loadFixture(fixture); await f.listed(); await f.market.connect(f.buyer).purchaseLicense(1,{value:100});
    await expect(f.market.connect(f.buyer).purchaseLicense(1,{value:100})).to.be.revertedWithCustomError(f.market,"AlreadyLicensed");
    expect(await f.splitter.totalPendingRevenue()).to.equal(100n);
  });
  it("rolls back payment, allocated revenue and NFT if real receiver rejects mint", async function () {
    const f = await networkHelpers.loadFixture(fixture); await f.listed();
    await f.receiver.configure(await f.market.getAddress(),await f.splitter.getAddress(),1,true,false,false,false);
    await expect(f.receiver.buy({value:100})).to.be.revertedWith("NFT rejected");
    expect(await f.splitter.totalPendingRevenue()).to.equal(0n);
    expect(await f.splitter.getPendingRevenue(f.creator.address)).to.equal(0n);
    expect(await ethers.provider.getBalance(await f.splitter.getAddress())).to.equal(0n);
    expect(await f.nft.balanceOf(await f.receiver.getAddress(),1)).to.equal(0n);
    expect(await f.nft.getPurchasedTrackIds(await f.receiver.getAddress())).to.deep.equal([]);
  });
  it("each creator withdraws once and cannot exceed recorded revenue", async function () {
    const f = await networkHelpers.loadFixture(fixture); await f.listed(); await f.market.connect(f.buyer).purchaseLicense(1,{value:100});
    await expect(f.splitter.connect(f.creator).withdrawRevenue()).to.changeEtherBalance(ethers,f.creator,60n);
    const withdrawal = f.splitter.connect(f.coCreator).withdrawRevenue();
    await expect(withdrawal).to.changeEtherBalance(ethers,f.coCreator,40n);
    await expect(withdrawal).to.emit(f.splitter,"RevenueWithdrawn");
    await expect(f.splitter.connect(f.creator).withdrawRevenue()).to.be.revertedWithCustomError(f.splitter,"NoRevenue");
    await expect(f.splitter.connect(f.stranger).withdrawRevenue()).to.be.revertedWithCustomError(f.splitter,"NoRevenue");
    expect(await f.splitter.totalPendingRevenue()).to.equal(0n);
    expect(await ethers.provider.getBalance(await f.splitter.getAddress())).to.equal(0n);
  });
  it("allocates rounding remainder to last contributor", async function () {
    const f = await networkHelpers.loadFixture(fixture); await f.listed(7999,101n); await f.market.connect(f.buyer).purchaseLicense(1,{value:101});
    expect(await f.splitter.getPendingRevenue(f.creator.address)).to.equal(60n);
    expect(await f.splitter.getPendingRevenue(f.coCreator.address)).to.equal(41n);
    expect(await f.splitter.totalPendingRevenue()).to.equal(101n);
  });
  it("blocks purchase reentry during ERC1155 acceptance callback", async function () {
    const f = await networkHelpers.loadFixture(fixture); await f.listed();
    await f.receiver.configure(await f.market.getAddress(),await f.splitter.getAddress(),1,false,false,true,false);
    await f.buyer.sendTransaction({to:await f.receiver.getAddress(),value:100});
    await f.receiver.buy({value:100});
    expect(await f.receiver.reentrySucceeded()).to.equal(false);
    expect(await f.receiver.reentryError()).to.equal(ethers.id("ReentrancyGuardReentrantCall()").slice(0,10));
    expect(await f.splitter.totalPendingRevenue()).to.equal(100n);
  });
  for (const reject of [false,true]) {
    it(reject ? "failed creator transfer preserves credit and never blocks purchases" : "blocks withdrawal reentry", async function () {
      const f = await networkHelpers.loadFixture(fixture); const r = await f.data(); r.contributors = [await f.receiver.getAddress(),f.coCreator.address];
      await f.registry.connect(f.creator).registerTrack(r,await f.sign(r)); await f.market.connect(f.creator).setLicensePrice(1,100);
      await f.receiver.configure(await f.market.getAddress(),await f.splitter.getAddress(),1,false,reject,false,!reject);
      await f.market.connect(f.buyer).purchaseLicense(1,{value:100});
      if (reject) {
        await expect(f.receiver.withdraw()).to.be.revertedWithCustomError(f.splitter,"TransferFailed");
        expect(await f.splitter.getPendingRevenue(await f.receiver.getAddress())).to.equal(60n);
        expect(await f.splitter.totalPendingRevenue()).to.equal(100n);
      } else {
        await f.receiver.withdraw();
        expect(await f.receiver.reentrySucceeded()).to.equal(false);
        expect(await f.receiver.reentryError()).to.equal(ethers.id("ReentrancyGuardReentrantCall()").slice(0,10));
        expect(await f.splitter.getPendingRevenue(await f.receiver.getAddress())).to.equal(0n);
        expect(await f.splitter.totalPendingRevenue()).to.equal(40n);
      }
    });
  }
});
