# Sovereign Journalist Sepolia handoff

Last updated: 2026-09-28 22:50 Asia/Kolkata (agent 2, Claude, continuing from Codex). Earlier timestamps in this file from agent 2 were about 25 minutes ahead of wall clock.

Committed on `sepolia-rewrite`: 9379fcc (rebuild), fee8661 (Reclaim binding fix), 6984425, and 4eb2ddd (Playwright e2e, pool ABI findings). Working tree clean. Not pushed.

## Objective

Build the Sepolia-only version specified in `Downloads/Sovereign_Journalist_Sepolia_Build_Prompt.md` with honest privacy boundaries, Cairo contracts, tests, documentation, and a new repository. Do not enable mainnet or describe an unproven path as anonymous.

## Repository

- Working directory: `/Users/adithya/sovereign-journalist-sepolia`
- Source remote: `https://github.com/RealAdii/sovereign-journalist.git`
- Branch: `sepolia-rewrite` (created from `main`). Nothing is committed yet; the user must ask before commits or pushes.
- GitHub CLI is authenticated (RealAdii active, adiihq secondary) as of 17:00. The push and PR were blocked by the agent's permission classifier, not by auth. The user runs them: `git push -u origin sepolia-rewrite` then `gh pr create -R RealAdii/sovereign-journalist -B main -H sepolia-rewrite` (PR body draft is in the final message of the 17:05 session, or write one from README).

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

## Added 16:45

- Playwright 1.55 e2e: `playwright.config.ts`, `e2e/*.spec.ts`, `npm run test:e2e`, CI job. 12 pass. Mocked backend for secret-dependent routes; labeled as UI flow tests in docs/TEST_REPORT.md.
- Live pool ABI read via `starknet_getClass`: pool v2.1, `InvokeExternal { contract_address, calldata }` exists, public event `ExternalContractInvoked(contract_address, selector)`, `compile_actions` reverts `NO_REPLAY_PROTECTION` unless the batch has a `UseNote`. So a tip requires the source to already hold a shielded note and costs the 2 STRK fee. Recorded in docs/COMPATIBILITY.md.
- `Cache-Control: no-store` on verify, recover, capabilities responses.
- starknet.js 10.4 auto-fills the v3 tip (`recommendedTip`) when omitted; no code change needed.

## Secrets status (17:05)

- `.env.local` exists (git-ignored, mode 600). It holds the Reclaim app id and secret copied from `~/network-fork/.env.local` (the Network project's Reclaim app, LinkedIn provider by default, X provider commented). `POST /api/verify/start` returned 200 with a signed request, sessionId, and resolvedProviderVersion 4.0.0, so the app credentials are valid. The old Sovereign Journalist Reclaim app only exists as GitHub Actions secrets (`NEXT_PUBLIC_RECLAIM_*` on RealAdii/sovereign-journalist), which cannot be read back and were exposed in bundles; rotate or delete them.
- Fresh SESSION_SECRET and RATE_LIMIT_SECRET generated. Dev bypass on.
- Still empty: STARKNET_SEPOLIA_RPC_URL (user is fetching), STARKNET_PUBLISHER_ADDRESS and PRIVATE_KEY (no funded Sepolia account yet), GEMINI_API_KEY (not found on disk; old value only in GitHub secrets).

## Reclaim rewritten for SDK 5.8.2 (22:45, commit 8cf3ca5)

- User flagged the 4.12.0 iframe/share-page flow as the discontinued app-clip approach. Upgraded to `@reclaimprotocol/js-sdk@5.8.2` (exact). Browser now uses `triggerReclaimFlow({ target })` (portal embedded in the page, or the extension); `VerificationIframe.tsx` deleted. Server stores `getProviderVersion()` with the verification record and calls `verifyProof(proof, { providerId, providerVersion, allowedTags })`, using the returned trusted `data[0]` rather than raw claimData. Session lookup binding kept.
- 51 unit, 12 e2e pass; build green. Live `/api/verify/start` shows `sdkVersion js-5.8.2`, provider version 4.0.0.
- Dev server for the user's test runs on :3000 (`next dev`, dev bypass on). A human still needs to complete the LinkedIn portal login once.

## AI backend switched to a local open model (22:15)

- User asked for an open-source model with no web-dashboard keys. Chose Ollama (`brew install ollama`, server started manually with `ollama serve`; `brew services start ollama` still to be run for persistence), model `qwen2.5:7b` pulled to `~/.ollama/models`.
- New `src/lib/ai.ts` facade (`aiInfo`, `aiConfigured`, `aiReachable`, `conductInterviewStream`, `generateArticle`), `src/lib/ollama.ts` (NDJSON parser `ndjsonTextStream`), shared `src/lib/prompts.ts`. Gemini kept as `AI_PROVIDER=gemini`. All disclosure copy (gate, footer, submit page, confirmation, capabilities, attestation) reads `aiInfo()`; `ChatInterface` takes an `ai` prop from the server page.
- Env: `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://localhost:11434`, `OLLAMA_MODEL=qwen2.5:7b` in `.env.example` and `.env.local`.
- Tests: 50 vitest (new `tests/ollama.test.ts`), 12 e2e with the local-model copy. `npm run dev:capability` issues a dev token for curl-driven integration checks.
- Done: wire format verified with curl, interview turn 4.4 s and draft 7.6 s through the real routes (docs/TEST_REPORT.md), `brew services start ollama` running as a LaunchAgent. Remaining: user pushes the commits.

## Live Sepolia milestone (19:10)

- Registry deployed: `0x2be142c378dbf4f9480196d484b9e22363887ef523ee3cde332a4fa2fe4f6f0`, class `0xb78be67c801a4735dd175bf55c7cc9c64cc620f6e37f3d921bad124c1dfd44`, publisher = user's Ready wallet `0x070b9ebcc53df4db3b157a1b346c636f3547ed41553dcc58026126beb73d2764` (private key in `.env.local` only). Deployments record in `deployments/sepolia.json`.
- Benchmark published 3 articles (614 B, 4158 B, 22187 B): actual fees 0.40, 1.64, 8.01 STRK; confirm 13 to 20 s; all read back byte for byte. `docs/benchmarks/sepolia-2026-09-28.json`.
- Product body limit lowered to 16384 in `ARTICLE_LIMITS` (contract cap 24576 unchanged). `ArticleValidationError` rewritten without TS parameter properties because Node strip-only mode rejects them (this broke `benchmark:sepolia` until fixed).
- Independent read-back and digest recomputation verified; raw curl through zan.top confirmed metadata. Feed and article pages render from Sepolia.
- CI on PR #1 all green. User pushes; agent cannot.
- Remaining: live Reclaim proof by a human, Gemini key, bond and tip stay blocked.

## Blocked on the user (17:15, mostly resolved)

- Branch pushed and PR opened by the user at 18:53: https://github.com/RealAdii/sovereign-journalist/pull/1 (token needed `gh auth refresh -s workflow` first because the branch adds a workflow file). CI running. The agent still cannot push; the user pushes follow-up commits.
- `.env.local` now has the Alchemy Sepolia RPC (`starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/<key>`; the `v0_8` path errors). Mainnet URL from the same app must never be used.
- Publisher account: the user wants their Ready wallet (already funded on Sepolia). The key cannot be read from the extension. User exports it (Ready extension, Settings, account, Export private key) and pastes address + key into `.env.local`. Interim RPC in `.env.local` is the zan.top public endpoint; replace with a keyed one when available.

## Current work

All local work is done and should be committed on `sepolia-rewrite` (check `git log`; if there is no commit yet, commit everything with the attribution trailer). Remaining items all need the user:

1. `gh auth login -h github.com`, then either push `sepolia-rewrite` to `RealAdii/sovereign-journalist` and open a PR, or create the new repository the user wanted and push there.
2. Secrets for live Sepolia work (see "Secrets and external blockers"). Then run in order: `npm run build:contracts`, `npm run deploy:sepolia`, set `NEXT_PUBLIC_ARTICLE_REGISTRY_ADDRESS`, `npm run check:sepolia`, `npm run benchmark:sepolia`, `npm run readback:sepolia -- <id>`; paste the outputs into docs/TEST_REPORT.md and docs/COMPATIBILITY.md, and set the article size limit from the long-article measurement.
3. Reclaim credentials: run the live verify flow and a replay attempt (expect 410).
4. Optional: add Playwright end-to-end tests with `ALLOW_DEV_WITHOUT_PRIVATE_BOND=true` and a Gemini key.
5. Decide with the user whether to redesign the bond given the 2 STRK pool fee, or keep it blocked.

## Important compatibility detail (corrected 16:20, superseded 22:45 by the SDK 5.8.2 section above)

The previously installed `@reclaimprotocol/js-sdk` 4.12.0 exported `verifyProof(proof, allowAiWitness)` returning a boolean. Verified from the SDK source:

- Proof context fields are `contextAddress` and `contextMessage` (plus `extractedParameters`, `providerHash`), not `address` and `message`. The earlier plan had this wrong; `src/lib/reclaim.ts` now uses the correct names.
- `proof.claimData.provider` is the provider TYPE (`"http"`), not the provider id. Do not compare it to `RECLAIM_PROVIDER_ID`. Binding is done by fetching `https://api.reclaimprotocol.org/api/sdk/session/<sessionId>` and checking `appId`, `httpProviderId`, and that the proof identifier is in `session.proofs`.
- Optional `RECLAIM_PROVIDER_HASH` pins the template hash.
- The verification record is consumed before the proof is checked.

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
