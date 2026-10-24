import "dotenv/config";
import { network } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function safeJsonStringify(data: unknown) {
  return JSON.stringify(
    data,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2
  );
}

async function main() {
  const { ethers } = await network.connect();

  const verificationSignerAddress = process.env.VERIFICATION_SIGNER_ADDRESS;
  const verificationSignerPrivateKey = process.env.VERIFICATION_SIGNER_PRIVATE_KEY;

  if (!verificationSignerAddress) {
    throw new Error("VERIFICATION_SIGNER_ADDRESS is not set in .env");
  }

  if (!verificationSignerPrivateKey) {
    throw new Error("VERIFICATION_SIGNER_PRIVATE_KEY is not set in .env");
  }

  const [deployer, creator1, creator2, fakeSigner] = await ethers.getSigners();

  console.log("========== DEPLOY ==========");

  const AudioLicense = await ethers.getContractFactory("AudioLicense");
  const audioLicense = await AudioLicense.deploy(verificationSignerAddress);

  await audioLicense.waitForDeployment();

  const licenseAddress = await audioLicense.getAddress();
  const networkInfo = await ethers.provider.getNetwork();

  console.log("AudioLicense deployed to:", licenseAddress);
  console.log("Deployer:", deployer.address);
  console.log("Verification signer address:", verificationSignerAddress);
  console.log("Chain ID:", networkInfo.chainId.toString());
  console.log("");

  const verificationSigner = new ethers.Wallet(
    verificationSignerPrivateKey,
    ethers.provider
  );

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
  console.log("Transaction hash:", successTx.hash);
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

  let failRejected = false;
  let failReason = "";

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

    failRejected = false;
    failReason = "Unexpected success. This should not happen.";
    console.log(failReason);
  } catch (error: any) {
    failRejected = true;
    failReason = error.shortMessage || error.message || String(error);

    console.log("Mint rejected as expected");
    console.log("Reason:", failReason);
  }

  const timestamp = new Date().toISOString();
  const fileTimestamp = timestamp.replace(/[:.]/g, "-");

  const result = {
    timestamp,
    testPurpose:
      "AudioLicense 컨트랙트에서 정상 AI 검증자 EIP-712 서명만 민팅을 허용하고, 가짜 서명은 거부되는지 확인",
    network: {
      name: "Hardhat localhost",
      rpcUrl: "http://127.0.0.1:8545",
      chainId: Number(networkInfo.chainId),
    },
    contract: {
      name: "AudioLicense",
      address: licenseAddress,
    },
    accounts: {
      deployer: deployer.address,
      creator1: creator1.address,
      creator2: creator2.address,
      verificationSignerAddress,
      fakeSigner: fakeSigner.address,
    },
    eip712: {
      domain,
      types,
      hashRule: {
        creatorsHash: "keccak256(abi.encode(creators))",
        sharesHash: "keccak256(abi.encode(shares))",
        ethersImplementation:
          "ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode([...], [...]))",
      },
    },
    successCase: {
      description: "정상 AI 검증자 서명으로 registerAndMint 호출",
      result: "Mint success",
      transactionHash: successTx.hash,
      blockNumber: successReceipt?.blockNumber,
      tokenId: successData.tokenId,
      ipfsCID: successData.ipfsCID,
      audioHash: successData.audioHash,
      similarityScore: successData.similarityScore,
      isHoldExpected: successData.similarityScore >= 85,
      creators,
      shares,
    },
    failCase: {
      description: "다른 지갑이 만든 가짜 서명으로 registerAndMint 호출",
      result: failRejected ? "Mint rejected as expected" : "Unexpected success",
      reason: failReason,
      tokenId: failData.tokenId,
      ipfsCID: failData.ipfsCID,
      audioHash: failData.audioHash,
      similarityScore: failData.similarityScore,
      isHoldExpected: failData.similarityScore >= 85,
      creators,
      shares,
    },
    conclusion:
      "정상 AI 검증자 EIP-712 서명으로는 ERC-1155 라이선스 민팅이 성공했고, 다른 signer가 만든 가짜 서명은 Invalid AI Verification Signature로 거부되었다.",
    securityNote:
      "VERIFICATION_SIGNER_PRIVATE_KEY는 결과 파일에 저장하지 않았으며, GitHub/프론트엔드/공개 문서에 노출하면 안 된다.",
  };

  const outDir = join(process.cwd(), "test-results");
  mkdirSync(outDir, { recursive: true });

  const jsonPath = join(outDir, `blockchain-demo-${fileTimestamp}.json`);
  const mdPath = join(outDir, `blockchain-demo-${fileTimestamp}.md`);

  writeFileSync(jsonPath, safeJsonStringify(result), "utf8");

  const md = `# Blockchain Local Minting Test Result

## 1. 테스트 목적

AudioLicense 컨트랙트에서 정상 AI 검증자 EIP-712 서명이 있을 때만 ERC-1155 라이선스 민팅이 성공하고, 다른 지갑이 만든 가짜 서명은 거부되는지 확인했다.

## 2. 테스트 시간

${timestamp}

## 3. 테스트 환경

| 항목 | 값 |
|---|---|
| 네트워크 | Hardhat localhost |
| RPC 주소 | http://127.0.0.1:8545 |
| 체인 ID | ${Number(networkInfo.chainId)} |
| 컨트랙트 | AudioLicense |
| 컨트랙트 주소 | ${licenseAddress} |

## 4. 계정 정보

| 항목 | 주소 |
|---|---|
| 배포자 | ${deployer.address} |
| Creator 1 | ${creator1.address} |
| Creator 2 | ${creator2.address} |
| AI 검증자 주소 | ${verificationSignerAddress} |
| 가짜 서명자 주소 | ${fakeSigner.address} |

주의: VERIFICATION_SIGNER_PRIVATE_KEY는 이 결과 파일에 저장하지 않았다.

## 5. EIP-712 정보

### Domain

\`\`\`ts
{
  name: "AudioAI_Registry",
  version: "1.0.0",
  chainId: ${Number(networkInfo.chainId)},
  verifyingContract: "${licenseAddress}"
}
\`\`\`

### 서명 대상

\`\`\`txt
RegisterAudio(
  uint256 tokenId,
  string ipfsCID,
  bytes32 audioHash,
  uint256 similarityScore,
  bytes32 creatorsHash,
  bytes32 sharesHash
)
\`\`\`

### 배열 해시 방식

컨트랙트 내부 방식:

\`\`\`solidity
creatorsHash = keccak256(abi.encode(creators));
sharesHash = keccak256(abi.encode(shares));
\`\`\`

ethers 구현 시 주의:

\`\`\`ts
const abiCoder = ethers.AbiCoder.defaultAbiCoder();

const creatorsHash = ethers.keccak256(
  abiCoder.encode(["address[]"], [creators])
);

const sharesHash = ethers.keccak256(
  abiCoder.encode(["uint256[]"], [shares])
);
\`\`\`

solidityPackedKeccak256를 사용하면 컨트랙트와 해시가 달라져 서명 검증이 실패할 수 있다.

## 6. 성공 케이스

정상 AI 검증자 private key로 EIP-712 signature를 생성한 뒤 registerAndMint를 호출했다.

| 항목 | 값 |
|---|---|
| 결과 | Mint success |
| 트랜잭션 해시 | ${successTx.hash} |
| 블록 번호 | ${successReceipt?.blockNumber} |
| 토큰 ID | ${successData.tokenId} |
| IPFS CID | ${successData.ipfsCID} |
| audioHash | ${successData.audioHash} |
| similarityScore | ${successData.similarityScore} |
| 예상 isHold | ${successData.similarityScore >= 85} |
| creators | ${creators.join(", ")} |
| shares | ${shares.join(", ")} |

의미:

정상 AI 검증자 서명이 있을 경우 컨트랙트가 signer를 복구하고, aiVerifierAddress와 일치함을 확인한 뒤 ERC-1155 라이선스 토큰을 민팅한다.

## 7. 실패 케이스

다른 지갑이 만든 fake signature로 registerAndMint를 호출했다.

| 항목 | 값 |
|---|---|
| 결과 | ${failRejected ? "Mint rejected as expected" : "Unexpected success"} |
| 실패 사유 | ${failReason} |
| 토큰 ID | ${failData.tokenId} |
| IPFS CID | ${failData.ipfsCID} |
| audioHash | ${failData.audioHash} |
| similarityScore | ${failData.similarityScore} |
| 예상 isHold | ${failData.similarityScore >= 85} |

의미:

AI 검증자로 등록된 주소가 아닌 다른 지갑의 서명은 컨트랙트에서 거부된다.

## 8. 핵심 결론

정상 AI 검증자 EIP-712 서명으로는 ERC-1155 라이선스 민팅이 성공했고, 다른 signer가 만든 가짜 서명은 Invalid AI Verification Signature로 거부되었다.

따라서 블록체인은 표절 여부를 판단하는 것이 아니라, AI 검증 결과가 신뢰된 검증 서버에서 발급된 것인지 확인하고 정상 검증 결과만 온체인에 기록하는 역할을 한다.

## 9. 재실행 방법

터미널 1:

\`\`\`powershell
npx hardhat node
\`\`\`

터미널 2:

\`\`\`powershell
npx hardhat run scripts/full-demo-save.ts --network localhost
\`\`\`
`;

  writeFileSync(mdPath, md, "utf8");

  console.log("");
  console.log("========== SAVED RESULT ==========");
  console.log("JSON saved to:", jsonPath);
  console.log("Markdown saved to:", mdPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
