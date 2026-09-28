# Mainnet readiness checklist

Nothing in this repository targets mainnet. `assertSepolia()` throws if `NEXT_PUBLIC_STARKNET_CHAIN_ID` is anything but `SN_SEPOLIA`, the scripts exit on any other chain id, and no mainnet address is configured anywhere. Do not change that until every item below is done and signed off separately from this PR.

## Anonymity, must all be true

- [ ] A private bond path exists on the target network with a session-bound admission receipt that the server verifies without learning the payer.
- [ ] A refund path exists that does not re-link the payer, demonstrated with two unrelated funded wallets, RPC inspection, and an explorer walk-through, recorded in docs.
- [ ] IP and timing analysis performed and mitigations deployed (onion service or equivalent, randomized publication delay).
- [ ] The privacy pool address, version, and audit report were confirmed with StarkWare, and the pool fee (2 STRK on Sepolia at the time of writing) was reconciled with the "source pays only network fees" rule.
- [ ] The encrypted tip path, if offered, was proven end to end: encryption, pool invoke, discovery, decryption, retry, receipt.
- [ ] Reclaim provider template reviewed so that only the minimum field is disclosed, with the provider version pinned and checked.

## Confidentiality

- [ ] Either a verified hardware attestation (measured build, quote verified against the image digest, published verification procedure) or an explicit product decision that external AI processing is acceptable, with the disclosure copy reviewed by counsel.
- [ ] Session store encrypted at rest and multi-instance safe, or replaced.
- [ ] Log audit confirming no request bodies, tokens, proofs, or IPs are retained beyond rate limiting.

## Contracts

- [ ] Independent audit of `article_registry` (and `tip_inbox` if used).
- [ ] Mainnet class declared from a reproducible build; class hash recorded.
- [ ] Owner key in a hardware wallet or multisig; publisher key in a KMS with rotation runbook tested via `set_publisher`.
- [ ] Article size limit re-derived from mainnet fee measurements for short, typical, and long articles.
- [ ] Legal review of immutable publication (no takedown is possible).

## Operations

- [ ] Keyed RPC provider with an SLA; public endpoints are not acceptable.
- [ ] Publisher account funding and alerting.
- [ ] Incident plan for a leaked publisher key (rotate via owner, announce the block height from which articles are untrusted).
- [ ] Rate limiting backed by a shared store, not the local file.
- [ ] Separate mainnet configuration file, never merged into `.env.example`, and a deploy gate that requires a second approver.

## Product

- [ ] Editorial process for the "independently corroborated" label, which the software never sets on its own.
- [ ] Source-facing documentation of exactly what is public, reviewed by someone who has not read the code.
