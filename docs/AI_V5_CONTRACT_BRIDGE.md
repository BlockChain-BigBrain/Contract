# Track-AI v5 ↔ Contract integration boundary

This document is the authoritative bridge between the current AI verifier and the
on-chain contracts. It does not change the Solidity contracts or the AI model.

## Runtime boundary

The Contract does **not** run LAION-CLAP, Chromaprint, or the v5 temporal verifier.
The supported flow is:

```text
AI server (v5 evidence)
  -> Backend v5 adapter (validate policy + normalize canonical band)
  -> EIP-712 signature over RegisterTrack
  -> TrackRegistry (signature, score range, nonce/deadline, status)
  -> LicenseMarketplace / LicenseNFT (HOLD purchase restriction)
```

Adding a direct AI-server-to-Contract call would duplicate policy logic and would
not make the model evidence verifiable on-chain. The Backend signer is therefore
the trust boundary. Its private key must remain server-side and must match
`TrackRegistry.verificationSigner()`.

## AI v5 evidence and canonical on-chain fields

The Backend must validate these exact AI v5 values before signing:

| Field | Required value / rule |
| --- | --- |
| `modelVersion` | `laion/clap-htsat-unfused` |
| `scoreVersion` | `hybrid_query_top3_pairwise_hold-v5` |
| `decisionPolicyVersion` | `track-ai-balanced-policy-v5-20261102` |
| WARN boundary | `queryVerifierScore >= 0.351229127861893` |
| HOLD boundary | `similarityScore >= 0.9471999941293027` |
| BLOCK | Chromaprint exact duplicate; do not register on-chain |

Raw v5 scores, thresholds, matched segments, provenance, and the decision reason
remain in the Backend evidence JSON and/or the IPFS metadata whose CID is signed
as `metadataCIDHash`. They are intentionally not added to the Solidity payload.

The existing `RegisterTrack` EIP-712 payload remains unchanged:

```text
audioHash, metadataCIDHash, registrant, contributorsHash,
similarityScore, modelVersion, nonce, deadline
```

`similarityScore` is the normalized 0..10000 transaction band, not a replacement
for the raw v5 verifier scores. The Backend maps the validated decision to the
existing Contract bands:

| Canonical score | Contract status | Marketplace behavior |
| ---: | --- | --- |
| `0..7999` | PASS | licensable |
| `8000..8499` | WARN | licensable; UI must show review warning |
| `8500..10000` | HOLD | registration can be recorded, but purchase/NFT issuance is rejected |

An exact duplicate (`BLOCK`) is rejected by the Backend before `registerTrack`;
the Contract enum intentionally has no `BLOCK` status.

## Contract-side invariants

- `TrackRegistry` accepts only a non-zero signer, valid EIP-712 domain, unused
  nonce, unexpired deadline, and score in `0..10000`.
- Status boundaries are fixed at 8000 and 8500 (`PASS < 8000`,
  `WARN < 8500`, otherwise `HOLD`).
- `LicenseMarketplace` and `LicenseNFT` both call `isTrackLicensable`; HOLD is
  therefore blocked even if the track record exists.
- The Contract does not infer causality from similar segments and does not verify
  the AI model itself. On-chain data proves the signed canonical result; the
  metadata/evidence hash provides the audit link to the v5 analysis.

## Release checklist

1. Backend validates the complete v5 response and rejects legacy policy versions.
2. Backend stores raw evidence and final metadata, then signs the CID hash and
   canonical score band.
3. Frontend displays v5 provenance and the same 0.80/0.85 Contract bands.
4. Contract addresses, chain ID, and EIP-712 domain match the deployed Registry.
5. Never send an exact duplicate or a HOLD purchase request to the marketplace.

