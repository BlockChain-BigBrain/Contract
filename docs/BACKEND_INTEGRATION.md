# Track-AI Backend Integration

## 1. 계약 역할 및 정책

- `TrackRegistry`: 음원 해시/CID/등록자/기여자·지분/검증 점수·모델 버전을 불변 기록. 등록자에게 NFT를 발급하지 않는다.
- `LicenseNFT`: COMMERCIAL ERC-1155 이용권. `tokenId == trackId`, 동일 구매자·음원은 한 번만 구매. 양도·재판매·operator 승인을 차단한다.
- `LicenseMarketplace`: 가격 권한 및 정확한 네이티브 토큰 결제 검증, 수익 기록과 NFT 발급을 하나의 트랜잭션으로 수행.
- `RevenueSplitter`: 서명된 지분에 따라 출금 가능한 수익을 기록. 외부 수신자에 대한 송금은 구매 때 하지 않는다.

점수는 0~10000: PASS 0~7999, WARN 8000~8999, HOLD 9000~10000. HOLD도 등록 가능하나 구매는 불가능하다. WARN은 프론트엔드가 위험 고지 후 구매하도록 구현한다. 컨트랙트의 WARN 구매 허용 정책은 고지 동의 여부를 수집하지 않는다.

동일 `audioHash`는 상태와 무관하게 재등록 불가. 완전 중복 여부는 Backend/AI가 canonical fingerprint로 해시를 생성해서 결정한다. 다른 해시를 제출한 음원의 완전 중복 여부까지 온체인에서 추론하지 않는다. 등록자와 기여자는 별도 역할이며 등록자가 기여자 목록에 반드시 포함될 필요는 없다. Backend는 등록자 권한과 기여자 동의 증빙을 확인한 뒤 서명해야 한다.

지분 단위는 기존 코드와 동일한 정수 %이며 합계는 100. 기여자는 비어 있으면 안 되고 주소는 nonzero·유일, 각 지분은 1~100이다. 따라서 기여자 수는 최대 100. 기여자 변경/검증 상태 갱신/등록 삭제 API는 없다.

## 2. 설치, 테스트, Polygon Amoy 배포

Node.js 24, Solidity 0.8.24, Hardhat 3, ethers 6, OpenZeppelin 5를 사용한다. `package-lock.json`이 실제 설치 버전을 고정한다. 라이브러리 추가 없이 기존 toolbox를 사용한다.

```sh
npm ci
npm run build
npm run typecheck
npm test
npm run abi
```

`.env.example`은 키 목록이다. 파일을 복사하는 것만으로 환경 변수가 로드되지 않으며, shell/배포 환경의 secret manager에서 주입한다. 서명자 키와 배포자 키는 역할이 다르다. 예시 명령에서 실제 키를 소스에 넣지 않는다.

```sh
export POLYGON_AMOY_RPC_URL='https://YOUR_AMOY_RPC'
export DEPLOYER_PRIVATE_KEY='YOUR_DEPLOYER_KEY'
export VERIFICATION_SIGNER_ADDRESS='0xYOUR_BACKEND_SIGNER_ADDRESS'
export POLYGONSCAN_API_KEY='YOUR_EXPLORER_API_KEY'
npm run deploy:amoy
```

배포 순서: Registry → NFT → Splitter → Marketplace → NFT/Splitter의 `setMarketplace` 확정. 바인딩은 owner만 한 번 가능하며 이후 변경 불가. 잘못된 바인딩은 새 계약 배포가 필요하다. 배포 스크립트는 각 receipt를 기다리고 모든 단계 성공 시 `deployments/80002.json`에 주소를 기록하며 출력한다. 중간 실패 시 이미 성공한 배포 트랜잭션은 되돌아가지 않는다. 구매 트랜잭션 원자성과는 별개다. 실패한 배포를 그대로 재실행하면 새 계약을 생성하므로 기존 주소·tx를 확인한다.

[Polygon 공식 네트워크 정보](https://docs.polygon.technology/pos/reference/rpc-endpoints)에 따르면 Amoy는 chainId 80002, 네이티브 테스트 토큰은 POL, 가격 단위는 wei (`ethers.parseEther`). 가스가 있는 테스트넷 배포자 계정이 필요하다. 스크립트는 chainId 31337/80002 외 배포를 거부한다. 변수 누락은 Hardhat `configVariable` 이름이 포함된 오류 또는 서명자 주소 검증 오류로 표시된다. `POLYGONSCAN_API_KEY`는 배포 필수가 아니며 explorer 검증에 필요하다. 환경 변수명은 요청대로 유지하지만 Hardhat 3의 Etherscan provider가 사용하는 Etherscan API 키를 넣는다. 아래 검증 명령은 배포와 같은 `default` 빌드 프로필을 지정한다. [Hardhat 공식 검증 문서](https://hardhat.org/docs/plugins/hardhat-verify)를 참조한다.

```sh
npx hardhat verify --build-profile default --network polygonAmoy REGISTRY_ADDRESS VERIFICATION_SIGNER_ADDRESS
npx hardhat verify --build-profile default --network polygonAmoy NFT_ADDRESS REGISTRY_ADDRESS OWNER_ADDRESS
npx hardhat verify --build-profile default --network polygonAmoy SPLITTER_ADDRESS REGISTRY_ADDRESS OWNER_ADDRESS
npx hardhat verify --build-profile default --network polygonAmoy MARKET_ADDRESS REGISTRY_ADDRESS NFT_ADDRESS SPLITTER_ADDRESS OWNER_ADDRESS
```

로컬 배포 스크립트 검증: `VERIFICATION_SIGNER_ADDRESS` 설정 후 `npm run deploy:local`. 기본 시뮬레이션 네트워크는 프로세스 종료 후 사라진다. 지속 로컬 개발에는 `npx hardhat node`를 실행하고 별도 localhost HTTP 네트워크 설정을 사용한다.

## 3. 주소와 ABI

`npm run abi`는 `abi/TrackRegistry.json`, `abi/LicenseNFT.json`, `abi/LicenseMarketplace.json`, `abi/RevenueSplitter.json`을 생성한다. 원본 ABI는 `artifacts/contracts/<Name>.sol/<Name>.json`의 `abi` 필드에도 있다.

Backend와 Frontend 설정:

```env
POLYGON_AMOY_RPC_URL=
TRACK_REGISTRY_ADDRESS=
LICENSE_NFT_ADDRESS=
LICENSE_MARKETPLACE_ADDRESS=
REVENUE_SPLITTER_ADDRESS=
```

배포 출력/manifest의 네 개 주소를 대응시킨다. 실제 Amoy 배포 전에는 확정된 주소가 없다. Backend 전용 `VERIFICATION_SIGNER_PRIVATE_KEY`는 `VERIFICATION_SIGNER_ADDRESS`와 일치해야 한다. 절대 Frontend 번들·응답·Git에 포함하지 않는다. 배포자 키는 운영 Backend API에 필요 없다.

## 4. 함수 입력·반환값

Solidity `uint256`은 ethers 6에서 `bigint`이며 JSON/Prisma에는 `.toString()`으로 직렬화한다. 음원 ID는 Registry가 1부터 자동 발급한다.

| 계약 / 함수 | 입력 | 결과 / 권한 |
|---|---|---|
| Registry `registerTrack` | Registration tuple, bytes signature | trackId; 등록자 본인 호출. 실제 tx receipt의 TrackRegistered로 ID 확인 |
| Registry `getTrack` | trackId | tuple(audioHash bytes32, metadataCID string, registrant address, timestamp uint256) |
| Registry `getContributors` | trackId | address[], uint256[] (정수 %) |
| Registry `getVerification` | trackId | tuple(similarityScore uint256, modelVersion string, status uint8) |
| Registry `isTrackLicensable` | trackId | bool; 미등록도 false |
| Registry `usedNonces` | registrant, nonce | bool; 계정별 임의 nonce 사용 여부 |
| Registry `trackIdByAudioHash` | bytes32 | ID; 미등록 0 |
| Registry `verificationSigner` | 없음 | 승인된 immutable 서명자 |
| NFT `getTokenId` | trackId, licenseType(0) | trackId; 현재 COMMERCIAL=0만 유효 |
| NFT `balanceOf` / `hasLicense` | buyer, tokenId/trackId | uint256 / bool |
| NFT `getPurchasedTrackIds` | buyer | 구매한 trackId 배열 |
| NFT `uri` | tokenId | ipfs://CID; 현재 등록 metadata 공용 |
| NFT `mintLicense` | buyer, trackId | Marketplace만 호출, 발급 이벤트 |
| NFT/Splitter `setMarketplace` | deployed contract address | 초기 owner가 한 번 설정 |
| Market `setLicensePrice` | trackId, priceWei | 등록자 또는 승인된 priceManager만 호출; price>0 |
| Market `getLicensePrice` | trackId | wei, 0은 미판매; 미등록은 revert |
| Market `setPriceManager` | manager, approved | owner만 허용/취소; owner도 자동 가격 권한은 없음 |
| Market `purchaseLicense` | trackId, msg.value | 구매자 호출, 정확한 금액; 구매 이벤트 |
| Splitter `recordRevenue` | trackId, msg.value | Marketplace 전용 |
| Splitter `getPendingRevenue` | creator | 모든 음원 누적 출금 가능 wei |
| Splitter `withdrawRevenue` | 없음 | 호출자 누적 잔액 전액 출금; 부분 출금 API 없음 |
| Splitter `totalPendingRevenue` | 없음 | 모든 창작자에 대한 미출금 부채 |

## 5. Backend 서명: AI → IPFS → EIP-712

Backend는 AI 결과 점수·모델 버전, canonical audioHash, 등록자 주소, 기여자/지분, 사용하지 않은 nonce, 만료 시간을 준비한다. AI score가 소수이면 정해진 반올림 정책으로 정수화하고 0~10000 범위를 확인한다. 예를 들어 `Math.round(similarity * 10000)`. 모델 결과는 인증된 AI 서버에서 받는다. 사용자가 전달한 score를 그대로 서명하지 않는다.

**최종 IPFS metadata를 먼저 업로드하고 CID를 받은 후 서명한다.** CID가 서명 데이터에 포함되므로 기존 개념 흐름의 '서명 후 IPFS 업로드' 순서는 사용할 수 없다. metadata에는 모델·검증 결과·지분·이용조건을 포함하고 signature 자체는 별도 응답에 둔다. raw CID string을 전달하며 `ipfs://`를 붙이지 않는다. 정확한 bytes를 해시하므로 CID 표현은 통일한다.

Typed Data primaryType은 `RegisterTrack`, domain은 name=`TrackAI_Registry`, version=`1`, 현재 chainId, Registry 주소다. modelVersion은 string이므로 EIP-712가 내부적으로 UTF-8 keccak256을 적용한다. 배열은 **하나의 ABI 인코딩**으로 묶어 해시한다 (`abi.encode(address[],uint256[])`), `encodePacked`나 각 배열 해시를 연결하는 방식이 아니다.

```ts
import { Wallet, Contract, JsonRpcProvider, AbiCoder, keccak256, toUtf8Bytes, randomBytes, hexlify } from "ethers";
import { readFile } from "node:fs/promises";
const provider = new JsonRpcProvider(process.env.POLYGON_AMOY_RPC_URL);
const registryABI = JSON.parse(await readFile("abi/TrackRegistry.json", "utf8"));
const marketABI = JSON.parse(await readFile("abi/LicenseMarketplace.json", "utf8"));
const nftABI = JSON.parse(await readFile("abi/LicenseNFT.json", "utf8"));
const registry = new Contract(process.env.TRACK_REGISTRY_ADDRESS!, registryABI, provider);
const verificationWallet = new Wallet(process.env.VERIFICATION_SIGNER_PRIVATE_KEY!);
if (verificationWallet.address.toLowerCase() !== (await registry.verificationSigner()).toLowerCase()) {
  throw new Error("Backend signer mismatch");
}
const domain = {
  name: "TrackAI_Registry", version: "1",
  chainId: (await provider.getNetwork()).chainId,
  verifyingContract: await registry.getAddress(),
};
const types = { RegisterTrack: [
  { name: "audioHash", type: "bytes32" },
  { name: "metadataCIDHash", type: "bytes32" },
  { name: "registrant", type: "address" },
  { name: "contributorsHash", type: "bytes32" },
  { name: "similarityScore", type: "uint256" },
  { name: "modelVersion", type: "string" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] };
// Validated data from authenticated upload + AI + final IPFS upload:
const registrantAddress = "0xCREATOR_WALLET_ADDRESS";
const contributors = ["0xCREATOR_A_ADDRESS", "0xCREATOR_B_ADDRESS"];
const shares = [60n, 40n];
const metadataCID = "FINAL_IPFS_CID";
const r = {
  audioHash: keccak256(toUtf8Bytes("CANONICAL_AUDIO_FINGERPRINT")),
  metadataCID, contributors, shares, similarityScore: 7999n,
  modelVersion: "chromaprint-clap-v1",
  nonce: BigInt(hexlify(randomBytes(32))),
  deadline: BigInt((await provider.getBlock("latest"))!.timestamp + 900),
};
if (await registry.usedNonces(registrantAddress, r.nonce)) throw new Error("Nonce collision");
const value = {
  audioHash: r.audioHash,
  metadataCIDHash: keccak256(toUtf8Bytes(metadataCID)),
  registrant: registrantAddress,
  contributorsHash: keccak256(AbiCoder.defaultAbiCoder().encode(["address[]", "uint256[]"], [contributors, shares])),
  similarityScore: r.similarityScore, modelVersion: r.modelVersion, nonce: r.nonce, deadline: r.deadline,
};
const signature = await verificationWallet.signTypedData(domain, types, value);
// API responds with r (bigints as decimal strings) + signature.
```

Nonce는 등록자별로 사용되며 성공한 등록에서만 소비된다. 실패한 tx는 nonce 소비도 롤백한다. 같은 nonce를 여러 등록 요청에 발급하지 않도록 Backend가 관리한다. 서명자는 등록자의 권한을 보증하므로 인증/지분 동의 절차가 중요하다. private key는 서버의 secret manager에서 관리한다. 현재 verifier 변경 API는 없으며 키 교체 시 새 Registry 배포/마이그레이션이 필요하다.

## 6. 등록·가격 설정·구매: 지갑 트랜잭션

등록 트랜잭션은 Backend 서명을 받은 **등록자 Frontend 지갑**이 제출한다. Backend verifier가 등록 tx를 대신 보내면 `msg.sender`가 달라 검증이 실패한다. 현재 meta-transaction/relayer는 지원하지 않는다.

```ts
import { BrowserProvider, Contract } from "ethers";
// Browser; inject ABI and addresses from configuration. r/signature from Backend.
const walletProvider = new BrowserProvider(window.ethereum);
const creatorSigner = await walletProvider.getSigner();
const creatorRegistry = new Contract(REGISTRY_ADDRESS, registryABI, creatorSigner);
const tx = await creatorRegistry.registerTrack(r, signature);
const receipt = await tx.wait();
if (!receipt || receipt.status !== 1) throw new Error("Registration failed");
const event = receipt.logs
  .filter((log: any) => log.address.toLowerCase() === REGISTRY_ADDRESS.toLowerCase())
  .map((log: any) => creatorRegistry.interface.parseLog(log))
  .find((event: any) => event?.name === "TrackRegistered");
const trackId = event!.args.trackId;
// Price is decided by the registrant, not by verification signer:
const creatorMarket = new Contract(MARKET_ADDRESS, marketABI, creatorSigner);
await (await creatorMarket.setLicensePrice(trackId, priceWei)).wait();
```

구매도 **구매자 Frontend 지갑**이 실행한다. Backend가 실행하면 Backend가 NFT 소유자가 된다. 구매 UI는 등록 상태와 `getVerification`을 조회하고 WARN 고지를 표시한다. 가격 변경과 실제 tx 사이에 경쟁이 있으면 정확한 결제 검사에서 revert하므로 새 가격을 조회 후 다시 동의받는다.

```ts
const buyerSigner = await walletProvider.getSigner(); // buyer's active wallet
const buyerMarket = new Contract(MARKET_ADDRESS, marketABI, buyerSigner);
const verification = await creatorRegistry.getVerification(trackId);
if (verification.status === 2n) throw new Error("HOLD: unavailable");
// status===1n: show WARN disclosure before submitting the wallet request.
const priceWei = await buyerMarket.getLicensePrice(trackId);
if (priceWei === 0n) throw new Error("Not listed");
const buyTx = await buyerMarket.purchaseLicense(trackId, { value: priceWei });
const buyReceipt = await buyTx.wait();
if (!buyReceipt || buyReceipt.status !== 1) throw new Error("Purchase failed");
const nft = new Contract(NFT_ADDRESS, nftABI, provider);
const hasLicense = await nft.hasLicense(await buyerSigner.getAddress(), trackId);
```

## 7. 이벤트 확인·구독·DB 책임

필수 이벤트는 TrackRegistered, VerificationRecorded, LicensePriceUpdated, LicensePurchased, LicenseMinted, RevenueAllocated, RevenueWithdrawn이다. 음원 ID/구매자/기여자를 indexed로 검색한다. 생성 이벤트에 CID, 검증 이벤트에 점수·모델, 구매 이벤트에 status 및 native amount(wei), 발급 이벤트에 tokenId·수량(1)이 기록된다. timestamp는 block timestamp(초)다.

Backend는 `LicensePurchased`를 완료 기준으로 사용한다. txHash만 수신했다는 이유로 구매 완료를 기록하지 않는다. receipt status=1, 계약 주소, chainId, buyer, trackId, 금액을 확인한다. NFT 발급/수익 기록과 구매 이벤트는 동일 tx에서 원자적으로 완료된다.

```ts
const marketplace = new Contract(process.env.LICENSE_MARKETPLACE_ADDRESS!, marketABI, provider);
marketplace.on("LicensePurchased", async (trackId, tokenId, buyer, amount, status, timestamp, payload) => {
  const log = payload.log;
  const receipt = await provider.getTransactionReceipt(log.transactionHash);
  if (!receipt || receipt.status !== 1) return;
  // Enqueue reconciliation; persist chainId, txHash, log.index, blockNumber/blockHash.
  // Wait your configured confirmations, then upsert My License idempotently.
});
// Reconnect/restart: backfill logs from last confirmed checkpoint in bounded ranges.
const logs = await marketplace.queryFilter(marketplace.filters.LicensePurchased(), fromBlock, toBlock);
// Filter one wallet:
const mine = await marketplace.queryFilter(marketplace.filters.LicensePurchased(null, null, buyerAddress), fromBlock, toBlock);
// HTTP RPC polling is supported; subscriptions alone miss offline periods.
```

Prisma/MySQL는 검색용 메타데이터·UI 위험 고지·서명 발급 내역·트랜잭션 상태·이벤트 인덱스를 저장한다. 소유권, 가격 권한, 지급액, 등록 중복, 서명 사용 여부의 최종 근거는 온체인이다. 이벤트 DB 유일키는 `(chainId, txHash, logIndex)`. 주소는 checksum으로 표시하고 검색은 정규화한다. reorg 발생 시 blockHash 검증/확정 체크포인트 이전의 인덱스 롤백과 재수집이 필요하다. RPC의 로그 범위 제한을 고려해 chunk 조회한다.

## 8. 수익 및 오류

구매액 100wei, 60:40은 60/40; 101wei는 60/41이다. 마지막 기여자는 정수 나눗셈 잔여액을 받는다. 배열 순서도 서명에 포함된다. 총 배분은 항상 구매액과 같으며 수수료는 없다. `withdrawRevenue`는 누적 전액만 출금하므로 금액 초과 요청이 불가능하다. 출금 외부 송금 실패 시 잔액 복원. 수신할 수 없는 계약 기여자는 현재 다른 주소로 지급받는 API가 없으므로 Backend 등록 단계에서 수신 가능성을 확인한다.

| Custom error | 원인 / 처리 |
|---|---|
| InvalidInput | zero verifier/hash 또는 빈 CID/modelVersion |
| InvalidContributors | 빈 배열, 길이 불일치, zero 주소 |
| InvalidShares | 0 또는 100 초과 지분, 합계 100 아님 |
| DuplicateContributor | 중복 주소 |
| DuplicateAudioHash | 동일 해시 이미 등록 |
| InvalidScore | 점수 10000 초과 |
| SignatureExpired | deadline 경과; 새 검증 서명 요청 |
| NonceAlreadyUsed | 등록자별 nonce 재사용 |
| InvalidSignature | 서명자, 등록자, CID, 배열, domain 등 불일치 |
| ECDSAInvalidSignature / ECDSAInvalidSignatureLength / ECDSAInvalidSignatureS | 잘못된 ECDSA 인코딩 |
| TrackNotFound | 존재하지 않는 ID 조회/구매 |
| TrackNotLicensable | HOLD/미등록 라이선스 발급 |
| UnauthorizedPriceSetter | 등록자/승인 관리자 아님 |
| InvalidPrice | 가격 0 또는 미판매 |
| IncorrectPayment(expected,received) | 부족/초과 지불, 정확한 msg.value 필요 |
| AlreadyLicensed | 같은 구매자·음원 중복 구매 |
| OnlyMarketplace | 직접 NFT 민팅/수익 기록 불가 |
| InvalidMarketplace / MarketplaceAlreadySet | 바인딩 주소가 계약이 아니거나 이미 설정됨 |
| NonTransferable | 개별/배치 전송, operator 승인 차단 |
| NoRevenue | 출금 가능 잔액 없음 / 이중 출금 |
| TransferFailed | 창작자 수신 계약이 native 송금 거부 |
| ZeroRevenue | 수익 기록 금액 0 |
| ReentrancyGuardReentrantCall | 구매/출금 재진입 |
| OwnableUnauthorizedAccount | owner 전용 관리 호출 |
| ERC1155InvalidReceiver | 수신 계약이 ERC1155 수신 인터페이스 미지원 |

컨트랙트 수신자가 자체 revert 사유를 전파할 수도 있다. ethers 오류의 revert data를 해당 ABI의 `interface.parseError(data)`로 해석하고, 실제 tx 실패는 receipt로 재확인한다.

## 9. 호환성 및 MVP 한계

기존 `AudioLicense.registerAndMint`, `audioRecords`, `getCreatorsAndShares` ABI는 안전한 역할 분리에 맞춰 제거했다. AudioLicense 배포 이름은 TrackRegistry를 상속하는 compatibility 이름으로만 남긴다. 기존 시험 한 건의 해시/CID/60:40/서명 검증은 새 실제 서명 통합 테스트에서 회귀 검증한다. 기존 서명 domain/type은 재사용할 수 없으므로 새 Backend API/Frontend ABI로 함께 전환해야 한다. 기존 온체인 배포는 수정되지 않으며 자동 데이터 이전은 구현하지 않았다.

MVP에는 verifier 회전, 분쟁 상태 변경, contributor 변경, 라이선스 만료/환불/재판매, 플랫폼 수수료, 가스 대납, paginated 구매 목록이 없다. 대규모 목록은 이벤트 인덱스로 조회한다. 라이선스 metadata는 현재 음원 metadata를 사용하므로 상업 이용조건은 CID 문서에 명시한다. AI 서버·IPFS 업로드·Express/Prisma 서비스 자체 구현은 이 스마트 컨트랙트 프로젝트 범위 밖이다. 실제 Amoy 배포 및 explorer 검증은 유효한 RPC/주소/자금/키를 주입한 환경에서 수행해야 한다.
