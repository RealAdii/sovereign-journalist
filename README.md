# Sovereign Journalist (Starknet Sepolia)

A source proves a credential with [Reclaim Protocol](https://reclaimprotocol.org), is interviewed by an AI, edits and approves an article, and the **entire approved article** is written into a Cairo contract on **Starknet Sepolia**. Readers, and anyone with an RPC endpoint, read it back from the chain. Nothing about the source, the interview, or the credential goes onchain.

This is a testnet build. The registry is deployed on Sepolia at `0x2be142c378dbf4f9480196d484b9e22363887ef523ee3cde332a4fa2fe4f6f0` (see docs/TEST_REPORT.md for class hash, transactions, and measured fees). Mainnet is not configured and is refused by the code. Read [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for what is proven, what is blocked, and why.

## Honest summary of the privacy boundary

- **Reclaim proves a login, not a claim.** The proof discloses whatever the provider template extracts. The UI shows the disclosed field names after verification.
- **Google receives the interview.** Every interview message and the draft article are sent to the Gemini API. There is no confidential compute and no attestation in this build; `/api/attestation` says so.
- **The article is public forever.** Only text the source approved is written, by the operator's publisher account, never by the source's wallet.
- **The anonymous 1 STRK bond is blocked.** No verified private payment and refund path exists on Sepolia yet, so the server refuses every bond receipt rather than accept a public transfer that would link the source. Interview and publishing are therefore disabled unless the development bypass is on.
- **Encrypted tips are blocked.** The STRK20 private messaging page is an RFP, not an API. A helper contract is drafted and tested but not deployed or wired.

Labels used in articles: **credential proven** (Reclaim proof verified), **allegation reported** (the source's account), **not independently corroborated** (the software never sets a corroborated label).

## Flow

1. `/submit`: privacy limits, costs, and live capability status.
2. `/submit/verify`: server creates a signed Reclaim request bound to a fresh challenge, the browser runs the flow, the server verifies the proof once and issues a 2 hour token plus a recovery code.
3. `/submit/bond`: shows the 1 STRK Sepolia bond, currently blocked with the missing dependencies.
4. `/submit/interview`: disclosure gate, then the interview, then the editor with byte counters, a Sepolia fee estimate, and an irreversibility acknowledgement.
5. Publish: the server submits `publish_article`, waits for `ACCEPTED_ON_L2`, reads every chunk back and compares byte for byte, then shows the article id and transaction.
6. `/article/<id>`: rendered from Starknet with a provenance panel. Legacy `/article/<cid>` links render read-only from IPFS.
7. `/submit/recover`: recovery code entry after a lost tab or failed request.

## Repository layout

```
contracts/article_registry   append-only Cairo registry (title, subtitle, body as 31-byte chunks)
contracts/tip_inbox          draft STRK20 privacy_invoke helper for encrypted tips (not deployed)
src/app/api                  verify/start, verify, recover, cancel, bond, tips, interview, generate,
                             publish/estimate, publish, articles, articles/[id], capabilities, attestation
src/lib                      onchain.ts (encoding, fee, publish, read-back), session.ts (one-use store),
                             reclaim.ts, gemini.ts, capabilities.ts, request.ts, legacy.ts
scripts                      check-sepolia, deploy-sepolia, benchmark-articles, readback-verify, check-dashes
tests                        vitest unit and route tests
docs                         ARCHITECTURE, THREAT_MODEL, COMPATIBILITY, MIGRATION, MAINNET_CHECKLIST, TEST_REPORT
```

## Running locally

Requirements: Node 22, npm, Scarb 2.14.0, Starknet Foundry 0.57.0.

```bash
npm ci
cp .env.example .env.local        # fill in the server-only values you have
npm run typecheck && npm run lint && npm test && npm run build
npx playwright install chromium && npm run test:e2e   # browser flow tests with a mocked backend
npm run build:contracts && npm run test:contracts
npm run check:sepolia             # read-only, works with no secrets
npm run dev                       # http://localhost:3000
```

To exercise the interview and publishing locally without a bond, set `ALLOW_DEV_WITHOUT_PRIVATE_BOND=true` in `.env.local`. This is refused when `NODE_ENV=production` and the UI states that no anonymity is claimed.

### Environment

All secrets are server-only. No `NEXT_PUBLIC_*` variable holds a secret. See `.env.example` and [docs/MIGRATION.md](docs/MIGRATION.md) for the required Reclaim secret rotation.

| Variable | Purpose |
| --- | --- |
| `STARKNET_SEPOLIA_RPC_URL` | keyed Sepolia RPC (public fallbacks are listed in docs/COMPATIBILITY.md) |
| `NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS` | deployed registry, from `npm run deploy:sepolia` |
| `STARKNET_PUBLISHER_ADDRESS`, `STARKNET_PUBLISHER_PRIVATE_KEY` | the only account allowed to publish, funded with Sepolia STRK |
| `RECLAIM_APP_ID`, `RECLAIM_APP_SECRET`, `RECLAIM_PROVIDER_ID` | Reclaim, server side only |
| `GEMINI_API_KEY` | Google Gemini |
| `SESSION_SECRET`, `RATE_LIMIT_SECRET` | two independent random values, 32+ characters, no fallback |
| `SESSION_STORE_PATH` | file for the one-use session store, required in production, single instance only |
| `NEXT_PUBLIC_STRK20_POOL_ADDRESS` | Sepolia privacy pool, used only for the live capability check |

## Deploying the contract to Sepolia

```bash
npm run build:contracts
npm run deploy:sepolia        # declares, deploys, writes deployments/sepolia.json
npm run benchmark:sepolia     # publishes short, typical, long fixtures and records fees and latency
npm run readback:sepolia -- <articleId> [expected.json]   # independent byte-for-byte read-back
```

These need a funded publisher account and were not run for this change (no secrets were available). [docs/TEST_REPORT.md](docs/TEST_REPORT.md) lists exactly what ran.

## Contract

`ArticleRegistry` stores full UTF-8 title (up to 180 bytes), subtitle (up to 420), and body (contract cap 24576, product limit 16384 set from the Sepolia benchmark: about 0.36 STRK per KB and 20 s to confirm) as 31-byte felt chunks in persistent storage, with byte lengths, chunk counts, publish timestamp, version, and the approved digest. The article id is the digest of the approved text, so a changed preview cannot be published under an approved id. Only the configured publisher can write; duplicates are rejected; reads are paginated (128 chunks per call). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): diagram, encoding, contract interface
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md): who sees what, threats, mitigations, explicit non-claims
- [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md): versions, RPC checks, pool check, bond and tip blockers
- [docs/MIGRATION.md](docs/MIGRATION.md): IPFS and EigenCompute to Sepolia, legacy links, secret rotation
- [docs/MAINNET_CHECKLIST.md](docs/MAINNET_CHECKLIST.md): separate gate before any mainnet work
- [docs/TEST_REPORT.md](docs/TEST_REPORT.md): actual outputs and what was not run

## Built with

[Reclaim Protocol](https://reclaimprotocol.org) · [Starknet](https://docs.starknet.io/) · [starknet.js 10.4.0](https://github.com/starknet-io/starknet.js) · [STRK20](https://strk20.starknet.io/) (blocked paths) · [Google Gemini](https://ai.google.dev)
