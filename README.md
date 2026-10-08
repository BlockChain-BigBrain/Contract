# Track-AI contracts

AI 음악 창작 증명과 양도 불가능한 상업 이용권 거래를 분리한 Solidity 프로젝트입니다.

`TrackRegistry` → `LicenseMarketplace` → `RevenueSplitter` + `LicenseNFT`

실제 AI 검증자 EIP-712 서명으로 음원을 등록하고 PASS/WARN 음원 이용권을 정확한 네이티브 토큰 금액으로 구매합니다. HOLD는 등록 가능하지만 구매 불가입니다. 기여자 지분은 정수 % 합계 100이며 불변입니다. 수익은 기여자가 직접 출금합니다.

```sh
npm ci
npm run build
npm run typecheck
npm test
npm run abi
```

Polygon Amoy(chainId 80002) 배포: `.env.example`의 환경 변수를 shell에 주입한 뒤 `npm run deploy:amoy`. 메인넷 배포는 스크립트에서 차단합니다. 컨트랙트 주소는 `deployments/80002.json`, 연동 ABI는 `abi/*.json`에 기록됩니다.

서명 구조, 함수, 이벤트, 오류, 지갑 호출, 배포 절차는 [Backend 연동 문서](docs/BACKEND_INTEGRATION.md)를 참조하세요. 변경 및 검증 결과는 [구현 보고서](docs/IMPLEMENTATION_REPORT.md)에 기록합니다.

기존 `AudioLicense` 이름은 등록 전용 `TrackRegistry` 상속 계약으로 남겼습니다. 기존 `registerAndMint` API와 서명은 새 역할 분리와 보안 정책에 맞춰 교체해야 합니다.
