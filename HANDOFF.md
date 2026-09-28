# Sovereign Journalist Sepolia handoff

Last updated: 2026-09-28 16:05 Asia/Kolkata (agent 2, Claude, continuing from Codex). Earlier timestamps in this file from agent 2 were about 25 minutes ahead of wall clock.

## Objective

Build the Sepolia-only version specified in `Downloads/Sovereign_Journalist_Sepolia_Build_Prompt.md` with honest privacy boundaries, Cairo contracts, tests, documentation, and a new repository. Do not enable mainnet or describe an unproven path as anonymous.

## Repository

- Working directory: `/Users/adithya/sovereign-journalist-sepolia`
- Source remote: `https://github.com/RealAdii/sovereign-journalist.git`
- Branch: `sepolia-rewrite` (created from `main`). Nothing is committed yet; the user must ask before commits or pushes.
- GitHub CLI authentication is expired for both configured accounts. A new GitHub repository cannot be created until `gh auth login -h github.com` is completed.

## Product decisions

- Public articles will be stored completely in a Starknet Cairo contract and read directly from Starknet.
- Reclaim requests must start on the server. Proofs must be cryptographically verified, bound to a fresh challenge, and consumed once.
- Gemini receives the interview and article text. The UI and docs must disclose this.
- Environment-variable-only TEE claims must be removed.
- Anonymous STRK20 bonded interviews remain blocked unless a live Sepolia pool, compatible wallet, session-bound private receipt, and unlinkable refund can be demonstrated.
- Encrypted STRK20 messaging is currently an RFP, not a shipped `sendMessage` API. A draft helper contract is included but must stay capability-gated until the pool, wallet, deployment, indexer, and recipient decryption path pass live checks.
- Development can optionally bypass the private bond only with `ALLOW_DEV_WITHOUT_PRIVATE_BOND=true`, never in production and never with anonymity claims.

## Measured facts (2026-09-28 15:45)

- Blast API Sepolia RPC is dead (returns an error telling users to migrate). Do not use it anywhere, including `contracts/Scarb.toml` fork config.
- Working public Sepolia RPCs with no key: `https://starknet-sepolia.drpc.org` and `https://api.zan.top/public/starknet-sepolia`. Both answer `starknet_chainId` = `0x534e5f5345504f4c4941` (SN_SEPOLIA).
- STRK20 Sepolia pool `0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91` (from the local strk20-privacy-sdk skill) exists on Sepolia: class hash `0x6d163f2b27df0f53c5b0d019366261ba8034af1bef949dee920a60fe58bcf83`.
- starknet.js 10.4.0: `units(amount, 'fri' | 'strk')` is the conversion helper. There is no `units.formatUnits`.
- Reclaim js-sdk 4.12.0 `toJsonString()` serializes applicationId, providerId, sessionId, context, signature, and options but NOT the application secret. Server-side `init` + `setContext` + `toJsonString` and browser-side `fromJsonString` is the safe pattern.
- Added `"target": "ES2020"` to tsconfig to fix Map iteration errors.
- Cairo tests: 4 passed (article_registry). tip_inbox has zero tests.
- No `.env.local`, no secrets available locally. Live Sepolia deploy, benchmark, Reclaim live proof, Gemini call, and two-wallet linkage analysis are all blocked on secrets.

## Research completed

- Read the existing app, README, API routes, components, Dockerfile, workflow, and environment setup.
- Read the local `strk20-privacy`, `strk20-wallet-api`, and `strk20-anonymizer-contracts` skills.
- Read current official Starknet Sepolia docs, Reclaim proof verification and replay guidance, the Starknet privacy SDK repository and docs, and the STRK20 private messaging RFP.
- `https://sdk.starknet.io/` did not return usable documentation.
- Cloned the official privacy repository to `/private/tmp/starknet-privacy-reference` and confirmed it does not publish a maintained public Sepolia pool address in the inspected files.

## Implemented

- Installed Scarb 2.14.0. The prior 2.10.1 did not satisfy Starknet Foundry 0.57.0.
- Added `contracts/article_registry`, an append-only registry with:
  - authorized publisher access control
  - deterministic article ID supplied as the approved digest
  - bounded UTF-8 byte lengths
  - persistent 31-byte felt chunks
  - paginated reads
  - discovery index and publication event
  - duplicate prevention
- Added `contracts/tip_inbox`, a draft STRK20 `privacy_invoke` helper that accepts ciphertext only from a pinned privacy pool. It is not deployed or enabled.
- Cairo build passes.
- Article registry tests pass: 4 passed, 0 failed.
- Updated `package.json` with Starknet Wallet API dependencies, Vitest, and scripts.
- Replaced `.env.example` with Sepolia-only, server-secret-safe configuration.
- Installed Node dependencies. The chosen tested Wallet API baseline is `starknet@10.4.0`, though npm now marks it superseded. Re-evaluate before final pinning.

## Done since 15:50 (all uncommitted on branch sepolia-rewrite)

- `npm run typecheck`, `npm run lint`, and `npm run build` all pass.
- `src/lib`: `types.ts` (ArticleDraft, OnchainArticle, PublishEstimate, PublishResult, CapabilitiesReport, IssuedCapability; tags removed because the contract does not store them), `onchain.ts` (fixed `units(x,'fri')`, leading-zero-safe `decodeText`, `ACCEPTED_ON_L2` confirmation before read-back, `ArticleValidationError` with field/size/max), `gemini.ts` (returns ArticleDraft, no confidence score, only provider name and field names go to Google, key sent via header), `session.ts` (+ `releasePublishCapability`, `cancelCapability`, `resetStoreForTests`, exported TTL constants), `request.ts` (IP-keyed rate limits, JSON helpers), `capabilities.ts` (live pool class-hash check, BOND_MISSING and TIP_MISSING lists, DEV_BYPASS_ACTIVE), `messages.ts`, `legacy.ts` (read-only IPFS CID reader), `client-session.ts`, `onchain-shared.ts` (browser byte counter). `pinata.ts` deleted.
- API routes: `verify/start` (server-created signed Reclaim request), `verify` (consume record, verifyProof, issue capability + recovery code), `recover`, `cancel`, `capabilities`, `bond` (GET status, POST always refuses), `tips` (always 503 with blockers), `interview`, `generate`, `publish/estimate`, `publish` (one-use, released on failure), `articles`, `articles/[id]`, `attestation` (tee:false, honest data flow).
- UI: `/` feed from Starknet, `/submit` overview with limits and live capability notices, `/submit/verify` (recovery code shown once, disclosed fields shown), `/submit/bond` (blocked or dev-bypass), `/submit/interview` (Gemini disclosure gate, chat, editor with byte counters, fee estimate, irreversible confirmation, confirmation screen with tx + read-back), `/submit/tip` (blocked with reasons), `/submit/recover`, `/article/[id]` (Starknet read with provenance panel; legacy CIDs render read-only from IPFS gateway).

## Done since (local milestone complete)

- Tests: `npm test` 40 passed (6 files), `snforge test` 12 passed (7 registry, 5 tip_inbox). typecheck, lint, build, check:dashes all green. See docs/TEST_REPORT.md for the raw output.
- Scripts (`scripts/*.mts`, run via `node --experimental-strip-types`): `check-sepolia` (read-only, works today), `deploy-sepolia`, `benchmark-articles`, `readback-verify`, `check-dashes.mjs`. package.json scripts wired.
- Public RPC default is zan.top. drpc.org answers curl but returns -32601 for getClassHashAt through starknet.js. Scarb fork URL updated.
- STRK20 Sepolia pool `get_fee_amount` = 2 STRK per private op. This undermines a 1 STRK private bond (fees exceed the bond). Documented in docs/COMPATIBILITY.md.
- CI: `.github/workflows/ci.yml` (web job, Cairo job, Sepolia read-only job). EigenCompute workflow deleted. Dockerfile has no build-time secrets and uses Node 22.
- Docs: README, docs/ARCHITECTURE.md (Mermaid), docs/THREAT_MODEL.md, docs/COMPATIBILITY.md, docs/MIGRATION.md, docs/MAINNET_CHECKLIST.md, docs/TEST_REPORT.md.
- Rendered pages verified from the standalone build. Known quirk: standalone server returns 200 for unknown article ids (body is the not-found page); `next start` returns 404.
- `src/app/article/[id]/loading.tsx` removed; article page uses static metadata.

## Current work

All local work is done and should be committed on `sepolia-rewrite` (check `git log`; if there is no commit yet, commit everything with the attribution trailer). Remaining items all need the user:

1. `gh auth login -h github.com`, then either push `sepolia-rewrite` to `RealAdii/sovereign-journalist` and open a PR, or create the new repository the user wanted and push there.
2. Secrets for live Sepolia work (see "Secrets and external blockers"). Then run in order: `npm run build:contracts`, `npm run deploy:sepolia`, set `NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS`, `npm run check:sepolia`, `npm run benchmark:sepolia`, `npm run readback:sepolia -- <id>`; paste the outputs into docs/TEST_REPORT.md and docs/COMPATIBILITY.md, and set the article size limit from the long-article measurement.
3. Reclaim credentials: run the live verify flow and a replay attempt (expect 410).
4. Optional: add Playwright end-to-end tests with `ALLOW_DEV_WITHOUT_PRIVATE_BOND=true` and a Gemini key.
5. Decide with the user whether to redesign the bond given the 2 STRK pool fee, or keep it blocked.

## Important compatibility detail

The installed `@reclaimprotocol/js-sdk` 4.12.0 exports `verifyProof(proof, allowAiWitness)` returning a boolean. It does not expose the newer docs' provider-version configuration overload. The implementation should:

- call `verifyProof(proof, false)`
- compare `proof.claimData.provider` with `RECLAIM_PROVIDER_ID`
- verify the signed context address and message against the server-created verification ID and challenge
- compare the Reclaim session ID if the proof context contains it
- consume the stored verification record before issuing a capability

## Commands

```bash
cd /Users/adithya/sovereign-journalist-sepolia
npm install
npm run typecheck
npm test
npm run build

cd contracts
scarb build
PATH=/opt/homebrew/opt/rustup/bin:$PATH snforge test
```

Scarb may need to run outside the filesystem sandbox because macOS system configuration access otherwise panics.

## Secrets and external blockers

Needed later for real Sepolia deployment and live tests:

- `STARKNET_SEPOLIA_RPC_URL`
- funded Sepolia publisher account address and private key
- `RECLAIM_APP_ID`, `RECLAIM_APP_SECRET`, and `RECLAIM_PROVIDER_ID`
- `GEMINI_API_KEY`
- optionally, a verified STRK20 Sepolia pool and proving or discovery endpoints
- GitHub CLI reauthentication for new remote repository creation

Do not request secrets until local implementation and tests are ready.

## Safety rules

- Never use mainnet configuration.
- Never log source text, credential values, wallet identifiers, tips, or raw proofs.
- Never silently substitute a public STRK transfer for the anonymous bond.
- Never claim TEE protection without verified hardware attestation.
- Scan all authored content for em dash and en dash characters before delivery.
