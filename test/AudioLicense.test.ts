import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("AudioLicense Smart Contract Test", function () {
  it("유사도 점수 및 EIP-712 서명 검증을 거쳐 음원 기록 및 라이선스 NFT가 성공적으로 민팅되어야 한다", async function () {
    // 1. 가상의 테스트 지갑 계정 생성
    const [deployer, aiVerifier, user] = await ethers.getSigners();

    // 2. AudioLicense 컨트랙트 배포
    const AudioLicense = await ethers.getContractFactory("AudioLicense");
    const audioLicense = await AudioLicense.deploy(aiVerifier.address);
    await audioLicense.waitForDeployment();
    const contractAddress = await audioLicense.getAddress();

    console.log("\n==========================================");
    console.log("1. 보완된 스마트 컨트랙트 로컬 배포 완료!");
    console.log("   - 배포된 컨트랙트 주소:", contractAddress);
    console.log("   - AI 검증자 지정 주소:", aiVerifier.address);
    console.log("==========================================");

    // 3. 테스트용 음원 메타데이터 준비
    const tokenId = 1;
    const ipfsCID = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";
    const audioHash = ethers.keccak256(ethers.toUtf8Bytes("SampleAudioFingerprint123"));
    const similarityScore = 80; // 유사도 80점 (85 미만이므로 정상 정산 가능)
    const creators = [user.address, deployer.address];
    const shares = [60, 40]; // 합계 100

    // 4. EIP-712 서명 생성을 위한 배열 해싱
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const creatorsHash = ethers.keccak256(abiCoder.encode(["address[]"], [creators]));
    const sharesHash = ethers.keccak256(abiCoder.encode(["uint256[]"], [shares]));

    const networkInfo = await ethers.provider.getNetwork();
    const domain = {
      name: "AudioAI_Registry",
      version: "1.0.0",
      chainId: networkInfo.chainId,
      verifyingContract: contractAddress,
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

    const value = {
      tokenId: tokenId,
      ipfsCID: ipfsCID,
      audioHash: audioHash,
      similarityScore: similarityScore,
      creatorsHash: creatorsHash,
      sharesHash: sharesHash,
    };

    // AI Verifier 지갑으로 서명
    const signature = await aiVerifier.signTypedData(domain, types, value);

    // 5. registerAndMint 실행
    console.log("\n2. registerAndMint 실행 중...");
    const tx = await audioLicense.connect(user).registerAndMint(
      tokenId,
      ipfsCID,
      audioHash,
      similarityScore,
      creators,
      shares,
      signature
    );
    await tx.wait();

    // 6. 결과 검증
    const userBalance = await audioLicense.balanceOf(user.address, tokenId);
    expect(userBalance).to.equal(1n);

    const record = await audioLicense.audioRecords(tokenId);
    expect(record.ipfsCID).to.equal(ipfsCID);
    expect(record.audioHash).to.equal(audioHash);
    expect(record.similarityScore).to.equal(BigInt(similarityScore));
    expect(record.isHold).to.equal(false); // 80점이므로 false

    console.log("\n3. 테스트 성공 결과:");
    console.log("   - 사용자 NFT 잔액 (Token ID 1):", userBalance.toString(), "개");
    console.log("   - AI 유사도 점수:", record.similarityScore.toString(), "점");
    console.log("   - 에스크로 홀딩 여부:", record.isHold);
    console.log("==========================================\n");
  });
});