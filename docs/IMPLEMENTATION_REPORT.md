# Track-AI 구현 결과 — 2026-10-08

## 1. 기존 코드에서 발견한 문제

- 서명이 등록자 주소를 포함하지 않아 제3자가 공개된 서명을 사용해 자신의 계정으로 NFT를 발급받을 수 있었다.
- nonce/deadline이 없어 검증 승인 유효기간 및 요청 재사용을 별도로 통제할 수 없었다. 기존 hash/token 중복 검사만 있었다.
- 기여자의 zero 주소/중복/0 지분 및 점수 범위를 검증하지 않았다.
- 창작 증명 등록이 ERC-1155 민팅과 결합돼 구매 이용권과 구분되지 않았고 일반 전송이 가능했다.
- 기존 0~100, 85 이상 hold 정책이 새 0~10000 PASS/WARN/HOLD 요구사항과 달랐다.
- 결제/가격 권한/수익 분배 기능이 없었다.
- Counter 배포 모듈은 실제 Counter 계약 없이 남아 있었고 OP 스크립트는 없는 네트워크를 사용했다. npm test도 오류 placeholder였다.

## 2. 수정·생성·정리 파일

신규:

- `contracts/TrackRegistry.sol`
- `contracts/LicenseNFT.sol`
- `contracts/LicenseMarketplace.sol`
- `contracts/RevenueSplitter.sol`
- `contracts/MarketplaceBound.sol` — 공통 owner 초기 설정/한 번의 Marketplace 연결
- `contracts/test/AdversarialReceiver.sol` — 실제 수신·거부·재진입 테스트 계약
- `test/TrackAI.test.ts` — 실제 EIP-712 및 네 계약 통합 테스트
- `test/RevenueConservation.t.sol` — 실제 서명 등록·구매·출금 수익 보존 fuzz 테스트
- `scripts/deploy.ts`, `scripts/export-abi.ts`
- `.env.example`
- `abi/{TrackRegistry,LicenseNFT,LicenseMarketplace,RevenueSplitter}.json`
- `deployments/31337.json` — 실행한 임시 로컬 배포 manifest
- `docs/BACKEND_INTEGRATION.md`, `docs/IMPLEMENTATION_REPORT.md`

수정: `contracts/AudioLicense.sol`, `hardhat.config.ts`, `package.json`, `README.md`.

정리: `ignition/modules/Counter.ts`, `scripts/send-op-tx.ts`, 기존 `test/AudioLicense.test.ts`.

`.gitignore`는 기존 `.env`, `.env.*` 제외 및 `.env.example` 예외가 적절해 그대로 유지했다. 새로운 라이브러리는 추가하지 않았고 lockfile도 기존 내용을 유지했다. 설치된 버전: Hardhat 3.18.0, ethers 6.17.0, OpenZeppelin 5.6.1. Solidity 0.8.24/cancun/optimizer 유지, EIP-712 tuple 컴파일을 위해 viaIR 활성화.

## 3. 계약별 주요 함수

| 계약 | 주요 함수 |
|---|---|
| TrackRegistry | registerTrack, getTrack, getContributors, getVerification, isTrackLicensable |
| LicenseNFT | mintLicense(Marketplace only), getTokenId, hasLicense, balanceOf, getPurchasedTrackIds, uri |
| LicenseMarketplace | setLicensePrice, getLicensePrice, purchaseLicense, setPriceManager(owner only) |
| RevenueSplitter | recordRevenue(Marketplace only), getPendingRevenue, withdrawRevenue, totalPendingRevenue |

기여 지분은 불변 정수 % 합계 100. tokenId=trackId, COMMERCIAL=0만 지원. 구매자당 음원 라이선스 1개. 승인된 가격 관리자는 owner가 명시적으로 허용한다. NFT와 Splitter는 owner가 실제 Marketplace 주소에 한 번 연결하며 이후 변경 불가.

필수 7개 이벤트를 구현했다. 구매액은 정확히 가격과 일치해야 하며 초과 결제도 실패한다. 수익 분배는 앞선 기여자에게 내림 계산, 마지막 서명된 기여자에게 잔여액 배분. 수수료 없음. 출금은 누적 전액이며 재진입 방지와 checks-effects-interactions 적용.

## 4. 전체 흐름

등록자 업로드 → Backend 인증/기여자 동의 확인 → AI 서버 점수/모델 버전 반환 → 최종 IPFS metadata 업로드 및 CID 확정 → Backend EIP-712 서명 → 등록자 지갑 registerTrack → TrackRegistered/VerificationRecorded → 등록자/승인 관리자 가격 설정.

구매자 조회 → PASS/WARN 확인 및 WARN UI 고지 → 구매자 지갑 purchaseLicense(정확한 wei) → Splitter에 수익 기록 → 구매자 NFT 발급 → LicensePurchased → Backend receipt/이벤트 확인 및 DB 반영 → 창작자 직접 withdrawRevenue.

HOLD는 창작 증명 기록 가능, 상업 구매 불가. 같은 audioHash 재등록은 항상 거부. NFT mint 실패 시 수익 기록과 모든 결제/발급 상태가 동일 tx에서 롤백된다. 창작자 송금은 구매 중 실행하지 않아 수신 실패가 구매를 막지 않는다.

## 5. EIP-712 데이터 구조

Domain: `name=TrackAI_Registry`, `version=1`, 현재 chainId, Registry verifyingContract.

```text
RegisterTrack(
  bytes32 audioHash,
  bytes32 metadataCIDHash,
  address registrant,
  bytes32 contributorsHash,
  uint256 similarityScore,
  string modelVersion,
  uint256 nonce,
  uint256 deadline
)
```

CID hash는 `keccak256(bytes(metadataCID))`; contributorsHash는 `keccak256(abi.encode(address[] contributors,uint256[] shares))`. registrant는 msg.sender와 일치해야 한다. 모델 버전 string은 EIP-712 규칙으로 해시된다. nonce는 registrant별로 소비하고 deadline이 지난 서명은 거부한다. 다른 체인/다른 Registry domain의 서명도 거부한다. 승인 서명자는 immutable nonzero 주소이고 private key는 온체인에 없다.

## 6. 실제 검증 결과

- `npx hardhat build`: 성공, solc 0.8.24.
- `npx tsc --noEmit`: 성공.
- `npx hardhat test`: **51 passing, 0 failing (50 Mocha + 1 Solidity fuzz)**.
- Solidity fuzz는 **256 runs**로 다양한 가격/지분에 대해 실제 EIP-712 등록 → 구매 → 분배 → 출금 후 수익 보존을 검증했다.
- 회귀: original fingerprint/CID/기여자 60:40 기록 및 실제 승인 서명 확인을 새 테스트에서 검증했다. 기존의 '등록 시 NFT 발급'은 의도적으로 '등록 기록 후 별도 구매 NFT'로 교체했으므로 기존 테스트는 그대로 유지하지 않았다.
- 보안: 선점, nonce 재사용, 만료, 서명 필드 변조, chain/contract domain replay, 기여 지분 오류, 상태 경계, 권한 없는 가격/발급/수익 기록, 전송, 과소/과다 결제, 중복 구매, ERC-1155 수신 거부 롤백, 출금/구매 재진입, 송금 실패 잔액 복원, rounding 검증.
- `npx hardhat run scripts/export-abi.ts`: 성공, 네 ABI JSON 생성.
- `scripts/deploy.ts` 로컬 실행: 성공, 네 계약 배포 및 두 Marketplace binding 확인.
- 검증자 주소 누락: 명시적 VERIFICATION_SIGNER_ADDRESS 오류, RPC/배포 키 누락: 각각 Hardhat HHE7 변수명 오류를 실제 확인했다. 이들은 기대한 실패 결과다.
- `git diff --check`: 통과.

초기 테스트 코드의 비지원 matcher chaining과 fuzz 계정의 EVM 예약 주소 사용을 수정한 뒤 전체 테스트를 재실행해 위 결과를 얻었다. 외부 서비스나 실제 테스트넷 트랜잭션 성공을 이 결과에 포함하지 않는다.

## 7. 배포 방법·결과

환경 변수를 shell에 주입 후 `npm run deploy:amoy`. Polygon 공식 네트워크 정보 기준 Amoy chainId 80002/POL, local chainId 31337만 배포 스크립트가 허용한다. 배포 순서 및 explorer 검증 명령은 BACKEND_INTEGRATION.md 참조. explorer 검증은 배포와 같은 default 빌드 프로필을 사용한다.

실행한 **임시 로컬** 배포:

| 계약 | local address |
|---|---|
| TrackRegistry | 0x5FbDB2315678afecb367f032d93F642f64180aa3 |
| LicenseNFT | 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 |
| RevenueSplitter | 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0 |
| LicenseMarketplace | 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 |

시뮬레이션 종료 후 이 주소에 연결할 수 없다. 운영/Amoy 주소로 사용하면 안 된다. 실제 Amoy 배포와 explorer 검증은 실행하지 않았다. 유효한 RPC/검증자 주소/배포 키 및 테스트 토큰이 제공되지 않았기 때문이다. 메인넷 배포와 Git commit/push는 수행하지 않았다.

## 8. Backend 연동 산출물

- ABI: `abi/*.json`, 원본 `artifacts/contracts/<Name>.sol/<Name>.json`.
- 주소: 배포 시 `deployments/<chainId>.json` 출력, Amoy 배포 후 환경 변수 네 개에 대응.
- 변수: POLYGON_AMOY_RPC_URL, DEPLOYER_PRIVATE_KEY(배포만), VERIFICATION_SIGNER_ADDRESS, POLYGONSCAN_API_KEY(explorer Etherscan provider API 키), VERIFICATION_SIGNER_PRIVATE_KEY(Backend만), TRACK_REGISTRY_ADDRESS, LICENSE_NFT_ADDRESS, LICENSE_MARKETPLACE_ADDRESS, REVENUE_SPLITTER_ADDRESS.
- `docs/BACKEND_INTEGRATION.md`에 함수/반환값, 서명 생성 TS, 등록/구매 지갑 호출, 이벤트 구독/백필/DB 멱등성, 실패 원인 및 배포 방법 제공.

## 9. 미구현·추가 결정 사항

- 실제 Amoy 배포/소스 검증, AI/FastAPI/IPFS/Express/Prisma 및 Frontend 연결은 별도 환경에서 수행해야 한다.
- WARN 고지 UI/동의 기록, AI canonical hash 생성 및 완전 중복 탐지 기준은 오프체인 책임이다.
- 검증자 회전/분쟁 상태 갱신/기여자 변경/기존 온체인 데이터 마이그레이션은 미구현.
- 만료/환불/수수료/양도/가스 대납/구매 목록 페이지 API는 MVP에서 제외.
- 이용권 metadata는 등록 음원 CID를 사용하므로 실제 상업 이용조건을 metadata에 담아야 한다.
- verifier와 Marketplace binding을 immutable/one-time으로 두었으므로 키 교체 및 주소 오설정에 대한 운영 절차를 결정해야 한다.

참고: [OpenZeppelin ERC-1155](https://docs.openzeppelin.com/contracts/5.x/api/token/erc1155), [Hardhat 설정](https://hardhat.org/docs/reference/configuration), [Hardhat 소스 검증](https://hardhat.org/docs/plugins/hardhat-verify), [Polygon 네트워크 정보](https://docs.polygon.technology/pos/reference/rpc-endpoints).
