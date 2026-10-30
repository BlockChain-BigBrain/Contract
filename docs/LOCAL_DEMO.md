# Local demo integration

`feature/audio-license-local-demo` introduced a saved signature demo for the old
`AudioLicense.registerAndMint` API. That API is incompatible with main. Its demo
intent is ported here to TrackRegistry, LicenseMarketplace, LicenseNFT and
RevenueSplitter; main's deployment script, ABI and contract security remain the
basis of integration. The ancestor `feature/audio-license` has no additional
commits to merge into main.

## Run

```sh
npm ci
npm run build
npm run typecheck
npm test
npm run demo:local
```

`demo:local` creates an isolated Hardhat chain, deploys all four contracts and
confirms both Marketplace bindings. It checks real EIP-712 signing, registration
without minting, rejection of a forged signature, HOLD registration/purchase
blocking, a 101 wei purchase, ERC-1155 ownership, duplicate purchase rejection,
60:40 allocation as 60/41 wei and both contributors withdrawing all revenue.
Failed assertions exit nonzero. JSON and Markdown reports are saved under
`test-results/`, including transaction hashes but no private keys.

The audio hashes are SHA-256 hashes of synthetic fixture strings, the metadata
CID is a clearly marked placeholder, and modelVersion is `demo-fixture-v1`.
This verifies contracts only: it does not run FastAPI, upload IPFS content or
synchronize the application DB. Score scale is 0..10000 (PASS 7200, HOLD 9100),
and contributorsHash is keccak256(abi.encode(address[], uint256[])).

For a persistent local RPC, start `npx hardhat node` in another terminal and run
`npm run demo:localhost`. Each demo deploys a fresh independent suite; it does
not overwrite `deployments/31337.json`. Its addresses do not automatically update
the backend manifest. Use the existing deployment/import procedure for backend
integration. Never use local test addresses as Amoy deployment information.

## Verification signer utility

```sh
npm run signer:generate
```

Creates a random signer in `.env.verification-signer`, which is already excluded
by `.gitignore`, with permissions 0600. Prints the public address only and refuses
to overwrite an existing file. It does not set environment variables automatically.
Configure the address when deploying and securely load the matching key into the
backend signing environment. The demo itself uses local Hardhat test accounts,
so it needs no production secrets or dotenv dependency.

Old register-test/deployment scripts and their old-API results are intentionally
not copied over: the new single demo covers their scenarios with the current API.
Original historical results remain available on the local-demo source branch.
